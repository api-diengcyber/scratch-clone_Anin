/*
 * Dieng Cyber Coding — Plugin Host SDK v1 (M5)
 * Add window.DCC_PLUGIN_ORIGIN before loading this file, for example:
 *   window.DCC_PLUGIN_ORIGIN = "https://plugins.example.com";
 * This SDK does not send the user's session token into the plugin iframe.
 */
(() => {
  "use strict";
  const SDK = 1;
  const MAX_MESSAGES_PER_WINDOW = 30;
  const MESSAGE_WINDOW_MS = 5000;
  const DEFAULT_TIMEOUT_MS = 90_000;
  const originFromConfig = () => {
    const raw = window.DCC_PLUGIN_ORIGIN;
    if (typeof raw !== "string" || !raw) throw new Error("window.DCC_PLUGIN_ORIGIN belum dikonfigurasi.");
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") throw new Error("Plugin runtime wajib menggunakan HTTPS di production.");
    if (u.pathname !== "/" || u.search || u.hash) throw new Error("DCC_PLUGIN_ORIGIN harus berupa origin saja.");
    // allow-same-origin hanya aman kalau iframe berasal dari origin terpisah.
    // Jika plugin dan aplikasi satu origin, plugin bisa melewati sandbox.
    if (u.origin === window.location.origin) throw new Error("Plugin runtime harus memakai origin terpisah dari aplikasi utama.");
    return u.origin;
  };
  function mount(container, plugin, options = {}) {
    if (!(container instanceof Element)) throw new TypeError("container harus Element.");
    if (!plugin || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(String(plugin.id || "")) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(plugin.version || ""))) throw new TypeError("Metadata plugin tidak valid.");
    const allowedOrigin = originFromConfig();
    const entry = String(plugin.entry || "index.html");
    if (entry.startsWith("/") || entry.includes("\\") || entry.includes(":") || entry.split("/").some(part => !part || part === "." || part === "..") || !entry.toLowerCase().endsWith(".html")) throw new Error("Entry plugin tidak aman.");
    const runtimeUrl = new URL(`/${plugin.id}/${plugin.version}/${entry}`, allowedOrigin);
    if (runtimeUrl.origin !== allowedOrigin || !runtimeUrl.pathname.startsWith(`/${plugin.id}/${plugin.version}/`)) throw new Error("Plugin URL melewati path yang diizinkan.");
    const iframe = document.createElement("iframe");
    iframe.title = String(plugin.name || plugin.id).slice(0, 100);
    iframe.src = runtimeUrl.href;
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    iframe.referrerPolicy = "no-referrer";
    iframe.loading = "lazy";
    iframe.style.cssText = "display:block;width:100%;height:100%;min-height:360px;border:0;background:#fff;border-radius:12px";
    iframe.setAttribute("allow", "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'");
    container.replaceChildren(iframe);

    let ready = false, complete = false, destroyed = false;
    let count = 0, windowStart = Date.now();
    const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS, 5 * 60_000));
    const timer = window.setTimeout(() => fail(new Error("Plugin melewati batas waktu.")), timeoutMs);
    function fail(error) { if (destroyed) return; options.onError?.(error); }
    function send(type, payload = {}) {
      if (!destroyed && iframe.contentWindow) iframe.contentWindow.postMessage({ sdk: SDK, type, ...payload }, allowedOrigin);
    }
    function onMessage(event) {
      if (destroyed || event.origin !== allowedOrigin || event.source !== iframe.contentWindow) return;
      const now = Date.now();
      if (now - windowStart > MESSAGE_WINDOW_MS) { windowStart = now; count = 0; }
      count++;
      if (count > MAX_MESSAGES_PER_WINDOW) { fail(new Error("Plugin mengirim terlalu banyak pesan.")); return; }
      const d = event.data;
      if (!d || typeof d !== "object" || d.sdk !== SDK || typeof d.type !== "string") return;
      if (d.type === "dcc:ready") {
        if (ready) return;
        ready = true;
        send("dcc:init", {
          taskId: String(options.taskId || "").slice(0, 128),
          pluginId: plugin.id,
          version: plugin.version,
          permissions: Array.isArray(plugin.permissions) ? plugin.permissions.filter(x => x === "progress:complete") : []
        });
        options.onReady?.();
        return;
      }
      if (d.type === "dcc:error") {
        fail(new Error(String(d.message || "Plugin melaporkan error.").slice(0, 300)));
        return;
      }
      if (d.type === "dcc:complete") {
        if (!ready || complete) return;
        const expectedTaskId = String(options.taskId || "");
        if (typeof d.taskId !== "string" || d.taskId !== expectedTaskId) return;
        if (!Number.isInteger(d.score) || d.score < 0 || d.score > 100) return;
        complete = true;
        options.onComplete?.({ taskId: expectedTaskId, score: d.score, pluginId: plugin.id, version: plugin.version, verified: false });
      }
    }
    function onLoad() { /* Plugin must explicitly send dcc:ready. */ }
    window.addEventListener("message", onMessage);
    iframe.addEventListener("load", onLoad);
    function destroy() {
      if (destroyed) return;
      send("dcc:dispose"); destroyed = true; window.clearTimeout(timer);
      window.removeEventListener("message", onMessage); iframe.removeEventListener("load", onLoad);
      iframe.src = "about:blank"; iframe.remove();
    }
    return { iframe, destroy, get ready() { return ready; }, get completed() { return complete; } };
  }
  window.DCCPluginHost = Object.freeze({ sdk: SDK, mount });
})();
