// ============================================================
// AI TUTOR — Prompt Engineering
// ============================================================

(function () {
  const $ = (id) => document.getElementById(id);

  const form = $("aiTutorForm");
  const input = $("aiTutorInput");
  const messages = $("aiTutorMessages");
  const sendBtn = $("aiTutorSend");
  const tutor = $("aiTutor");
  const minBtn = $("aiTutorMin");

  if (!form || !input || !messages) return;

  // ------------------------------------------------------------
  // TASK CONTEXT
  // ------------------------------------------------------------

  const params = new URLSearchParams(window.location.search);
  const taskId = params.get("task");

  let task = null;

  /*
   * Untuk sementara task masih berasal dari jalur-data.js.
   * Nanti saat curriculum sudah dipindah ke API,
   * bagian ini tinggal diganti menjadi fetch API.
   */
  if (taskId && typeof LP !== "undefined") {
    const info = LP.find(taskId);

    if (info && info.task) {
      task = info.task;
    }
  }

  // ------------------------------------------------------------
  // UTIL
  // ------------------------------------------------------------

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function addMessage(type, text) {
    const el = document.createElement("div");

    el.className =
      "ai-message " +
      (type === "user"
        ? "ai-message-user"
        : "ai-message-bot");

    const label = document.createElement("div");
    label.className = "ai-message-label";
    label.textContent =
      type === "user" ? "Kamu" : "Tutor AI";

    const content = document.createElement("div");

    // Text biasa dulu. Jangan render HTML dari AI.
    content.textContent = text;

    el.appendChild(label);
    el.appendChild(content);

    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;

    return el;
  }

  function addThinking() {
    const el = document.createElement("div");

    el.className =
      "ai-message ai-message-bot ai-tutor-thinking";

    el.textContent = "Tutor AI sedang berpikir...";

    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;

    return el;
  }

  // ------------------------------------------------------------
  // CONTEXT
  // ------------------------------------------------------------

  function getTaskContext() {
    if (!task) {
      return {
        taskId: taskId || null,
        taskTitle: null,
        taskDescription: null,
        taskSteps: [],
        taskMaterial: [],
        taskHint: null,
      };
    }

    return {
      taskId: taskId || null,
      taskTitle: task.title || null,
      taskDescription: task.desc || null,
      taskSteps: Array.isArray(task.langkah)
        ? task.langkah
        : [],
      taskMaterial: Array.isArray(task.materi)
        ? task.materi
        : [],
      taskHint: task.hint || null,
    };
  }

  // ------------------------------------------------------------
  // SEND
  // ------------------------------------------------------------

  async function askTutor(message) {
    const context = getTaskContext();

    const editorCode =
      window.DCCEditor && typeof window.DCCEditor.getCode === "function"
        ? window.DCCEditor.getCode()
        : {
            html: "",
            css: "",
          };

    const response = await fetch("/api/ai/tutor", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        message,

        ...context,
        editorHtml: editorCode.html,
        editorCss: editorCode.css,

        // Python / PHP: Tutor AI perlu tahu bahasa dan kode yang sedang dibuka
        editorLanguage: editorCode.mode || "web",
        editorCode:
          editorCode.mode === "python"
            ? editorCode.python
            : editorCode.mode === "php"
              ? editorCode.php
              : "",
      }),
    });

    let data = null;

    try {
      data = await response.json();
    } catch (error) {
      throw new Error("Respons server tidak valid.");
    }

    if (!response.ok) {
      throw new Error(
        data && data.error
          ? data.error
          : "AI Tutor gagal merespons."
      );
    }

    return data;
  }

  // ------------------------------------------------------------
  // FORM
  // ------------------------------------------------------------

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const message = input.value.trim();

    if (!message) return;

    if (sendBtn.disabled) return;

    addMessage("user", message);

    /*
     * PENTING:
     * Ini adalah prompt asli siswa.
     *
     * Nanti evaluator akan menggunakan nilai ini
     * untuk mengisi checklist.
     */
    const studentPrompt = message;

    // Kosongkan input
    input.value = "";

    sendBtn.disabled = true;

    const thinking = addThinking();

    try {
      const result = await askTutor(studentPrompt);

      thinking.remove();

      const botMessage = addMessage(
        "bot",
        result.reply || "Aku belum bisa memberikan jawaban."
      );

      const generatedHtml = result.code?.html;
      const generatedCss = result.code?.css;

      if (
        (typeof generatedHtml === "string" && generatedHtml.trim()) ||
        (typeof generatedCss === "string" && generatedCss.trim())
      ) {
        const codeBox = document.createElement("div");
        codeBox.className = "ai-generated-code";

        const title = document.createElement("div");
        title.className = "ai-generated-code-title";
        title.textContent = "💻 AI membuat kode untukmu";

        codeBox.appendChild(title);

        if (typeof generatedHtml === "string" && generatedHtml.trim()) {
          const htmlLabel = document.createElement("div");
          htmlLabel.textContent = "index.html";
          htmlLabel.className = "ai-generated-code-label";

          const htmlPre = document.createElement("pre");
          htmlPre.textContent = generatedHtml;

          codeBox.appendChild(htmlLabel);
          codeBox.appendChild(htmlPre);
        }

        if (typeof generatedCss === "string" && generatedCss.trim()) {
          const cssLabel = document.createElement("div");
          cssLabel.textContent = "style.css";
          cssLabel.className = "ai-generated-code-label";

          const cssPre = document.createElement("pre");
          cssPre.textContent = generatedCss;

          codeBox.appendChild(cssLabel);
          codeBox.appendChild(cssPre);
        }

        const applyBtn = document.createElement("button");
        applyBtn.type = "button";
        applyBtn.className = "ai-apply-code";
        applyBtn.textContent = "✨ Terapkan ke editor";

        applyBtn.addEventListener("click", () => {
          if (
            !window.DCCEditor ||
            typeof window.DCCEditor.applyCode !== "function"
          ) {
            applyBtn.textContent = "❌ Editor tidak tersedia";
            return;
          }

          window.DCCEditor.applyCode({
            html: generatedHtml,
            css: generatedCss,
          });

          applyBtn.textContent = "✅ Kode diterapkan";

          setTimeout(() => {
            applyBtn.textContent = "✨ Terapkan ke editor";
          }, 2000);
        });

        codeBox.appendChild(applyBtn);
        botMessage.appendChild(codeBox);

        messages.scrollTop = messages.scrollHeight;
      }

      /*
       * Untuk tahap berikutnya:
       *
       * evaluatePrompt(studentPrompt, taskId)
       *
       * akan dipanggil di sini.
       *
       * Belum kita aktifkan sekarang.
       */
    } catch (error) {
      thinking.remove();

      addMessage(
        "bot",
        "Maaf, Tutor AI sedang bermasalah.\n\n" +
        error.message
      );

      console.error("Tutor AI:", error);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });

  // ------------------------------------------------------------
  // ENTER
  // ------------------------------------------------------------

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      form.requestSubmit();
    }
  });

  // ------------------------------------------------------------
  // MINIMIZE
  // ------------------------------------------------------------

  minBtn.addEventListener("click", function () {
    tutor.classList.toggle("minimized");

    minBtn.textContent = tutor.classList.contains("minimized")
      ? "+"
      : "−";
  });
})();