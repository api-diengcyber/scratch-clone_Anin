"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { extractZipSafely } = require("./plugin-zip");
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function makeZip(files){
  const locals=[],centrals=[];let offset=0;
  for(const [name,text] of Object.entries(files)){
    const nameBuf=Buffer.from(name),raw=Buffer.from(text),compressed=zlib.deflateRawSync(raw),crc=crc32(raw);
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(0x800,6);l.writeUInt16LE(8,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(compressed.length,18);l.writeUInt32LE(raw.length,22);l.writeUInt16LE(nameBuf.length,26);l.writeUInt16LE(0,28);locals.push(l,nameBuf,compressed);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(0x0314,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(nameBuf.length,28);c.writeUInt16LE(0,30);c.writeUInt16LE(0,32);c.writeUInt32LE((0o100644<<16)>>>0,38);c.writeUInt32LE(offset,42);centrals.push(c,nameBuf);offset+=l.length+nameBuf.length+compressed.length;
  }
  const cd=Buffer.concat(centrals),local=Buffer.concat(locals),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(Object.keys(files).length,8);e.writeUInt16LE(Object.keys(files).length,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(local.length,16);return Buffer.concat([local,cd,e]);
}
const manifest={id:"sample-game",name:"Sample Game",version:"1.0.0",sdk:1,entry:"index.html",category:{id:"learning-games",name:"Learning Games"},grades:["SMP"],permissions:["progress:complete"],network:{allow:[]}};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"dcc-plugin-test-"));
try {
  const valid=makeZip({"manifest.json":JSON.stringify(manifest),"index.html":"<!doctype html><html><head><meta charset=\"utf-8\"></head><body><h1>Sample</h1><script src=\"app.js\"></script></body></html>","app.js":"document.body.dataset.ready='true';"});
  const result=extractZipSafely(valid,path.join(dir,"valid"));
  assert.equal(result.manifest.id,"sample-game");assert.equal(result.manifest.entry,"index.html");assert.ok(fs.existsSync(path.join(dir,"valid","index.html")));
  const traversal=makeZip({"../evil.js":"alert(1)","manifest.json":JSON.stringify(manifest)});
  assert.throws(()=>extractZipSafely(traversal,path.join(dir,"invalid")),/Path ZIP tidak aman/);
  const invalidManifest=makeZip({"manifest.json":"{}","index.html":"<html></html>"});
  assert.throws(()=>extractZipSafely(invalidManifest,path.join(dir,"bad-manifest")),/manifest/);
  console.log("OK: plugin ZIP valid diterima; path traversal dan manifest invalid ditolak.");
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
