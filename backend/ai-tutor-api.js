const OpenAI = require("openai");

// ============================================================
// AI TUTOR — Groq
// ============================================================

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "openai/gpt-oss-20b";

function isMock() {
  return process.env.AI_MOCK === "true";
}

function getApiKey() {
  return process.env.AI_API_KEY || process.env.GROQ_API_KEY || "";
}

function getBaseUrl() {
  return process.env.AI_BASE_URL || DEFAULT_BASE_URL;
}

function getModel() {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: getApiKey(),
      baseURL: getBaseUrl(),
    });
  }

  return client;
}

function hasApiKey() {
  return isMock() || Boolean(getApiKey());
}

// ============================================================
// ASK TUTOR
// ============================================================

async function askTutor({
  message,
  taskId,
  taskTitle,
  taskDescription,
  taskSteps,
  taskMaterial,
  taskHint,
  editorHtml,
  editorCss,
}) {
  if (isMock()) {
    return {
      reply: "[MODE TES] Ini jawaban palsu. Prompt kamu: " + message,
      code: {
        html: null,
        css: null,
      },
      prompt: message,
      taskId: taskId || null,
    };
  }

  const instructions = `
Kamu adalah Tutor AI untuk platform belajar "Dieng Cyber Coding".

Konteks utama:
Siswa sedang belajar Prompt Engineering dan menggunakan Text Editor HTML/CSS.

Tugas kamu:
1. Membantu siswa memahami tugas.
2. Membantu memperbaiki prompt.
3. Jika siswa meminta kamu MENULIS, MEMBUAT, atau MEMPERBAIKI kode,
   kamu boleh menghasilkan kode HTML/CSS yang bisa langsung dimasukkan
   ke editor.
4. Jangan mengklaim bahwa tugas sudah selesai.
5. Jangan mengubah status tugas atau memberikan poin.
6. Penilaian tugas tetap dilakukan oleh sistem editor ketika siswa
   menekan tombol "Jalankan".
7. Jangan mengarang persyaratan task.
8. Gunakan bahasa Indonesia yang ramah dan mudah dipahami.
9. Jangan menghasilkan JavaScript untuk preview kecuali siswa benar-benar
   memintanya. Editor preview menggunakan sandbox untuk keamanan.
10. Jika siswa hanya bertanya teori atau meminta penjelasan,
    html dan css harus bernilai null.
11. Jika siswa meminta kode, kembalikan KODE LENGKAP untuk bagian yang
    relevan. HTML harus berupa dokumen HTML lengkap bila memang diperlukan.
12. CSS harus berisi isi style.css saja, tanpa tag <style>.
13. Jangan membungkus HTML atau CSS dengan markdown code fence.
14. Gunakan kode yang sederhana dan sesuai tingkat siswa.

ATURAN PEDAGOGIS:
- Jangan sekadar mengambil alih semua pekerjaan siswa tanpa konteks.
- Jelaskan secara singkat apa yang kamu ubah dan kenapa.
- Kode boleh diberikan ketika siswa memintanya.
- Jangan mengatakan "sudah benar" hanya karena kode terlihat masuk akal.

============================================================
KONTEKS TASK
============================================================

Task ID:
${taskId || "-"}

Judul:
${taskTitle || "-"}

Deskripsi:
${taskDescription || "-"}

Langkah:
${
  Array.isArray(taskSteps)
    ? taskSteps.map((x, i) => `${i + 1}. ${x}`).join("\n")
    : "-"
}

Materi:
${
  Array.isArray(taskMaterial)
    ? taskMaterial.map((x) => `- ${x}`).join("\n")
    : "-"
}

Petunjuk:
${taskHint || "-"}

============================================================
KODE SISWA SAAT INI
============================================================

HTML:
${editorHtml || "(kosong)"}

CSS:
${editorCss || "(kosong)"}

============================================================
PERMINTAAN SISWA
============================================================

${message}
`;

  const response = await getClient().chat.completions.create({
    model: getModel(),

    messages: [
      {
        role: "system",
        content: instructions,
      },
      {
        role: "user",
        content: message,
      },
    ],

    temperature: 0.2,

    response_format: {
      type: "json_schema",

      json_schema: {
        name: "ai_tutor_response",
        strict: true,

        schema: {
          type: "object",

          properties: {
            reply: {
              type: "string",
            },

            html: {
              type: ["string", "null"],
            },

            css: {
              type: ["string", "null"],
            },
          },

          required: [
            "reply",
            "html",
            "css",
          ],

          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error("Provider AI mengembalikan jawaban kosong.");
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("Respons JSON AI tidak valid:", raw);
    throw new Error("Respons AI tidak dapat diproses.");
  }

  return {
    reply: parsed.reply,

    code: {
      html: parsed.html,
      css: parsed.css,
    },

    prompt: message,
    taskId: taskId || null,
  };
}

module.exports = {
  askTutor,
  hasApiKey,
};