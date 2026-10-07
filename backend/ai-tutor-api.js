const OpenAI = require("openai");

// ============================================================
// AI TUTOR — Groq
// ============================================================

const DEFAULT_BASE_URL =
    "https://api.groq.com/openai/v1";

const DEFAULT_MODEL =
    "openai/gpt-oss-20b";

// ============================================================
// CONFIG
// ============================================================

function isMock() {
    return process.env.AI_MOCK === "true";
}

function getApiKey() {
    return (
        process.env.AI_API_KEY ||
        process.env.GROQ_API_KEY ||
        ""
    );
}

function getBaseUrl() {
    return (
        process.env.AI_BASE_URL ||
        DEFAULT_BASE_URL
    );
}

function getModel() {
    return (
        process.env.AI_MODEL ||
        DEFAULT_MODEL
    );
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

// ============================================================
// API KEY CHECK
// ============================================================

function hasApiKey() {
    return (
        isMock() ||
        Boolean(getApiKey())
    );
}

// ============================================================
// ASK TUTOR
// ============================================================

async function askTutor({

    message,

    // Learning Path biasa
    taskId,
    taskTitle,
    taskDescription,
    taskSteps,
    taskMaterial,
    taskHint,

    // Isi Text Editor
    editorHtml,
    editorCss,

    // Task SMP / SMA-K
    smpTask,

}) {

    // ==========================================================
    // MOCK
    // ==========================================================

    if (isMock()) {

        return {

            reply:
                "[MODE TES] Ini jawaban palsu. Prompt kamu: " +
                message,

            code: {
                html: null,
                css: null,
            },

            steps:
                smpTask &&
                Array.isArray(smpTask.langkah)
                    ? smpTask.langkah.map(() => false)
                    : [],

            prompt: message,

            taskId:
                taskId || null,

        };
    }

    // ==========================================================
    // SIAPKAN TASK SMP
    // ==========================================================

    const hasSmpTask =
        smpTask &&
        Array.isArray(smpTask.langkah);

    const smpTaskText =
        hasSmpTask
            ? `
Judul Task SMP:
${smpTask.judul || "-"}

Nomor task pada node:
${Number.isInteger(smpTask.taskIndex)
    ? smpTask.taskIndex + 1
    : "-"}

Langkah task:
${smpTask.langkah
    .map((x, i) => `${i + 1}. ${x}`)
    .join("\n")}
`
            : "Tidak ada Task SMP aktif.";

    // ==========================================================
    // SYSTEM INSTRUCTIONS
    // ==========================================================

    const instructions = `
Kamu adalah Tutor AI untuk platform belajar
"Dieng Cyber Coding".

Konteks utama:
Siswa sedang belajar Prompt Engineering.

============================================================
PERAN KAMU
============================================================

Tugas kamu:

1. Membantu siswa memahami tugas.
2. Membantu siswa memperbaiki prompt.
3. Menjelaskan bagian prompt yang sudah bagus.
4. Menjelaskan bagian prompt yang masih bisa diperbaiki.
5. Jika siswa meminta membuat, menulis, atau memperbaiki kode,
   kamu boleh menghasilkan kode HTML/CSS.
6. Jangan mengarang persyaratan tugas.
7. Jangan mengubah poin.
8. Jangan mengklaim task selesai hanya berdasarkan penilaianmu.
9. Gunakan bahasa Indonesia yang ramah dan mudah dipahami.
10. Sesuaikan penjelasan dengan tingkat siswa.

============================================================
ATURAN KODE
============================================================

Jika siswa meminta kode:

- html berisi kode HTML.
- css berisi isi CSS saja.
- Jangan memasukkan <style> ke dalam css.
- Jangan menggunakan markdown code fence untuk html/css.
- Jangan menghasilkan JavaScript kecuali benar-benar diminta.
- Jika siswa tidak meminta kode, html dan css harus null.

============================================================
TASK LEARNING PATH BIASA
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
        ? taskSteps
            .map((x, i) => `${i + 1}. ${x}`)
            .join("\n")
        : "-"
}

Materi:
${
    Array.isArray(taskMaterial)
        ? taskMaterial
            .map((x) => `- ${x}`)
            .join("\n")
        : "-"
}

Petunjuk:
${taskHint || "-"}

============================================================
TASK SMP / SMA-K AKTIF
============================================================

${smpTaskText}

============================================================
ATURAN EVALUASI CHECKLIST SMP
============================================================

Jika Task SMP tersedia:

Kamu WAJIB mengembalikan array "steps".

Jumlah item dalam "steps" harus sama dengan jumlah
langkah pada Task SMP.

Contoh jika ada 3 langkah:

[
  true,
  false,
  false
]

Artinya:

Langkah 1 terpenuhi.
Langkah 2 belum terpenuhi.
Langkah 3 belum terpenuhi.

Aturan penilaian:

- true = isi pesan siswa sudah memenuhi maksud langkah tersebut.
- false = isi pesan siswa belum memenuhi maksud langkah tersebut.
- Nilai berdasarkan MAKNA, bukan hanya kecocokan kata.
- Jangan menandai langkah hanya karena siswa menyebut kata yang sama.
- Jangan mengarang tindakan yang tidak terlihat dari pesan siswa.
- Jangan menganggap langkah selesai jika bukti di pesan siswa belum cukup.

Jika tidak ada Task SMP:

"steps" harus berupa [].

============================================================
KODE SISWA SAAT INI
============================================================

HTML:
${editorHtml || "(kosong)"}

CSS:
${editorCss || "(kosong)"}

============================================================
PESAN SISWA
============================================================

${message}
`;

    // ==========================================================
    // REQUEST GROQ
    // ==========================================================

    const response =
        await getClient().chat.completions.create({

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

            // --------------------------------------------------
            // STRUCTURED OUTPUT
            // --------------------------------------------------

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
                                type: [
                                    "string",
                                    "null"
                                ],
                            },

                            css: {
                                type: [
                                    "string",
                                    "null"
                                ],
                            },

                            steps: {
                                type: "array",

                                items: {
                                    type: "boolean",
                                },
                            },

                        },

                        required: [
                            "reply",
                            "html",
                            "css",
                            "steps",
                        ],

                        additionalProperties: false,

                    },

                },

            },

        });

    // ==========================================================
    // RAW RESPONSE
    // ==========================================================

    const raw =
        response
            .choices?.[0]
            ?.message
            ?.content;

    if (!raw) {

        throw new Error(
            "Provider AI mengembalikan jawaban kosong."
        );

    }

    // ==========================================================
    // PARSE JSON
    // ==========================================================

    let parsed;

    try {

        parsed = JSON.parse(raw);

    } catch (error) {

        console.error(
            "Respons JSON AI tidak valid:",
            raw
        );

        throw new Error(
            "Respons AI tidak dapat diproses."
        );
    }

    // ==========================================================
    // NORMALISASI STEPS
    // ==========================================================

    let steps = [];

    if (Array.isArray(parsed.steps)) {

        steps = parsed.steps
            .map((value) =>
                value === true
            );

    }

    // Jika ada task SMP, pastikan jumlah steps
    // sama dengan jumlah langkah task.
    if (hasSmpTask) {

        const total =
            smpTask.langkah.length;

        steps =
            Array.from(
                { length: total },
                (_, i) =>
                    steps[i] === true
            );

    } else {

        steps = [];

    }

    // ==========================================================
    // RETURN
    // ==========================================================

    return {

        reply:
            typeof parsed.reply === "string"
                ? parsed.reply
                : "",

        code: {

            html:
                typeof parsed.html === "string"
                    ? parsed.html
                    : null,

            css:
                typeof parsed.css === "string"
                    ? parsed.css
                    : null,

        },

        // HASIL EVALUASI TASK SMP
        steps,

        prompt: message,

        taskId:
            taskId || null,

    };
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
    askTutor,
    hasApiKey,
};