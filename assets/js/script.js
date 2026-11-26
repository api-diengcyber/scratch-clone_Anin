/**
 * RUANG KKA — DIENG CYBER CODING ACADEMY
 * Frontend Master Script
 */

(function () {
  'use strict';

  // ============================================================
  // 1. DATA MASTER HARGA & PAKET KURIKULUM
  // ============================================================
  const PACKAGES = [
    // ------------------------------------------------------------
    // JENJANG SD (3 PAKET: Basic, Explore + Pilihan Track, Semua Paket)
    // ------------------------------------------------------------
    {
      id: 'sd_basic',
      name: 'SD Basic',
      grade: 'SD',
      age: 'Usia 6 – 12 Tahun',
      popular: false,
      monthlyPrice: 350000,
      desc: 'Pengenalan fondasi logika komputasi visual, Scratch block coding, dan animasi dongeng digital yang menyenangkan.',
      features: [
        '4x Sesi Live Zoom Interaktif / bulan',
        'Akses Penuh Scratch Visual Editor di Browser',
        'Modul Animasi Sederhana & Game 2D',
        'Bonus 500 Koin Reward Awal Siswa',
        'Laporan Perkembangan Bulanan ke WhatsApp Wali',
        'E-Sertifikat Kelulusan Modul Resmi'
      ],
      notIncluded: [
        'AI Tutor Asisten 24 Jam',
        'Pilihan Jalur Peminatan Lanjutan'
      ]
    },
    {
      id: 'sd_explore',
      name: 'SD Explore',
      grade: 'SD',
      age: 'Usia 8 – 12 Tahun',
      popular: true,
      hasTrackChoice: true,
      tracks: [
        'Game Development (2D Arcade)',
        '3D Design & Roblox World',
        'Website Development (Web Kreatif)'
      ],
      monthlyPrice: 450000,
      desc: 'Bebas memilih 1 fokus peminatan favorit: Game Dev, 3D & Roblox, atau Website Development sesuai bakat anak.',
      features: [
        '8x Sesi Live Zoom Bersama Mentor / bulan',
        'Pilihan Peminatan: Game Dev / 3D Roblox / Web Dev',
        'Akses Scratch, 3D Editor & Web Builder Pro',
        'AI Tutor Asisten Pintar 24 Jam',
        'Review & Penilaian Personal Projek oleh Mentor',
        'Akses Toko Reward: Gelar & Bingkai Avatar',
        'E-Sertifikat Kelulusan & Showcase Karya'
      ],
      notIncluded: [
        'Akses Multi-Jalur Sekaligus'
      ]
    },
    {
      id: 'sd_all',
      name: 'SD All-in-One (Semua Paket)',
      grade: 'SD',
      age: 'Usia 6 – 12 Tahun',
      popular: false,
      monthlyPrice: 600000,
      desc: 'Paket terlengkap untuk anak SD. Menguasai seluruh materi: Basic, Game Dev, 3D & Roblox, dan Website Development.',
      features: [
        '12x Sesi Live Zoom Intensif / bulan',
        'Akses Semua Materi SD (Basic, Game, 3D, Web)',
        'AI Tutor Asisten Pintar 24 Jam',
        'Review Proyek & Mentoring Portofolio Komprehensif',
        'Akses Semua Editor Koding Tanpa Batas',
        'Laporan Progres Lengkap ke WhatsApp Wali',
        'E-Sertifikat Kelulusan Komprehensif SD'
      ],
      notIncluded: []
    },

    // ------------------------------------------------------------
    // JENJANG SMP (4 PAKET: Python Start, AI & Creative Tech, Game Dev 3D Lanjutan, Semua Learning Path)
    // ------------------------------------------------------------
    {
      id: 'smp_python',
      name: 'Python Start (SMP)',
      grade: 'SMP',
      age: 'Usia 12 – 15 Tahun',
      popular: false,
      monthlyPrice: 550000,
      desc: 'Fondasi pemrograman teks nyata dengan Python, sintaks modern, percabangan, perulangan, dan pemecahan masalah algoritma.',
      features: [
        '8x Sesi Live Mentoring / bulan',
        'In-Browser Python Runner (Pyodide Web Worker)',
        'Modul Algoritma & Problem Solving Terstruktur',
        'AI Tutor Asisten Pintar 24 Jam',
        'Tugas Mandiri & Penilaian Mentor Personal',
        'E-Sertifikat Pemrograman Python Dasar'
      ],
      notIncluded: [
        'Modul AI Lanjutan & Game 3D'
      ]
    },
    {
      id: 'smp_ai',
      name: 'AI & Creative Tech (SMP)',
      grade: 'SMP',
      age: 'Usia 12 – 15 Tahun',
      popular: true,
      monthlyPrice: 600000,
      desc: 'Eksplorasi kecerdasan buatan, prompt engineering, integrasi model AI visual, dan perancangan bot interaktif.',
      features: [
        '8x Sesi Live Mentoring / bulan',
        'Praktik Nyata Generative AI & Model Terapan',
        'Pembuatan Aplikasi Chatbot & Asisten Cerdas',
        'AI Tutor Asisten Pintar 24 Jam',
        'Proyek Portofolio Teknologi AI Terkini',
        'E-Sertifikat AI & Creative Tech'
      ],
      notIncluded: [
        'Game Engine 3D Lanjutan'
      ]
    },
    {
      id: 'smp_game3d',
      name: 'Game Dev 3D Lanjutan (SMP)',
      grade: 'SMP',
      age: 'Usia 12 – 15 Tahun',
      popular: false,
      monthlyPrice: 650000,
      desc: 'Merancang game 3D interaktif, mekanik fisika objek, logika rintangan, level design, dan audio game dinamis.',
      features: [
        '8x Sesi Live Mentoring Bersama Mentor Game',
        'Akses 3D Studio & WebGL Game Environment',
        'Logika Fisika Game & Scripting Interaktif',
        'AI Tutor Asisten Pintar 24 Jam',
        'Showcase Karya Game Siap Main di Web',
        'E-Sertifikat 3D Game Developer'
      ],
      notIncluded: [
        'Pengolahan Data Python Lanjutan'
      ]
    },
    {
      id: 'smp_all',
      name: 'Semua Learning Path (SMP)',
      grade: 'SMP',
      age: 'Usia 12 – 15 Tahun',
      popular: false,
      monthlyPrice: 850000,
      desc: 'Akses seluruh jalur belajar SMP (Python Start + AI & Creative Tech + Game Dev 3D Lanjutan) dalam 1 paket terpadu.',
      features: [
        '12x Sesi Intensif Live Mentoring / bulan',
        'Akses Semua Materi SMP (Python, AI & Game 3D)',
        'Bimbingan Ujian Akhir & Persiapan Lomba/OSN',
        'AI Tutor Asisten Pintar 24 Jam Prioritas',
        'Review Portofolio Pribadi oleh Senior Mentor',
        'E-Sertifikat Komprehensif Jenjang SMP'
      ],
      notIncluded: []
    },

    // ------------------------------------------------------------
    // JENJANG SMA / SMK (4 PAKET: Python Lanjutan & Algo, Web Dev, Data & AI Terapan, Semua Learning Path)
    // ------------------------------------------------------------
    {
      id: 'smk_python_algo',
      name: 'Python Lanjutan & Algoritma (SMA/K)',
      grade: 'SMK',
      age: 'Usia 15 – 18+ Tahun',
      popular: false,
      monthlyPrice: 750000,
      desc: 'Struktur data (Stack, Queue, Tree), algoritma pencarian & sorting, Object-Oriented Programming (OOP), dan otomasi.',
      features: [
        '8x Sesi Live Code Review Mendalam / bulan',
        'Struktur Data Kompleks & Efisiensi Algoritma',
        'Object-Oriented Programming (OOP) Terapan',
        'AI Tutor Asisten Pintar 24 Jam',
        'Latihan Soal Algoritma Standar Kompetisi/Kerja',
        'E-Sertifikat Python & Algoritma Lanjutan'
      ],
      notIncluded: [
        'Fullstack Web Framework & Database'
      ]
    },
    {
      id: 'smk_webdev',
      name: 'Web Development (SMA/K)',
      grade: 'SMK',
      age: 'Usia 15 – 18+ Tahun',
      popular: true,
      monthlyPrice: 800000,
      desc: 'Fullstack Web Development: Frontend modern responsif, Backend REST API, database SQLite/MySQL, dan deployment cloud.',
      features: [
        '8x Sesi Intensif Fullstack Web / bulan',
        'HTML5, Modern CSS/Tailwind, JavaScript Modern',
        'REST API, Backend Server & SQLite Database',
        'AI Tutor Asisten Pintar 24 Jam',
        'Deployment Web Siap Akses & Repository GitHub',
        'E-Sertifikat Fullstack Web Developer'
      ],
      notIncluded: [
        'Analisis Big Data & Machine Learning'
      ]
    },
    {
      id: 'smk_data_ai',
      name: 'Data & AI Terapan (SMA/K)',
      grade: 'SMK',
      age: 'Usia 15 – 18+ Tahun',
      popular: false,
      monthlyPrice: 850000,
      desc: 'Pengolahan dataset, analisis data statistik dengan Python/Pandas, visualisasi grafik, dan implementasi machine learning.',
      features: [
        '8x Sesi Intensif Data & AI Terapan / bulan',
        'Pengolahan Data dengan Pandas & NumPy',
        'Visualisasi Data Interaktif & Dashboard Analisis',
        'Machine Learning Terapan & Model AI Prediktif',
        'AI Tutor Asisten Pintar 24 Jam',
        'E-Sertifikat Data Science & AI Terapan'
      ],
      notIncluded: [
        'Fullstack Database Deployment'
      ]
    },
    {
      id: 'smk_all',
      name: 'Semua Learning Path (SMA/K)',
      grade: 'SMK',
      age: 'Usia 15 – 18+ Tahun',
      popular: false,
      monthlyPrice: 1150000,
      desc: 'Jalur karir industri terlengkap (Python Lanjutan, Fullstack Web Dev, dan Data & AI Terapan) untuk persiapan kerja atau kuliah IT.',
      features: [
        '12x Sesi Intensif + Code Review Standar Industri',
        'Akses Semua Materi SMA/SMK (Python, Web, Data/AI)',
        'Portofolio Standar Industri di GitHub & Live URL',
        'Bimbingan Persiapan Karir, Magang, & Portofolio',
        'AI Tutor Asisten Pintar 24 Jam Prioritas',
        'Sertifikat Kompetensi Industri Dieng Cyber'
      ],
      notIncluded: []
    }
  ];

  // Diskon per siklus durasi
  const BILLING_CYCLES = {
    1: { label: '1 Bulan', months: 1, discount: 0, tag: '' },
    3: { label: '3 Bulan', months: 3, discount: 0.10, tag: 'Hemat 10%' },
    6: { label: '6 Bulan', months: 6, discount: 0.20, tag: 'Hemat 20%' },
    12: { label: '1 Tahun', months: 12, discount: 0.25, tag: 'Hemat 25%' }
  };

  // Kode promo terverifikasi
  const PROMO_CODES = {
    'HEMAT10': { type: 'percent', value: 0.10, label: 'Diskon Tambahan 10%' },
    'SD25K': { type: 'fixed', value: 25000, label: 'Potongan Tunai Rp 25.000' },
    'DIENGCYBER': { type: 'percent', value: 0.15, label: 'Diskon Spesial Dieng 15%' },
    'RUANGKKA': { type: 'fixed', value: 50000, label: 'Voucher New Student Rp 50.000' }
  };

  // State
  let currentBillingCycle = 3; // Default 3 Bulan (paling disukai)
  let currentGradeFilter = 'ALL';
  let activePromo = null;
  const selectedTracks = {}; // Menyimpan pilihan track untuk paket yang memiliki track choice (cth: sd_explore)

  // Format Mata Uang Rupiah
  function formatRupiah(amount) {
    return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
  }

  // ============================================================
  // 2. THEME CONTROLLER
  // ============================================================
  function initTheme() {
    const savedTheme = localStorage.getItem('dc-theme') || 'light';
    applyTheme(savedTheme);

    const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      });
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('dc-theme', theme);
  }

  // ============================================================
  // 3. RENDER PRICING CARDS
  // ============================================================
  function renderPricingCards() {
    const container = document.getElementById('pricingCardsGrid');
    if (!container) return;

    const cycleInfo = BILLING_CYCLES[currentBillingCycle];
    const filtered = PACKAGES.filter(pkg => {
      if (currentGradeFilter === 'ALL') return true;
      if (currentGradeFilter === 'SD') return pkg.grade === 'SD';
      if (currentGradeFilter === 'SMP') return pkg.grade === 'SMP';
      if (currentGradeFilter === 'SMK') return pkg.grade === 'SMK';
      return true;
    });

    container.innerHTML = filtered.map(pkg => {
      const originalMonthly = pkg.monthlyPrice;
      const discountedMonthly = originalMonthly * (1 - cycleInfo.discount);
      const totalAmount = discountedMonthly * cycleInfo.months;
      const savingsTotal = (originalMonthly * cycleInfo.months) - totalAmount;

      // Track choice markup for SD Explore
      let trackChoiceHtml = '';
      if (pkg.hasTrackChoice && pkg.tracks && pkg.tracks.length > 0) {
        if (!selectedTracks[pkg.id]) {
          selectedTracks[pkg.id] = pkg.tracks[0];
        }
        trackChoiceHtml = `
          <div class="track-selection-box">
            <div class="track-selection-label">
              <i class="fa-solid fa-compass" style="color: var(--primary);"></i>
              <span>Pilih Fokus Peminatan Anak:</span>
            </div>
            <div class="track-options-group">
              ${pkg.tracks.map((track, idx) => `
                <label class="track-option-item">
                  <input type="radio" name="track_${pkg.id}" value="${track}" ${selectedTracks[pkg.id] === track ? 'checked' : ''} data-pkg-id="${pkg.id}">
                  <span>${track}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `;
      }

      return `
        <div class="pricing-card ${pkg.popular ? 'popular' : ''}" data-package-id="${pkg.id}">
          ${pkg.popular ? '<div class="popular-badge"><i class="fa-solid fa-fire"></i> Paling Diminati</div>' : ''}
          
          <div class="pricing-header">
            <span class="pricing-grade-badge">JENJANG ${pkg.grade} • ${pkg.age}</span>
            <h3 class="pricing-title">${pkg.name}</h3>
            <p class="pricing-desc">${pkg.desc}</p>
          </div>

          ${trackChoiceHtml}

          <div class="pricing-price-wrap">
            ${cycleInfo.discount > 0 ? `<div style="text-decoration: line-through; color: var(--text-muted); font-size: 0.85rem; font-weight: 600;">${formatRupiah(originalMonthly)} / bulan</div>` : ''}
            <div>
              <span class="pricing-amount">${formatRupiah(discountedMonthly)}</span>
              <span class="pricing-period">/ bulan</span>
            </div>
            ${cycleInfo.months > 1 ? `
              <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700; margin-top: 6px;">
                <i class="fa-solid fa-tags"></i> Total ${formatRupiah(totalAmount)} (${cycleInfo.label}) • Hemat ${formatRupiah(savingsTotal)}
              </div>
            ` : ''}
          </div>

          <div class="pricing-features-list">
            ${pkg.features.map(feat => `
              <div class="pricing-feature-item">
                <i class="fa-solid fa-circle-check"></i>
                <span>${feat}</span>
              </div>
            `).join('')}
            ${pkg.notIncluded.map(feat => `
              <div class="pricing-feature-item" style="color: var(--text-subtle); opacity: 0.7;">
                <i class="fa-regular fa-circle-xmark" style="color: var(--text-subtle);"></i>
                <span style="text-decoration: line-through;">${feat}</span>
              </div>
            `).join('')}
          </div>

          <button type="button" class="btn ${pkg.popular ? 'btn-primary' : 'btn-outline'} btn-block select-package-btn" data-package-id="${pkg.id}">
            <span>Pilih Paket Ini</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      `;
    }).join('');

    // Handle radio changes for tracks
    container.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const pkgId = e.target.getAttribute('data-pkg-id');
        selectedTracks[pkgId] = e.target.value;
      });
    });

    // Attach event listener ke tombol pilih paket
    container.querySelectorAll('.select-package-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pkgId = e.currentTarget.getAttribute('data-package-id');
        openCheckoutModal(pkgId);
      });
    });
  }

  // ============================================================
  // 4. BILLING & GRADE FILTER CONTROLS
  // ============================================================
  function initPricingControls() {
    // Billing Switcher Buttons
    const cycleBtns = document.querySelectorAll('.billing-cycle-btn');
    cycleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        cycleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentBillingCycle = parseInt(btn.getAttribute('data-cycle'), 10) || 1;
        renderPricingCards();
      });
    });

    // Grade Filter Pills
    const gradeBtns = document.querySelectorAll('.grade-filter-btn');
    gradeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        gradeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentGradeFilter = btn.getAttribute('data-grade') || 'ALL';
        renderPricingCards();
      });
    });
  }

  // ============================================================
  // 5. PLAYGROUND / INTERACTIVE DEMO TABS
  // ============================================================
  function initPlaygroundTabs() {
    const tabBtns = document.querySelectorAll('.playground-tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // Run Python Simulator Demo Button
    const runPyBtn = document.getElementById('runDemoPyBtn');
    const pyOutput = document.getElementById('demoPyOutput');
    if (runPyBtn && pyOutput) {
      runPyBtn.addEventListener('click', () => {
        runPyBtn.disabled = true;
        runPyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menjalankan Pyodide...';
        pyOutput.innerHTML = '<span style="color:#94a3b8;">Menyiapkan Python runtime worker...</span>';

        setTimeout(() => {
          runPyBtn.disabled = false;
          runPyBtn.innerHTML = '<i class="fa-solid fa-play"></i> Jalankan Kode';
          pyOutput.innerHTML = `
            <span style="color:#10b981; font-weight: bold;">[OUTPUT BERHASIL]</span><br>
            Robot Dieng Cyber menyapa: Halo Siswa Baru, selamat datang di Ruang KKA!<br>
            Skor koding siswa: 100/100 (Sempurna)<br>
            <span style="color:#0ea5e9;">Tutor AI: "Bagus sekali! Logika fungsi Python kamu sudah sangat tepat!"</span>
          `;
        }, 650);
      });
    }
  }

  // ============================================================
  // 6. FAQ ACCORDION
  // ============================================================
  function initFaq() {
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
      const questionBtn = item.querySelector('.faq-question');
      const answer = item.querySelector('.faq-answer');

      if (!questionBtn || !answer) return;

      questionBtn.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');

        // Tutup yang lain
        faqItems.forEach(other => {
          if (other !== item) {
            other.classList.remove('open');
            const otherAns = other.querySelector('.faq-answer');
            if (otherAns) otherAns.style.maxHeight = null;
          }
        });

        if (isOpen) {
          item.classList.remove('open');
          answer.style.maxHeight = null;
        } else {
          item.classList.add('open');
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      });
    });
  }

  // ============================================================
  // 7. CHECKOUT MODAL
  // ============================================================
  function initModal() {
    const modal = document.getElementById('checkoutModal');
    const closeBtn = document.getElementById('closeModalBtn');

    if (!modal) return;

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('open');
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
      }
    });
  }

  function openCheckoutModal(pkgId, monthsOverride, promoCodeOverride) {
    const modal = document.getElementById('checkoutModal');
    if (!modal) return;

    const pkg = PACKAGES.find(p => p.id === pkgId) || PACKAGES[0];
    const months = monthsOverride || currentBillingCycle;
    const cycle = BILLING_CYCLES[months] || BILLING_CYCLES[1];
    const promo = promoCodeOverride ? PROMO_CODES[promoCodeOverride] : activePromo;

    const baseMonthly = pkg.monthlyPrice;
    const subtotal = baseMonthly * months;
    const durDiscount = subtotal * cycle.discount;
    let promoDiscount = 0;
    if (promo) {
      if (promo.type === 'percent') promoDiscount = (subtotal - durDiscount) * promo.value;
      else if (promo.type === 'fixed') promoDiscount = Math.min(subtotal - durDiscount, promo.value);
    }
    const finalTotal = Math.max(0, subtotal - durDiscount - promoDiscount);

    // Selected track if applicable
    const chosenTrack = selectedTracks[pkg.id] || (pkg.tracks ? pkg.tracks[0] : null);

    // Populate modal fields
    const modalTitle = document.getElementById('modalPkgTitle');
    const modalGrade = document.getElementById('modalPkgGrade');
    const modalDuration = document.getElementById('modalPkgDuration');
    const modalTotal = document.getElementById('modalPkgTotal');
    const modalWaBtn = document.getElementById('modalWaBtn');
    const modalRegisterBtn = document.getElementById('modalRegisterBtn');

    if (modalTitle) modalTitle.textContent = pkg.name;
    if (modalGrade) {
      modalGrade.textContent = `Jenjang: ${pkg.grade} (${pkg.age})` + (chosenTrack ? ` • Peminatan: ${chosenTrack}` : '');
    }
    if (modalDuration) modalDuration.textContent = `Durasi: ${cycle.label} (${months} Bulan)`;
    if (modalTotal) modalTotal.textContent = formatRupiah(finalTotal);

    // WhatsApp Direct Link
    const waText = encodeURIComponent(
      `Halo Tim Dieng Cyber Coding Academy!\n\n` +
      `Saya tertarik untuk mendaftarkan anak saya di:\n` +
      `• Paket: ${pkg.name} (${pkg.grade})\n` +
      (chosenTrack ? `• Pilihan Peminatan: ${chosenTrack}\n` : '') +
      `• Durasi: ${cycle.label}\n` +
      (promo ? `• Kupon Promo: ${promoCodeOverride || activePromo.code}\n` : '') +
      `• Estimasi Biaya: ${formatRupiah(finalTotal)}\n\n` +
      `Mohon info ketersediaan jadwal mentoring dan cara pendaftaran selanjutnya. Terima kasih!`
    );

    if (modalWaBtn) {
      modalWaBtn.href = `https://wa.me/6281222334455?text=${waText}`;
    }

    if (modalRegisterBtn) {
      const trackParam = chosenTrack ? `&track=${encodeURIComponent(chosenTrack)}` : '';
      modalRegisterBtn.href = `users/checkout.html?package=${pkg.id}&duration=${months}${trackParam}`;
    }

    modal.classList.add('open');
  }

  // ============================================================
  // 8. MOBILE MENU TOGGLE
  // ============================================================
  function initMobileMenu() {
    const toggleBtn = document.getElementById('mobileMenuBtn');
    const navMenu = document.getElementById('navMenu');

    if (!toggleBtn || !navMenu) return;

    toggleBtn.addEventListener('click', () => {
      navMenu.classList.toggle('mobile-open');
      const isOpen = navMenu.classList.contains('mobile-open');
      toggleBtn.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
    });

    // Close on click link
    navMenu.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('mobile-open');
        toggleBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
      });
    });
  }

  // ============================================================
  // 9. NAVBAR SCROLLSPY & ACTIVE STATE CONTROLLER
  // ============================================================
  function initScrollSpy() {
    const navLinks = document.querySelectorAll('.nav-menu .nav-link');
    const sections = [];

    navLinks.forEach(link => {
      const hash = link.getAttribute('href');
      if (hash && hash.startsWith('#')) {
        const section = document.querySelector(hash);
        if (section) {
          sections.push({ hash, element: section, link });
        }
      }
    });

    if (sections.length === 0) return;

    function updateActiveNav() {
      // Offset mempertimbangkan navbar height (74px) + margin pandang
      const scrollPos = window.scrollY + 140;

      // Jika sudah di paling bawah halaman, aktifkan item menu terakhir
      const isBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 60);
      if (isBottom) {
        navLinks.forEach(l => l.classList.remove('active'));
        sections[sections.length - 1].link.classList.add('active');
        return;
      }

      let currentSec = sections[0];
      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        const top = sec.element.offsetTop;
        const height = sec.element.offsetHeight;
        if (scrollPos >= top && scrollPos < top + height) {
          currentSec = sec;
          break;
        } else if (scrollPos >= top) {
          currentSec = sec;
        }
      }

      navLinks.forEach(l => l.classList.remove('active'));
      if (currentSec && currentSec.link) {
        currentSec.link.classList.add('active');
      }
    }

    // Click handler untuk respons instan saat tombol menu diklik
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        const hash = link.getAttribute('href');
        if (hash && hash.startsWith('#')) {
          const target = document.querySelector(hash);
          if (target) {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            target.scrollIntoView({ behavior: 'smooth' });

            if (history.pushState) {
              history.pushState(null, null, hash);
            }
          }
        }
      });
    });

    window.addEventListener('scroll', updateActiveNav, { passive: true });
    // Jalankan sekali saat inisialisasi
    updateActiveNav();
  }

  // ============================================================
  // 10. NAVBAR SHADOW ON SCROLL
  // ============================================================
  function initNavbarScroll() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  // ============================================================
  // 11. INITIALIZATION
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    renderPricingCards();
    initPricingControls();
    initPlaygroundTabs();
    initFaq();
    initModal();
    initMobileMenu();
    initNavbarScroll();
    initScrollSpy();
  });

})();
