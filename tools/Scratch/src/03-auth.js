// ============================================================
// AUTHENTICATION
// ============================================================

const loginOverlay =
  document.getElementById("login-overlay");

const loginForm =
  document.getElementById("login-form");

const loginError =
  document.getElementById("login-error");

const userBadge =
  document.getElementById("user-badge");

const userDisplayName =
  document.getElementById("user-display-name");

// Lokasi dashboard dari tools/Scratch/. Ubah di sini kalau letak dashboard.html berbeda.
const DASHBOARD_URL = "../../dashboard/dashboard.html";

const logoutBtn =
  document.getElementById("logout-btn");


function checkAuth() {

  // Sesi dibuat oleh halaman login (../index.html)
  const isLoggedIn =
    localStorage.getItem("isLoggedIn") === "true";

  const savedUser =
    localStorage.getItem("username") ||
    localStorage.getItem("scratch_user");

  if (!isLoggedIn || !savedUser) {
    // Belum login -> kembali ke halaman login
    window.location.replace("/index.html");
    return;
  }

  state.currentUser = savedUser;

  if (userDisplayName) {
    userDisplayName.innerText = savedUser;
  }

  if (userBadge) {
    userBadge.style.display = "flex";
  }

  if (loginOverlay) {
    loginOverlay.classList.add("hidden");
  }
}


if (loginForm) {

  loginForm.addEventListener(
    "submit",
    (e) => {

      e.preventDefault();

      const username =
        document.getElementById("username");

      const password =
        document.getElementById("password");

      const usernameInput =
        username
          ? username.value.trim()
          : "";

      const passwordInput =
        password
          ? password.value.trim()
          : "";

      if (
        !usernameInput ||
        !passwordInput
      ) {

        if (loginError) {
          loginError.style.display =
            "block";
        }

        return;
      }

      localStorage.setItem(
        "scratch_user",
        usernameInput
      );

      state.currentUser =
        usernameInput;

      if (userDisplayName) {
        userDisplayName.innerText =
          usernameInput;
      }

      if (userBadge) {
        userBadge.style.display =
          "flex";
      }

      if (loginError) {
        loginError.style.display =
          "none";
      }

      if (loginOverlay) {
        loginOverlay.classList.add("hidden");
      }

      loginForm.reset();
    }
  );
}
if (logoutBtn) {

  if (new URLSearchParams(window.location.search).get("project")) logoutBtn.textContent = "← Project Akhir";
  else if (new URLSearchParams(window.location.search).get("dari")) logoutBtn.textContent = "← Kembali ke Task";   // 🚀 Mulai Praktik dari sebuah Task
  logoutBtn.addEventListener(
    "click",
    () => {
      // Kembali ke dashboard, sesi login tetap dipertahankan
      // (dibuka dari Project Akhir → kembali ke halaman project-nya)
      const qs = new URLSearchParams(window.location.search);
      const pj = qs.get("project") || qs.get("dari");
      if (pj && typeof state !== "undefined" && state.stacks.some(s => s && s.blocks && s.blocks.length) &&
          !confirm("Blok yang kamu susun belum tersimpan dan akan hilang kalau kamu kembali.\n\nSudah ambil foto atau screenshot hasilmu? Tekan OK untuk kembali.")) return;
      window.location.href = (pj && typeof LP !== "undefined" && LP.find(pj)) ? "/SD/belajar.html?task=" + pj : DASHBOARD_URL;
    }
  );
}

