// ============================================================
// AI TUTOR — Prompt Engineering
// ============================================================

(function () {

  const $ = (id) =>
    document.getElementById(id);

  const form =
    $("aiTutorForm");

  const input =
    $("aiTutorInput");

  const messages =
    $("aiTutorMessages");

  const sendBtn =
    $("aiTutorSend");

  const tutor =
    $("aiTutor");

  const minBtn =
    $("aiTutorMin");

  if (
    !form ||
    !input ||
    !messages
  ) {
    return;
  }

  // ------------------------------------------------------------
  // TASK CONTEXT — LEARNING PATH BIASA
  // ------------------------------------------------------------

  const params =
    new URLSearchParams(
      window.location.search
    );

  const taskId =
    params.get("task");

  let task = null;

  /*
   * Untuk sementara task biasa masih berasal
   * dari jalur-data.js.
   */

  if (
    taskId &&
    typeof LP !== "undefined"
  ) {

    const info =
      LP.find(taskId);

    if (
      info &&
      info.task
    ) {

      task =
        info.task;

    }

  }

  // ------------------------------------------------------------
  // UTIL
  // ------------------------------------------------------------

  function escapeHtml(text) {

    return String(text)
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      );

  }

  function addMessage(
    type,
    text
  ) {

    const el =
      document.createElement("div");

    el.className =
      "ai-message " +
      (
        type === "user"
          ? "ai-message-user"
          : "ai-message-bot"
      );

    const label =
      document.createElement("div");

    label.className =
      "ai-message-label";

    label.textContent =
      type === "user"
        ? "Kamu"
        : "Tutor AI";

    const content =
      document.createElement("div");

    // Jangan render HTML dari AI.
    content.textContent =
      text;

    el.appendChild(label);
    el.appendChild(content);

    messages.appendChild(el);

    messages.scrollTop =
      messages.scrollHeight;

    return el;
  }

  function addThinking() {

    const el =
      document.createElement("div");

    el.className =
      "ai-message ai-message-bot ai-tutor-thinking";

    el.textContent =
      "Tutor AI sedang berpikir...";

    messages.appendChild(el);

    messages.scrollTop =
      messages.scrollHeight;

    return el;
  }

  // ------------------------------------------------------------
  // TASK CONTEXT — LEARNING PATH BIASA
  // ------------------------------------------------------------

  function getTaskContext() {

    if (!task) {

      return {

        taskId:
          taskId || null,

        taskTitle:
          null,

        taskDescription:
          null,

        taskSteps:
          [],

        taskMaterial:
          [],

        taskHint:
          null,

      };

    }

    return {

      taskId:
        taskId || null,

      taskTitle:
        task.title || null,

      taskDescription:
        task.desc || null,

      taskSteps:
        Array.isArray(task.langkah)
          ? task.langkah
          : [],

      taskMaterial:
        Array.isArray(task.materi)
          ? task.materi
          : [],

      taskHint:
        task.hint || null,

    };

  }

  // ------------------------------------------------------------
  // SMP TASK
  // ------------------------------------------------------------

  function getSmpTask() {

    if (
      !window.SMPTaskPanel ||
      typeof window.SMPTaskPanel.getTask !== "function"
    ) {

      return null;

    }

    const result =
      window.SMPTaskPanel.getTask();

    if (
      !result ||
      !result.task
    ) {

      return null;

    }

    return result;

  }

  // ------------------------------------------------------------
  // EDITOR CODE
  // ------------------------------------------------------------

  function getEditorCode() {

    if (
      window.DCCEditor &&
      typeof window.DCCEditor.getCode === "function"
    ) {

      return window.DCCEditor.getCode();

    }

    return {

      html: "",
      css: "",

    };

  }

  // ------------------------------------------------------------
  // SEND TO BACKEND
  // ------------------------------------------------------------

  async function askTutor(message) {

    const context =
      getTaskContext();

    const editorCode =
      getEditorCode();

    const smpTask =
      getSmpTask();

    // ----------------------------------------------------------
    // DEBUG DATA SEBELUM REQUEST
    // ----------------------------------------------------------

    console.log(
      "📋 Task SMP yang dikirim:",
      smpTask
    );

    // Add auth header (required by backend)
    const token = localStorage.getItem("authToken");
    const headers = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    const response =
      await fetch(
        "/api/ai/tutor",
        {

          method: "POST",

          headers: headers,

          body:
            JSON.stringify({

              message,

              ...context,

              editorHtml:
                editorCode.html,

              editorCss:
                editorCode.css,
              editorLanguage:
                editorCode.mode || "web",

              editorCode:
                editorCode.mode === "python"
                  ? editorCode.python
                  : editorCode.mode === "php"
                    ? editorCode.php
                    : "",

              smpTask:
                smpTask
                  ? {

                      nodeId:
                        smpTask.nodeId,

                      taskIndex:
                        smpTask.taskIndex,

                      judul:
                        smpTask.task.judul,

                      langkah:
                        Array.isArray(
                          smpTask.task.langkah
                        )
                          ? smpTask.task.langkah
                          : [],

                    }
                  : null,

            }),

        }
      );

    // ----------------------------------------------------------
    // PARSE RESPONSE
    // ----------------------------------------------------------
    let data = null;

    try {

      data =
        await response.json();

    } catch (error) {

      throw new Error(
        "Respons server tidak valid."
      );

    }

    // ----------------------------------------------------------
    // SERVER ERROR
    // ----------------------------------------------------------

    if (!response.ok) {

      throw new Error(
        (data && (data.message || data.error)) ||
          ("AI Tutor gagal merespons. (HTTP " + response.status + ")")
      );

    }

    return data;

  }

  // ------------------------------------------------------------
  // CEK APAKAH SEBUAH LANGKAH MEMBUTUHKAN TINDAKAN DI EDITOR
  // ------------------------------------------------------------

  function isEditorStep(
    langkahText
  ) {

    const text =
      String(
        langkahText || ""
      )
        .toLowerCase()
        .trim();

    return (
      text.includes("editor") ||
      text.includes("simpan prompt") ||
      (
        text.includes("simpan") &&
        text.includes("prompt")
      ) ||
      (
        text.includes("masukkan") &&
        text.includes("editor")
      ) ||
      (
        text.includes("terapkan") &&
        text.includes("editor")
      )
    );

  }

  // ------------------------------------------------------------
  // EVALUASI CHECKLIST PROMPT
  // ------------------------------------------------------------
  //
  // Backend/AI tetap menjadi sumber utama untuk semua langkah.
  // Untuk Task "Prompt pertama", langkah 1 dan 2 juga diperiksa
  // secara lokal supaya checklist tidak bergantung pada apakah
  // model mengembalikan steps:[true,false,...] dengan tepat.
  //
  // Langkah editor TIDAK boleh dianggap selesai hanya karena AI
  // menjawab. Langkah editor baru dipaksa true saat Apply ditekan.
  // ------------------------------------------------------------

  function promptHasRole(text) {

    const s = String(text || "").toLowerCase();

    return (
      /\bsebagai\s+[a-z0-9][^,.!?;\n]*/i.test(s) ||
      /\bberperan\s+sebagai\b/i.test(s) ||
      /\bbertindak\s+sebagai\b/i.test(s) ||
      /\bkamu\s+adalah\b/i.test(s) ||
      /\banda\s+adalah\b/i.test(s) ||
      /\brole\s*:/i.test(s) ||
      /\bperan\s*:/i.test(s)
    );

  }

  function promptHasFormat(text) {

    const s = String(text || "").toLowerCase();

    return (
      /\bformat\b/i.test(s) ||
      /\bdalam\s+bentuk\b/i.test(s) ||
      /\bberikan\s+(?:dalam\s+)?bentuk\b/i.test(s) ||
      /\btabel\b/i.test(s) ||
      /\bdaftar\b/i.test(s) ||
      /\bbullet(?:\s|-)?point\b/i.test(s) ||
      /\bpoin[- ]poin\b/i.test(s) ||
      /\bjson\b/i.test(s) ||
      /\bmarkdown\b/i.test(s) ||
      /\bparagraf\b/i.test(s) ||
      /\blangkah[- ]langkah\b/i.test(s) ||
      /\bmaksimal\s+\d+\s+kata\b/i.test(s)
    );

  }

  function isTaskOneStep(langkahText) {

    const s = String(langkahText || "").toLowerCase();

    return (
      s.includes("tulis tugas") ||
      s.includes("tugas yang ingin dibantu ai")
    );

  }

  function isRoleFormatStep(langkahText) {

    const s = String(langkahText || "").toLowerCase();

    return (
      s.includes("peran") &&
      s.includes("format")
    );

  }

  function updateSmpChecklist(
    result,
    editorApplied = false,
    studentPrompt = ""
  ) {

    if (
      !window.SMPTaskPanel ||
      typeof window.SMPTaskPanel.setSteps !== "function"
    ) {

      return;

    }

    if (
      !result ||
      !Array.isArray(result.steps)
    ) {

      return;

    }

    const currentTask =
      typeof window.SMPTaskPanel.getTask === "function"
        ? window.SMPTaskPanel.getTask()
        : null;

    const langkah =
      currentTask &&
      currentTask.task &&
      Array.isArray(currentTask.task.langkah)
        ? currentTask.task.langkah
        : [];

    const finalSteps =
      langkah.map((langkahText, index) => {

        let done =
          result.steps[index] === true;

        // Langkah 1: kalau siswa sudah mengirim prompt,
        // berarti dia memang sudah menulis tugas untuk AI.
        if (isTaskOneStep(langkahText)) {
          done = done || Boolean(String(studentPrompt || "").trim());
        }

        // Langkah 2: cek ada PERAN + FORMAT di prompt.
        if (isRoleFormatStep(langkahText)) {
          done =
            done ||
            (promptHasRole(studentPrompt) &&
              promptHasFormat(studentPrompt));
        }

        // Langkah editor hanya selesai setelah Apply.
        if (editorApplied && isEditorStep(langkahText)) {
          done = true;
        }

        return done;

      });

    console.log(
      "🤖 Steps dari AI:",
      result.steps
    );

    console.log(
      editorApplied
        ? "📝 Checklist setelah Terapkan ke editor:"
        : "📋 Checklist setelah evaluasi prompt:",
      finalSteps
    );

    window.SMPTaskPanel.setSteps(
      finalSteps
    );

  }

  // ------------------------------------------------------------
  // FORM
  // ------------------------------------------------------------

  form.addEventListener(
    "submit",
    async function (event) {

      event.preventDefault();

      const message =
        input.value.trim();

      if (!message) {
        return;
      }

      if (sendBtn.disabled) {
        return;
      }

      // --------------------------------------------------------
      // PESAN SISWA
      // --------------------------------------------------------

      addMessage(
        "user",
        message
      );

      /*
       * Ini adalah prompt asli siswa.
       */
      const studentPrompt =
        message;

      // Kosongkan input
      input.value = "";

      sendBtn.disabled =
        true;

      const thinking =
        addThinking();

      try {

        // ------------------------------------------------------
        // REQUEST AI
        // ------------------------------------------------------

        const result =
          await askTutor(
            studentPrompt
          );

        // ------------------------------------------------------
        // JAWABAN TUTOR
        // ------------------------------------------------------

        thinking.remove();

        const botMessage =
          addMessage(
            "bot",
            result.reply ||
              "Aku belum bisa memberikan jawaban."
          );

        // Evaluasi langkah dari prompt dilakukan saat AI selesai
        // menjawab. Langkah editor tetap menunggu tombol Apply.
        updateSmpChecklist(
          result,
          false,
          studentPrompt
        );

        // ------------------------------------------------------
        // GENERATED CODE
        // ------------------------------------------------------

        const generatedHtml =
          result.code?.html;

        const generatedCss =
          result.code?.css;

        if (
          (
            typeof generatedHtml === "string" &&
            generatedHtml.trim()
          ) ||
          (
            typeof generatedCss === "string" &&
            generatedCss.trim()
          )
        ) {

          const codeBox =
            document.createElement("div");

          codeBox.className =
            "ai-generated-code";

          const title =
            document.createElement("div");

          title.className =
            "ai-generated-code-title";

          title.textContent =
            "💻 AI membuat kode untukmu";

          codeBox.appendChild(
            title
          );

          // ----------------------------------------------------
          // HTML
          // ----------------------------------------------------

          if (
            typeof generatedHtml === "string" &&
            generatedHtml.trim()
          ) {

            const htmlLabel =
              document.createElement("div");

            htmlLabel.textContent =
              "index.html";

            htmlLabel.className =
              "ai-generated-code-label";

            const htmlPre =
              document.createElement("pre");

            htmlPre.textContent =
              generatedHtml;

            codeBox.appendChild(
              htmlLabel
            );

            codeBox.appendChild(
              htmlPre
            );

          }

          // ----------------------------------------------------
          // CSS
          // ----------------------------------------------------

          if (
            typeof generatedCss === "string" &&
            generatedCss.trim()
          ) {

            const cssLabel =
              document.createElement("div");

            cssLabel.textContent =
              "style.css";

            cssLabel.className =
              "ai-generated-code-label";

            const cssPre =
              document.createElement("pre");

            cssPre.textContent =
              generatedCss;

            codeBox.appendChild(
              cssLabel
            );

            codeBox.appendChild(
              cssPre
            );

          }

          // ----------------------------------------------------
          // APPLY CODE
          // ----------------------------------------------------

          const applyBtn =
            document.createElement("button");

          applyBtn.type =
            "button";

          applyBtn.className =
            "ai-apply-code";

          applyBtn.textContent =
            "✨ Terapkan ke editor";

          applyBtn.addEventListener(
            "click",
            () => {

              if (
                !window.DCCEditor ||
                typeof window.DCCEditor.applyCode !== "function"
              ) {

                applyBtn.textContent =
                  "❌ Editor tidak tersedia";

                return;

              }

              // ------------------------------------------------
              // TERAPKAN KODE
              // ------------------------------------------------

              window.DCCEditor.applyCode({

                html:
                  generatedHtml,

                css:
                  generatedCss,

              });

              // ------------------------------------------------
              // UPDATE CHECKLIST
              // ------------------------------------------------
              //
              // editorApplied = true:
              // langkah seperti "Simpan prompt di editor"
              // otomatis menjadi true.
              //
              // Langkah lain tetap mengikuti hasil evaluasi AI.
              // ------------------------------------------------

              updateSmpChecklist(
                result,
                true,
                studentPrompt
              );

              applyBtn.textContent =
                "✅ Kode diterapkan";

              setTimeout(
                () => {

                  applyBtn.textContent =
                    "✨ Terapkan ke editor";

                },
                2000
              );

            }
          );

          codeBox.appendChild(
            applyBtn
          );

          botMessage.appendChild(
            codeBox
          );

          messages.scrollTop =
            messages.scrollHeight;

        }

      } catch (error) {

        thinking.remove();

        addMessage(
          "bot",
          "Maaf, Tutor AI sedang bermasalah.\n\n" +
          error.message
        );

        console.error(
          "Tutor AI:",
          error
        );

      } finally {

        sendBtn.disabled =
          false;

        input.focus();

      }

    }
  );

  // ------------------------------------------------------------
  // ENTER
  // ------------------------------------------------------------

  input.addEventListener(
    "keydown",
    function (event) {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        form.requestSubmit();

      }

    }
  );

  // ------------------------------------------------------------
  // MINIMIZE
  // ------------------------------------------------------------

  // body.dock-open: di desktop, halaman memberi ruang di kanan selama ada panel (Task aktif / Tutor AI) yang terbuka
  const dock = document.getElementById("editorDock");

  function syncDock() {
    const open = dock
      ? !!dock.querySelector(".ai-tutor:not(.minimized), .smpP:not(.min)")
      : !tutor.classList.contains("minimized");
    document.body.classList.toggle("dock-open", open);
  }

  if (dock && window.MutationObserver) {
    // panel Task aktif dibuat/diubah oleh smp-taskpanel.js, jadi dipantau lewat observer
    new MutationObserver(syncDock).observe(dock, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function setMinimized(min) {
    tutor.classList.toggle("minimized", min);
    minBtn.textContent = min ? "+" : "−";
    minBtn.setAttribute(
      "aria-label",
      min ? "Buka Tutor AI" : "Minimalkan Tutor AI"
    );
    syncDock();
  }

  minBtn.addEventListener(
    "click",
    function () {
      setMinimized(!tutor.classList.contains("minimized"));
    }
  );

  // Saat diciutkan, mengetuk bagian atas panel juga membukanya (lebih mudah di layar sentuh)
  const tutorHead = tutor.querySelector(".ai-tutor-head");
  if (tutorHead) {
    tutorHead.addEventListener("click", function (e) {
      if (
        tutor.classList.contains("minimized") &&
        e.target !== minBtn
      ) {
        setMinimized(false);
      }
    });
  }

  // Layar kecil: mulai dalam keadaan diciutkan agar tidak menutupi editor
  setMinimized(window.matchMedia("(max-width: 1099px)").matches);

})();
