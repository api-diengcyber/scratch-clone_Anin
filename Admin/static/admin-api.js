/*
 * Klien API Admin.
 * Memakai token sesi yang sama dengan portal murid (localStorage.authToken).
 * Token tidak pernah dikirim ke plugin; file ini hanya untuk halaman Admin.
 */
(function () {
  "use strict";

  const TOKEN_KEY = "authToken";

  function clearAuth() {
    for (const key of ["authToken", "isLoggedIn", "username", "email", "scratch_user"]) {
      try { localStorage.removeItem(key); } catch (_) {}
    }
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (_) { return ""; }
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const raw = options.rawBody !== undefined; // unggah file mentah (ZIP plugin), bukan JSON
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (raw) headers["Content-Type"] = options.contentType || "application/octet-stream";
    const authToken = token();
    if (authToken) headers.Authorization = "Bearer " + authToken;

    let response;
    try {
      response = await fetch(path, {
        method: options.method || "GET",
        headers,
        body: raw ? options.rawBody : (options.body === undefined ? undefined : JSON.stringify(options.body)),
        cache: "no-store"
      });
    } catch (_) {
      const err = new Error("Tidak dapat terhubung ke server.");
      err.status = 0;
      throw err;
    }

    let data = null;
    try { data = await response.json(); } catch (_) {}

    if (response.status === 401) {
      clearAuth();
      if (!/\/index\.html?$/.test(location.pathname) && location.pathname !== "/") {
        location.replace("/index.html");
      }
    }

    // Akun baru wajib ganti password sebelum memakai API lain.
    if (response.status === 403 && data && data.code === "PASSWORD_CHANGE_REQUIRED") {
      if (!/\/ganti-password\.html?$/.test(location.pathname)) {
        location.replace("/ganti-password.html");
      }
    }

    if (!response.ok || (data && data.ok === false)) {
      const err = new Error((data && data.message) || `Permintaan gagal (HTTP ${response.status}).`);
      err.status = response.status;
      err.code = data && data.code;
      err.details = data && data.details;
      throw err;
    }
    return data || {};
  }

  function query(params = {}) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
    }
    const text = qs.toString();
    return text ? `?${text}` : "";
  }

  window.DCAdminApi = Object.freeze({
    request,
    logout: () => { clearAuth(); location.replace("/index.html"); },
    me: () => request("/api/admin/me"),
    stats: () => request("/api/admin/stats"),
    activity: (limit = 5) => request("/api/admin/activity?limit=" + encodeURIComponent(limit)),
    users: (params = {}) => request("/api/admin/users" + query(params)),
    user: (id) => request("/api/admin/users/" + encodeURIComponent(id)),
    createUser: (body) => request("/api/admin/users", { method: "POST", body }),
    updateUser: (id, body) => request("/api/admin/users/" + encodeURIComponent(id), { method: "PATCH", body }),
    resetPassword: (id, body = {}) => request("/api/admin/users/" + encodeURIComponent(id) + "/reset-password", { method: "POST", body }),
    suspendUser: (id, body = {}) => request("/api/admin/users/" + encodeURIComponent(id) + "/suspend", { method: "POST", body }),
    revokeSessions: (id) => request("/api/admin/users/" + encodeURIComponent(id) + "/revoke-sessions", { method: "POST" }),
    deleteUser: (id) => request("/api/admin/users/" + encodeURIComponent(id), { method: "DELETE" }),
    curriculum: () => request("/api/admin/curriculum"),
    saveCurriculum: (body) => request("/api/admin/curriculum", { method: "PUT", body }),
    codeLab: (params = {}) => request("/api/admin/code-lab" + query(params)),
    codeLabItem: (id) => request("/api/admin/code-lab/" + encodeURIComponent(id)),
    createCodeLab: (body) => request("/api/admin/code-lab", { method: "POST", body }),
    updateCodeLab: (id, body) => request("/api/admin/code-lab/" + encodeURIComponent(id), { method: "PATCH", body }),
    deleteCodeLab: (id) => request("/api/admin/code-lab/" + encodeURIComponent(id), { method: "DELETE" }),
    notifications: (limit = 20) => request("/api/admin/notifications?limit=" + encodeURIComponent(limit)),
    readNotification: (id) => request("/api/admin/notifications/" + encodeURIComponent(id) + "/read", { method: "POST" }),
    readAllNotifications: () => request("/api/admin/notifications/read-all", { method: "POST" }),
    clearNotifications: () => request("/api/admin/notifications", { method: "DELETE" }),
    audit: (params = {}) => request("/api/admin/audit" + query(params)),
    plugins: () => request("/api/admin/plugins"),
    uploadPlugin: (file) => request("/api/admin/plugins/upload", { method: "POST", rawBody: file, contentType: "application/zip" }),
    pluginAction: (versionId, action, body = {}) => {
      if (!["approve", "reject", "publish", "rollback", "disable", "preview-ticket"].includes(action)) throw new Error("Aksi plugin tidak dikenal.");
      return request("/api/admin/plugins/" + encodeURIComponent(versionId) + "/" + action, { method: "POST", body });
    }
  });
})();
