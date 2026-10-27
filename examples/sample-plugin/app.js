"use strict";
(() => {
  const status = document.querySelector("#status");
  const button = document.querySelector("#complete");
  let taskId = null;
  // SDK 1 uses postMessage. The parent must validate event.origin and event.source.
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.sdk !== 1 || typeof data.type !== "string") return;
    if (data.type === "dcc:init") {
      taskId = typeof data.taskId === "string" ? data.taskId : null;
      status.textContent = taskId ? `Terhubung ke tugas ${taskId}.` : "Terhubung; belum ada task ID.";
      button.disabled = !taskId;
    } else if (data.type === "dcc:dispose") {
      button.disabled = true;
      status.textContent = "Plugin ditutup.";
    }
  });
  button.addEventListener("click", () => {
    if (!taskId) return;
    status.textContent = "Contoh tugas selesai. Hasil menunggu validasi aplikasi utama.";
    button.disabled = true;
    window.parent.postMessage({ sdk: 1, type: "dcc:complete", taskId, score: 100 }, "*");
  });
  window.parent.postMessage({ sdk: 1, type: "dcc:ready" }, "*");
})();
