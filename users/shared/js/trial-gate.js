// ============================================================
// TRIAL GATE & PATH LOCKING SYSTEM — Dieng Cyber Coding Academy
// Membatasi akses akun Trial Gratis agar HANYA dapat membuka
// 1 jalur belajar yang dipilih saat pendaftaran.
// Jalur lain akan terkunci secara visual dan interaktif dengan
// modal ajakan upgrade ke paket belajar resmi.
// ============================================================

(function () {
  // 1. Injeksi Style UI untuk Kartu Terkunci, Banner Trial, dan Modal Upgrade
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    /* Banner Informasi Trial di Dashboard */
    .trial-dashboard-banner {
      background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
      border: 1.5px solid #a7f3d0;
      border-radius: 16px;
      padding: 16px 22px;
      margin: 18px 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      box-shadow: 0 4px 16px rgba(5, 150, 105, 0.08);
      animation: tbSlideDown 0.3s ease-out;
    }
    .tdb-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .tdb-icon {
      width: 46px;
      height: 46px;
      border-radius: 12px;
      background: #059669;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35rem;
      flex-shrink: 0;
      box-shadow: 0 4px 10px rgba(5, 150, 105, 0.25);
    }
    .tdb-title {
      font-size: 0.98rem;
      font-weight: 800;
      color: #065f46;
      line-height: 1.25;
    }
    .tdb-desc {
      font-size: 0.84rem;
      color: #047857;
      margin-top: 3px;
    }
    .tdb-btn {
      background: #059669;
      color: #ffffff !important;
      padding: 9px 20px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 700;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2);
    }
    .tdb-btn:hover {
      background: #047857;
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(5, 150, 105, 0.3);
    }

    /* Badge Jalur Trial Aktif */
    .tg-trial-active-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #059669;
      color: #ffffff;
      font-size: 0.68rem;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 9999px;
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 2;
      box-shadow: 0 2px 6px rgba(5, 150, 105, 0.3);
      letter-spacing: 0.02em;
    }

    /* Kartu Jalur Terkunci (Locked Cards) */
    .tg-card.trial-locked,
    .jcard.trial-locked,
    .pcard.trial-locked {
      opacity: 0.58 !important;
      filter: grayscale(45%) !important;
      position: relative !important;
      cursor: pointer !important;
      border: 1.5px dashed #cbd5e1 !important;
      background: #f8fafc !important;
      transition: all 0.22s ease !important;
    }
    .tg-card.trial-locked:hover,
    .jcard.trial-locked:hover,
    .pcard.trial-locked:hover {
      opacity: 0.88 !important;
      border-color: #059669 !important;
      transform: translateY(-2px) !important;
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08) !important;
    }
    .tg-card.trial-locked .tg-status,
    .jcard.trial-locked .go,
    .pcard.trial-locked .go {
      background: #f1f5f9 !important;
      color: #64748b !important;
      font-weight: 700 !important;
    }
    .trial-lock-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      background: #334155;
      color: #ffffff;
      font-size: 0.68rem;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      z-index: 2;
      letter-spacing: 0.02em;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    /* Tombol Banner Terkunci */
    .tb-btn.trial-locked-banner-btn {
      background: #64748b !important;
      color: #f1f5f9 !important;
      cursor: pointer !important;
      border: 1px dashed #cbd5e1 !important;
      box-shadow: none !important;
    }
    .tb-btn.trial-locked-banner-btn:hover {
      background: #475569 !important;
      transform: none !important;
    }

    /* Modal Ajakan Upgrade yang Elegan */
    .trial-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(4px);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: tmFadeIn 0.2s ease;
    }
    .trial-modal-box {
      background: #ffffff;
      border-radius: 20px;
      max-width: 480px;
      width: 100%;
      padding: 32px 28px;
      text-align: center;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.22);
      animation: tmScaleUp 0.25s ease;
      position: relative;
    }
    .trial-modal-close-x {
      position: absolute;
      top: 16px;
      right: 18px;
      background: transparent;
      border: none;
      font-size: 1.4rem;
      color: #94a3b8;
      cursor: pointer;
      line-height: 1;
    }
    .trial-modal-close-x:hover {
      color: #334155;
    }
    .tmb-icon {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: #ecfdf5;
      color: #059669;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      margin: 0 auto 18px;
      border: 2px solid #a7f3d0;
    }
    .tmb-title {
      font-size: 1.25rem;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 10px;
    }
    .tmb-text {
      font-size: 0.92rem;
      color: #475569;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .tmb-highlight {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 14px;
      margin: 12px 0;
      font-size: 0.88rem;
      color: #065f46;
      font-weight: 700;
    }
    .tmb-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .tmb-btn-upgrade {
      background: #059669;
      color: #ffffff !important;
      padding: 13px 20px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.96rem;
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s, transform 0.15s;
      box-shadow: 0 4px 14px rgba(5, 150, 105, 0.28);
    }
    .tmb-btn-upgrade:hover {
      background: #047857;
      transform: translateY(-1px);
    }
    .tmb-btn-wa {
      background: #f8fafc;
      color: #334155 !important;
      padding: 11px 20px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.88rem;
      text-decoration: none;
      border: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .tmb-btn-wa:hover {
      background: #e2e8f0;
    }
    .tmb-btn-close {
      background: transparent;
      color: #64748b;
      padding: 8px 12px;
      border: none;
      font-size: 0.84rem;
      cursor: pointer;
      font-weight: 600;
    }
    .tmb-btn-close:hover {
      color: #0f172a;
    }

    @keyframes tbSlideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes tmFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes tmScaleUp {
      from { transform: scale(0.92); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(styleEl);

  // 2. Definisi Modul TrialGate
  const TrialGate = {
    // Cek apakah user saat ini berstatus siswa Trial Gratis
    isActive: function () {
      return localStorage.getItem("trial_active") === "true";
    },

    getCourse: function () {
      return localStorage.getItem("trial_course") || "Kelas Trial Gratis";
    },

    getTrackId: function () {
      return localStorage.getItem("trial_track_id") || "";
    },

    getGrade: function () {
      return localStorage.getItem("trial_grade") || "";
    },

    // Evaluasi apakah jalur / tahap tertentu boleh diakses siswa trial
    isPathAllowed: function (grade, pathOrTahapId) {
      if (!this.isActive()) return true; // Siswa reguler bebas membuka semua jalur

      const myGrade = this.getGrade();
      const myTrack = this.getTrackId();

      // Jika jenjang berbeda dari jenjang trial yang didaftarkan -> Terkunci
      if (grade && myGrade && grade !== myGrade) {
        return false;
      }

      if (!myTrack) return true;

      // 🎒 Jenjang SD
      if (myTrack === "sd_basic") {
        // Hanya boleh Tahap 1 Basic (p1 sampai p5)
        return pathOrTahapId === "basic" || ["p1", "p2", "p3", "p4", "p5"].includes(pathOrTahapId);
      }
      if (myTrack === "sd_explore_game") {
        // Hanya boleh game 2D di Tahap 2 (p6, p7)
        return ["p6", "p7"].includes(pathOrTahapId) || pathOrTahapId === "explore";
      }
      if (myTrack === "sd_explore_3d") {
        // Hanya boleh 3D Roblox (p8)
        return pathOrTahapId === "p8" || pathOrTahapId === "explore";
      }
      if (myTrack === "sd_explore_web") {
        // Hanya boleh Web Dev (p9)
        return pathOrTahapId === "p9" || pathOrTahapId === "explore";
      }

      // 🎮 Jenjang SMP
      if (myTrack === "smp_python") {
        // Hanya boleh jalur python
        return pathOrTahapId === "python" || String(pathOrTahapId).startsWith("py");
      }
      if (myTrack === "smp_ai") {
        // Hanya boleh jalur AI & Creative Tech
        return pathOrTahapId === "ai" || String(pathOrTahapId).startsWith("ai");
      }
      if (myTrack === "smp_gamedev3d") {
        // Hanya boleh Game Dev 3D (d3)
        return pathOrTahapId === "d3" || String(pathOrTahapId).startsWith("d");
      }

      // 💻 Jenjang SMA / SMK
      if (myTrack === "smk_algo") {
        return pathOrTahapId === "pl" || String(pathOrTahapId).startsWith("pl");
      }
      if (myTrack === "smk_web") {
        return pathOrTahapId === "wb" || String(pathOrTahapId).startsWith("wb");
      }
      if (myTrack === "smk_data") {
        return pathOrTahapId === "da" || String(pathOrTahapId).startsWith("da");
      }

      return true;
    },

    // Tampilkan Popup Modal Ajakan Upgrade
    showLockModal: function (lockedName) {
      const existing = document.querySelector(".trial-modal-overlay");
      if (existing) existing.remove();

      const currentCourse = this.getCourse();
      const modal = document.createElement("div");
      modal.className = "trial-modal-overlay";
      modal.innerHTML = `
        <div class="trial-modal-box">
          <button type="button" class="trial-modal-close-x" id="btnTrialX" title="Tutup">×</button>
          <div class="tmb-icon">🔒</div>
          <h3 class="tmb-title">Jalur Belajar Terkunci</h3>
          <p class="tmb-text">
            Saat ini kamu terdaftar di <strong>Kelas Trial Gratis</strong> untuk:
          </p>
          <div class="tmb-highlight">
            ⭐ ${currentCourse}
          </div>
          <p class="tmb-text" style="font-size: 0.88rem; margin-top: 6px;">
            Jalur <strong>${lockedName || "ini"}</strong> dan puluhan materi proyek lainnya dapat kamu buka lengkap dengan berlangganan Paket Belajar Resmi Dieng Cyber.
          </p>
          <div class="tmb-actions">
            <a href="/index.html#paket" class="tmb-btn-upgrade">
              <span>Buka Semua Jalur Belajar</span>
              <span>→</span>
            </a>
            <a href="https://wa.me/6281222334455?text=Halo%20Admin%20Dieng%20Cyber,%20saya%20tertarik%20upgrade%20dari%20kelas%20trial%20ke%20paket%20belajar%20lengkap" target="_blank" rel="noopener noreferrer" class="tmb-btn-wa">
              <span>💬 Konsultasi via WhatsApp</span>
            </a>
            <button type="button" class="tmb-btn-close" id="btnTrialClose">Lanjutkan Belajar Jalur Trial</button>
          </div>
        </div>
      `;

      const closeModal = () => modal.remove();
      modal.querySelector("#btnTrialX").addEventListener("click", closeModal);
      modal.querySelector("#btnTrialClose").addEventListener("click", closeModal);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });

      document.body.appendChild(modal);
    },

    // Terapkan pembatasan & kuncian pada halaman Dashboard
    applyDashboardLocks: function (currentGrade) {
      if (!this.isActive()) return;

      const gradeArea = document.getElementById("tahapArea");
      if (!gradeArea) return;

      // 1. Tampilkan Banner Trial di atas daftar tahap jika belum ada
      let banner = document.getElementById("trialDashboardBanner");
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "trialDashboardBanner";
        banner.className = "trial-dashboard-banner";
        banner.innerHTML = `
          <div class="tdb-left">
            <div class="tdb-icon">🎓</div>
            <div>
              <div class="tdb-title">⭐ Akun Kelas Trial Gratis: <b>${this.getCourse()}</b></div>
              <div class="tdb-desc">Kamu memiliki akses penuh ke 1 jalur belajar ini. Jalur lainnya terkunci selama masa trial.</div>
            </div>
          </div>
          <div class="tdb-right">
            <a href="/index.html#paket" class="tdb-btn">Buka Semua Jalur Belajar 🚀</a>
          </div>
        `;
        gradeArea.parentNode.insertBefore(banner, gradeArea);
      }

      // 2. Periksa semua kartu jalur di dalam tahapArea
      const cards = gradeArea.querySelectorAll(".tg-card, .jcard, .pcard");
      cards.forEach((card) => {
        let pathId = "";
        const href = card.getAttribute("href") || "";
        const matchP = href.match(/[?&]p=([^&]+)/);
        if (matchP) pathId = matchP[1];
        if (!pathId && card.dataset.p) pathId = card.dataset.p;

        const isAllowed = this.isPathAllowed(currentGrade, pathId);
        const cardTitle = card.querySelector("h3") ? card.querySelector("h3").textContent : "Jalur ini";

        if (isAllowed) {
          // Beri badge khusus jalur trial aktif jika belum ada
          if (!card.querySelector(".tg-trial-active-badge")) {
            const badge = document.createElement("span");
            badge.className = "tg-trial-active-badge";
            badge.innerHTML = "⭐ Jalur Pilihanmu";
            card.style.position = "relative";
            card.appendChild(badge);
          }
        } else {
          // Kunci kartu
          card.classList.add("trial-locked");
          if (!card.querySelector(".trial-lock-badge")) {
            const lockBadge = document.createElement("span");
            lockBadge.className = "trial-lock-badge";
            lockBadge.innerHTML = "🔒 Terkunci";
            card.appendChild(lockBadge);
          }

          // Override interaksi klik untuk menampilkan modal upgrade
          card.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            TrialGate.showLockModal(cardTitle);
          }, true);
        }
      });

      // 3. Periksa tombol banner tahap (misal: "Mulai Petualangan →" di Tahap 2 SD)
      const bannerBtns = gradeArea.querySelectorAll(".tb-btn");
      bannerBtns.forEach((btn) => {
        const href = btn.getAttribute("href") || "";
        const matchT = href.match(/[?&]t=([^&]+)/);
        const tahapId = matchT ? matchT[1] : "";

        if (tahapId) {
          const isAllowed = this.isPathAllowed(currentGrade, tahapId);
          if (!isAllowed) {
            btn.classList.add("trial-locked-banner-btn");
            btn.innerHTML = "🔒 Terkunci (Akun Trial)";
            btn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              TrialGate.showLockModal("Tahap Belajar Ini");
            }, true);
          }
        }
      });
    },

    // Guard untuk halaman belajar (SD/belajar.html, SMP/belajar-smp.html, SMK/belajar-smk.html)
    guardStudyPage: function (pageGrade) {
      if (!this.isActive()) return;

      const myGrade = this.getGrade();
      const params = new URLSearchParams(window.location.search);
      const pathParam = params.get("p") || "";
      const tahapParam = params.get("t") || "";
      const queryId = pathParam || tahapParam;

      // Cek apakah halaman ini atau path ini boleh diakses
      const isAllowed = (pageGrade === myGrade) && (!queryId || this.isPathAllowed(pageGrade, queryId));

      if (!isAllowed) {
        // Tampilkan pesan & alihkan siswa kembali ke jalur trial yang valid
        const myCourse = this.getCourse();
        document.body.innerHTML = `
          <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; font-family: sans-serif; padding: 24px;">
            <div style="background: #ffffff; border-radius: 18px; max-width: 480px; width: 100%; padding: 36px 28px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
              <div style="font-size: 3rem; margin-bottom: 14px;">🔒</div>
              <h2 style="font-size: 1.35rem; color: #0f172a; margin-bottom: 10px; font-weight: 800;">Jalur Ini Terkunci untuk Akun Trial</h2>
              <p style="font-size: 0.92rem; color: #64748b; line-height: 1.6; margin-bottom: 22px;">
                Akun trial Anda terdaftar untuk: <br>
                <strong style="color: #059669; font-size: 1rem;">${myCourse}</strong>
              </p>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <a href="/dashboard.html" style="background: #059669; color: #ffffff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 0.92rem;">
                  ← Kembali ke Ruang Belajar Trial
                </a>
                <a href="/index.html#paket" style="background: #f1f5f9; color: #334155; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 0.92rem;">
                  Lihat Paket Belajar Lengkap
                </a>
              </div>
            </div>
          </div>
        `;
      }
    }
  };

  window.TrialGate = TrialGate;
})();
