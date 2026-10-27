"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, ".env") });
const express = require("express");
const Database = require("better-sqlite3");

const app = express();
app.disable("x-powered-by");
const PORT = Number(process.env.PLUGIN_PORT || 3001);
const PLUGIN_DIR = process.env.PLUGIN_DIR || (process.env.NODE_ENV === "production" ? "/data/plugins" : path.join(__dirname, "plugin-data"));
const LIVE_ROOT = path.join(PLUGIN_DIR, "live");
const QUARANTINE_ROOT = path.join(PLUGIN_DIR, "quarantine");
function parsePublicOrigin(raw, label) {
  if (!raw) throw new Error(`${label} wajib diisi (contoh: https://app.example.com).`);
  let u;
  try { u = new URL(raw); } catch { throw new Error(`${label} bukan URL yang valid.`); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${label} harus http(s).`);
  if (u.username || u.password || u.pathname !== "/" || u.search || u.hash) throw new Error(`${label} harus berupa origin saja, tanpa path/query/hash.`);
  if (process.env.NODE_ENV === "production" && u.protocol !== "https:") throw new Error(`${label} wajib HTTPS di production.`);
  return u.origin;
}
let APP_ORIGIN;
try {
  APP_ORIGIN = parsePublicOrigin(
    process.env.APP_PUBLIC_ORIGIN || process.env.FRONTEND_ORIGIN || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000"),
    "APP_PUBLIC_ORIGIN"
  );
} catch (e) {
  console.error("[plugin-runtime] " + e.message);
  process.exit(1);
}
const PREVIEW_SECRET = process.env.PLUGIN_PREVIEW_SECRET || "";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "database.sqlite");
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
db.pragma("busy_timeout = 5000");
fs.mkdirSync(LIVE_ROOT, { recursive: true });

const MIME = {
  ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8",
  ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".gif":"image/gif"
};
function safePath(root, parts) {
  if (!Array.isArray(parts) || parts.length === 0) parts = [];
  const cleaned=[];
  for (const raw of parts) {
    const p=String(raw || "");
    if (!p || p === "." || p === ".." || p.includes("\\") || p.includes("\0") || p.includes(":") || p.startsWith("/")) throw new Error("Invalid path");
    cleaned.push(p);
  }
  const base=path.resolve(root);
  const full=path.resolve(base,...cleaned);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("Path traversal");
  return full;
}
function parseManifest(root) {
  const file=path.join(root,"manifest.json");
  const m=JSON.parse(fs.readFileSync(file,"utf8"));
  return m;
}
function setSecurityHeaders(res, manifest, cacheMode) {
  const hosts = Array.isArray(manifest.network?.allow) ? manifest.network.allow : [];
  const connect = hosts.length ? hosts.map(h => `https://${h}`).join(" ") : "'none'";
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "media-src 'self'",
    `connect-src ${connect}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${APP_ORIGIN}`
  ].join("; "));
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Resource-Policy","cross-origin");
  res.setHeader("Cache-Control", cacheMode === "live" ? "public, max-age=31536000, immutable" : "no-store");
}
function sendAsset(req,res,root,rel,mode) {
  try {
    const manifest=parseManifest(root);
    const normalized=(rel && rel.length) ? rel : manifest.entry;
    const file=safePath(root,normalized.split("/"));
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return res.status(404).type("text/plain").send("Plugin asset not found");
    const ext=path.extname(file).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(MIME,ext)) return res.status(403).type("text/plain").send("Asset extension blocked");
    setSecurityHeaders(res,manifest,mode);
    res.type(MIME[ext]);
    return res.sendFile(file);
  } catch (e) { return res.status(400).type("text/plain").send("Invalid plugin path"); }
}
function verifyTicket(ticket) {
  if (!PREVIEW_SECRET || PREVIEW_SECRET.length < 32 || typeof ticket !== "string") return null;
  const dot=ticket.lastIndexOf("."); if(dot<1) return null;
  const payload=ticket.slice(0,dot), sig=ticket.slice(dot+1);
  const expected=crypto.createHmac("sha256",PREVIEW_SECRET).update(payload).digest("base64url");
  const a=Buffer.from(sig), b=Buffer.from(expected);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
  try { const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")); if(!data.uploadId || !Number.isFinite(data.exp) || data.exp<Date.now() || data.exp>Date.now()+6*60_000) return null; return data; } catch { return null; }
}
app.get("/health", (_req,res)=>res.json({ok:true,service:"plugin-runtime"}));
app.use((req,res,next)=>{
  let parts;
  try { parts=req.path.split("/").filter(Boolean).map(p=>decodeURIComponent(p)); }
  catch { return res.status(400).type("text/plain").send("Invalid URL encoding"); }
  if(parts[0]==="preview") {
    const data=verifyTicket(parts[1]);
    if(!data) return res.status(403).type("text/plain").send("Preview ticket invalid or expired");
    let row;
    try { row=db.prepare("SELECT plugin_id,version,manifest_json,quarantine_path,status FROM plugin_versions WHERE upload_id=?").get(data.uploadId); }
    catch { return res.status(503).type("text/plain").send("Plugin registry unavailable"); }
    if(!row || !["needs_review","approved"].includes(row.status)) return res.status(404).type("text/plain").send("Preview unavailable");
    const root=path.join(QUARANTINE_ROOT,row.quarantine_path,"files");
    return sendAsset(req,res,root,parts.slice(2).join("/"),"preview");
  }
  if(parts.length < 2) return res.status(404).type("text/plain").send("Plugin version URL required");
  const [pluginId,version,...asset] = parts;
  if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(pluginId) || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version)) return res.status(404).type("text/plain").send("Plugin version not found");
  let row;
  try { row=db.prepare("SELECT manifest_json FROM plugin_versions WHERE plugin_id=? AND version=? AND status='published'").get(pluginId,version); }
  catch { return res.status(503).type("text/plain").send("Plugin registry unavailable"); }
  if(!row) return res.status(404).type("text/plain").send("Published plugin not found");
  const root=path.join(LIVE_ROOT,pluginId,version);
  if(!fs.existsSync(root)) return res.status(404).type("text/plain").send("Published plugin files missing");
  return sendAsset(req,res,root,asset.join("/"),"live");
});
const server = app.listen(PORT,"0.0.0.0",()=>console.log(`Plugin runtime berjalan di port ${PORT}; live root: ${LIVE_ROOT}`));
server.on("error", (err) => {
  console.error("[plugin-runtime] gagal listen:", err.message);
  try { db.close(); } catch {}
  process.exit(1);
});
process.on("SIGTERM",()=>{ try{db.close();}finally{process.exit(0);} });
process.on("SIGINT",()=>{ try{db.close();}finally{process.exit(0);} });
