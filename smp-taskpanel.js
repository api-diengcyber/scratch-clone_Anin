(function () {

  const q = new URLSearchParams(location.search);
  const nid = q.get("smp");

  if (!nid) return;

  const load = (src, cb) => {
    const s = document.createElement("script");

    s.src = src;
    s.onload = cb;
    s.onerror = cb;

    document.head.appendChild(s);
  };

  load(
    "../jalur-data-smp.js?v=1",
    () => load("../jalur-data-smak.js?v=1", start)
  );

  const esc = (t) =>
    String(t).replace(
      /[&<>"]/g,
      (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
      }[m])
    );

  function start() {

    const tr =
      (window.LP_SMP || [])
        .concat(window.LP_SMAK || [])
        .find((t) =>
          t.nodes.some((n) => n.id === nid)
        );

    if (!tr) {
      console.warn(
        "SMPTaskPanel: jalur untuk node tidak ditemukan:",
        nid
      );
      return;
    }

    const node = tr.nodes.find(
      (n) => n.id === nid
    );

    if (!node || !Array.isArray(node.tasks) || !node.tasks.length) {
      console.warn(
        "SMPTaskPanel: task tidak ditemukan:",
        nid
      );
      return;
    }

    let ti = Math.min(
      Math.max(+q.get("t") || 0, 0),
      node.tasks.length - 1
    );

    let shut = false;

    // ============================================================
    // STYLE
    // ============================================================

    const st = document.createElement("style");

    st.textContent =
      ".smpP{" +
        "position:fixed;" +
        "top:64px;" +
        "right:12px;" +
        "width:290px;" +
        "max-height:76vh;" +
        "overflow:auto;" +
        "z-index:9000;" +
        "background:#161c47;" +
        "color:#e8ecff;" +
        "border:2px solid " + tr.c + ";" +
        "border-radius:18px;" +
        "padding:12px 14px;" +
        "font:14px/1.45 'Trebuchet MS',Arial,sans-serif;" +
        "box-shadow:0 10px 30px rgba(0,0,0,.4)" +
      "}" +

      ".smpP h4{" +
        "margin:2px 0 6px" +
      "}" +

      // Checkbox hanya visual.
      ".smpP label{" +
        "display:flex;" +
        "gap:8px;" +
        "margin:6px 0;" +
        "cursor:default;" +
        "user-select:none;" +
      "}" +

      ".smpP label input{" +
        "cursor:default;" +
        "pointer-events:none;" +
        "accent-color:#34c06f;" +
        "opacity:1;" +
      "}" +

      ".smpP label.done{" +
        "color:#5dff8a;" +
        "font-weight:700;" +
        "text-shadow:0 0 8px rgba(93,255,138,.18);" +
      "}" +

      ".smpP button,.smpP a{" +
        "border:0;" +
        "border-radius:10px;" +
        "padding:6px 10px;" +
        "background:#232b66;" +
        "color:#cbd3ff;" +
        "text-decoration:none;" +
        "font:inherit;" +
        "cursor:pointer;" +
      "}" +

      ".smpP button:disabled{" +
        "opacity:.45;" +
        "cursor:not-allowed;" +
      "}" +

      ".smpP .r{" +
        "display:flex;" +
        "gap:6px;" +
        "justify-content:space-between;" +
        "align-items:center;" +
        "margin-top:8px;" +
      "}" +

      ".smpP small{" +
        "opacity:.75;" +
      "}" +

      ".smpP.min{" +
        "width:auto;" +
        "padding:8px 12px;" +
      "}";

    document.head.appendChild(st);

    // ============================================================
    // PANEL
    // ============================================================

    const p = document.createElement("aside");

    p.className = "smpP";
    p.setAttribute("aria-label", "Task aktif");

    document.body.appendChild(p);

    // ============================================================
    // STORAGE
    // ============================================================

    const key = () =>
      "smpSteps_" + nid + "_" + ti;

    const get = () => {
      try {

        const value =
          JSON.parse(
            localStorage.getItem(key())
          );

        return Array.isArray(value)
          ? value
          : [];

      } catch (e) {

        return [];
      }
    };

    // ============================================================
    // DRAW
    // ============================================================

    function draw() {

      if (shut) {

        p.className = "smpP min";

        p.innerHTML =
          '<button data-o aria-label="Buka panel task">' +
            "📋 Task aktif" +
          "</button>";

        return;
      }

      p.className = "smpP";

      const k = node.tasks[ti];
      const c = get();

      const langkah =
        Array.isArray(k.langkah)
          ? k.langkah
          : [];

      p.innerHTML =
        '<div class="r">' +

          "<small>" +
            esc(node.title) +
          "</small>" +

          '<button data-c aria-label="Tutup panel">—</button>' +

        "</div>" +

        "<h4>" +
          "Task " +
          (ti + 1) +
          " dari " +
          node.tasks.length +
          ": " +
          esc(k.judul) +
        "</h4>" +

        langkah
          .map((l, i) =>

            '<label class="' + (c.includes(i) ? "done" : "") + '">' +

              '<input' +
                ' type="checkbox"' +
                ' data-i="' + i + '"' +
                ' aria-readonly="true"' +
                (
                  c.includes(i)
                    ? " checked"
                    : ""
                ) +
              ">" +
              

              "<span>" +
                "Langkah " +
                (i + 1) +
                ": " +
                esc(l) +
              "</span>" +

            "</label>"

          )
          .join("") +

        '<div class="r">' +

          '<button data-p' +
            (ti ? "" : " disabled") +
          ">◀</button>" +

          '<button data-n' +
            (
              ti < node.tasks.length - 1
                ? ""
                : " disabled"
            ) +
          ">▶</button>" +

          '<a href="../' +
            (
              tr.grade === "smak"
                ? "belajar-smk.html"
                : "belajar-smp.html"
            ) +
            "?p=" +
            tr.id +
          '">' +

            "← Jalur " +

            (
              tr.grade === "smak"
                ? "SMA/SMK"
                : "SMP"
            ) +

          "</a>" +

        "</div>";
    }

    // ============================================================
    // PANEL NAVIGATION
    // ============================================================

    p.addEventListener("click", (e) => {

      const b = e.target;

      // Tutup panel
      if (b.closest("[data-c]")) {

        shut = true;

        draw();

        const btn = p.querySelector("button");

        if (btn) {
          btn.focus();
        }

        return;
      }

      // Buka panel
      if (b.closest("[data-o]")) {

        shut = false;

        draw();

        return;
      }

      // Task sebelumnya
      if (
        b.closest("[data-p]") &&
        ti > 0
      ) {

        ti--;

        draw();

        return;
      }

      // Task berikutnya
      if (
        b.closest("[data-n]") &&
        ti < node.tasks.length - 1
      ) {

        ti++;

        draw();

        return;
      }
    });

    // ============================================================
    // AI TUTOR API
    // ============================================================
    //
    // TIDAK ADA "change" EVENT.
    //
    // Checkbox tidak pernah membaca klik user.
    // Perubahan checklist HANYA melalui setSteps().
    // ============================================================

    window.SMPTaskPanel = {

      // ----------------------------------------------------------
      // TASK AKTIF
      // ----------------------------------------------------------

      getTask() {

        const current =
          node.tasks[ti];

        return {
          nodeId: nid,

          taskIndex: ti,

          task: {
            judul:
              current.judul || "",

            langkah:
              Array.isArray(current.langkah)
                ? current.langkah
                : []
          }
        };
      },

      // ----------------------------------------------------------
      // STATE CHECKLIST
      // ----------------------------------------------------------

      getSteps() {
        return get();
      },

      // ----------------------------------------------------------
      // SATU-SATUNYA CARA MENGUBAH CHECKLIST
      // ----------------------------------------------------------
      //
      // Contoh:
      //
      // setSteps([true, false, true])
      //
      // Hasil:
      //
      // ✅ Langkah 1
      // ☐ Langkah 2
      // ✅ Langkah 3
      // ----------------------------------------------------------

      setSteps(results) {

        if (!Array.isArray(results)) {

          console.warn(
            "SMPTaskPanel.setSteps: results harus berupa array."
          );

          return false;
        }

        const langkah =
          Array.isArray(node.tasks[ti].langkah)
            ? node.tasks[ti].langkah
            : [];

        const max =
          langkah.length;

        const checked =
          results
            .slice(0, max)
            .map((value, index) =>
              value === true
                ? index
                : null
            )
            .filter(
              (index) =>
                index !== null
            );

        try {

          localStorage.setItem(
            key(),
            JSON.stringify(checked)
          );

        } catch (e) {

          console.error(
            "SMPTaskPanel: gagal menyimpan checklist.",
            e
          );

          return false;
        }

        // Gambar ulang panel supaya checkbox berubah.
        draw();

        console.log(
          "✅ SMP checklist diperbarui:",
          {
            nodeId: nid,
            taskIndex: ti,
            steps: results,
            checked
          }
        );

        return true;
      }
    };

    // ============================================================
    // BACK LINK
    // ============================================================

    const bl =
      document.getElementById("backLink");

    if (bl) {

      bl.href =
        "../" +
        (
          tr.grade === "smak"
            ? "belajar-smk.html"
            : "belajar-smp.html"
        ) +
        "?p=" +
        nid;

      bl.textContent =
        "← Jalur " +
        (
          tr.grade === "smak"
            ? "SMA/SMK"
            : "SMP"
        );
    }

    // ============================================================
    // DEBUG
    // ============================================================

    console.log(
      "✅ SMPTaskPanel siap:",
      window.SMPTaskPanel.getTask()
    );

    // ============================================================
    // INITIAL RENDER
    // ============================================================

    draw();
  }

})();