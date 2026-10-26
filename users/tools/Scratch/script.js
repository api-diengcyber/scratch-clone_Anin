window.__keys = window.__keys || new Set();
window.mouseDown = false;
document.addEventListener("keydown", e => window.__keys.add(e.key === " " ? "space" : e.key));
document.addEventListener("keyup", e => window.__keys.delete(e.key === " " ? "space" : e.key));
document.addEventListener("pointerdown", () => window.mouseDown = true);
document.addEventListener("pointerup", () => window.mouseDown = false);


const COSTUME_DEFINITIONS = [
  {
    name: "costume1",
    color: "#FFAB19",
    detail: "none"
  },
  {
    name: "costume2",
    color: "#FF4C4C",
    detail: "white"
  },
  {
    name: "costume3",
    color: "#4C97FF",
    detail: "none"
  }
];


const BACKDROP_DEFINITIONS = [
  {
    name: "backdrop1",
    type: "plain"
  },
  {
    name: "backdrop2",
    type: "nature"
  },
  {
    name: "backdrop3",
    type: "night"
  }
];


const GRAPHIC_EFFECT_NAMES = [
  "color",
  "fisheye",
  "whirl",
  "pixelate",
  "mosaic",
  "brightness",
  "ghost"
];


// ============================================================
// STATE SYSTEM
// ============================================================

const state = {

  currentUser: null,

  sprite: {
    x: 0,
    y: 0,

    // Scratch-style direction:
    // 90 = atas
    // 0 = kiri
    // 180 = kanan
    // 270 / -90 = bawah
    direction: 90,

    size: 100,
    visible: true,
    sayText: "",
    bubbleType: "say",
    costume: "costume1",
    name: "Kucing",
    rotationStyle: "all-around",

    graphicEffects: {
      color: 0,
      fisheye: 0,
      whirl: 0,
      pixelate: 0,
      mosaic: 0,
      brightness: 0,
      ghost: 0
    },

    layer: 0
  },

  backdrop: {
    current: "backdrop1"
  },

  soundState: {
    volume: 100,
    pitch: 0,
    pan: 0
  },

  variables: {
    "my variable": 0
  },

  variableMeta: {
    "my variable": { visible: true, scope: "all" }
  },

  lists: {},

  listMeta: {},

  answer: "",
  sensingMonitors: {},
  sensingMonitorOptions: { current: "year" },
  reporterMonitors: {},
  timerStartedAt: performance.now(),
  myBlocks: {},

  broadcastMessages: ["message1"],
  eventTriggerState: new WeakMap(),

  isRunning: false,

  stacks: []
};


// ============================================================
// AUDIO
// ============================================================

const AudioContextClass =
  window.AudioContext ||
  window.webkitAudioContext;

const audioCtx =
  AudioContextClass
    ? new AudioContextClass()
    : null;


function playMeowSound(duration = 0.3) {

  if (!audioCtx) {
    return;
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const osc =
    audioCtx.createOscillator();

  const gain =
    audioCtx.createGain();

  const baseFreq =
    400 *
    Math.pow(
      2,
      state.soundState.pitch / 100
    );

  const volume =
    Math.max(
      0,
      Math.min(
        1,
        state.soundState.volume / 100
      )
    );

  osc.type = "sine";

  osc.frequency.setValueAtTime(
    baseFreq,
    audioCtx.currentTime
  );

  osc.frequency.exponentialRampToValueAtTime(
    baseFreq * 1.5,
    audioCtx.currentTime +
      duration * 0.5
  );

  osc.frequency.exponentialRampToValueAtTime(
    baseFreq * 0.8,
    audioCtx.currentTime +
      duration
  );

  gain.gain.setValueAtTime(
    volume * 0.3,
    audioCtx.currentTime
  );

  gain.gain.exponentialRampToValueAtTime(
    0.01,
    audioCtx.currentTime +
      duration
  );

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();

  osc.stop(
    audioCtx.currentTime +
      duration
  );

  trackSoundSource(osc);
}


// ============================================================
// SOUND LIBRARY, PEREKAM SUARA, DAN TAB SOUNDS
// ============================================================
// - soundLibrary : daftar suara proyek (Meow bawaan + hasil rekaman)
// - openSoundRecorder : dialog rekam (MediaRecorder) + trim sebelum disimpan
// - Tab "Suara" : pilih, ganti nama, potong (trim), putar, dan hapus suara
// - Blok "play sound" / "start sound" memutar suara yang dipilih di dropdown

const soundLibrary = [
  { id: "snd-meow", name: "Meow", builtin: true, buffer: null, undoBuffer: null, duration: 0.4 }
];
let soundIdCounter = 1;
let selectedSoundId = "snd-meow";
const activeSoundNodes = new Set();
const MAX_RECORD_SECONDS = 600;
let previewSource = null;
let previewRaf = 0;

function uniqueSoundName(base, ignoreId) {
  const clean = String(base || "").trim().slice(0, 40) || "recording1";
  const taken = new Set(
    soundLibrary.filter((s) => s.id !== ignoreId).map((s) => s.name)
  );
  if (!taken.has(clean)) return clean;
  const m = clean.match(/^(.*?)(\d+)$/);
  const stem = m ? m[1] : clean;
  let n = m ? parseInt(m[2], 10) + 1 : 2;
  while (taken.has(stem + n)) n++;
  return stem + n;
}

function getSoundByName(name) {
  return soundLibrary.find((s) => s.name === name) || null;
}

function getSoundOptions() {
  return [
    ...soundLibrary.map((s) => ({ label: s.name, value: s.name })),
    { label: "record...", value: "__record_sound__", isSoundAction: true }
  ];
}

// ---------- PEMUTARAN ----------

function trackSoundSource(src) {
  activeSoundNodes.add(src);
  src.addEventListener("ended", () => activeSoundNodes.delete(src));
}

function stopAllSounds() {
  Array.from(activeSoundNodes).forEach((src) => {
    try { src.stop(); } catch (e) { /* belum start / sudah berhenti */ }
  });
  activeSoundNodes.clear();
  stopPreview();
}

function playBufferWithEffects(buffer) {
  return new Promise((resolve) => {
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.max(
      0.25,
      Math.min(4, Math.pow(2, state.soundState.pitch / 100))
    );
    const gain = audioCtx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, state.soundState.volume / 100));
    src.connect(gain);
    let last = gain;
    if (audioCtx.createStereoPanner) {
      const panner = audioCtx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, state.soundState.pan / 100));
      gain.connect(panner);
      last = panner;
    }
    last.connect(audioCtx.destination);
    trackSoundSource(src);
    src.addEventListener("ended", resolve);
    src.start();
  });
}

function playSoundByName(name, waitUntilDone) {
  const snd = getSoundByName(name);
  if (!snd || !audioCtx) return Promise.resolve();
  if (audioCtx.state === "suspended") audioCtx.resume();
  if (snd.builtin) {
    playMeowSound(0.4);
    return waitUntilDone
      ? new Promise((resolve) => setTimeout(resolve, 400))
      : Promise.resolve();
  }
  if (!snd.buffer) return Promise.resolve();
  const playing = playBufferWithEffects(snd.buffer);
  return waitUntilDone ? playing : Promise.resolve();
}

// Pratinjau di editor/perekam: tidak terpengaruh volume/pitch/pan blok.
function stopPreview() {
  cancelAnimationFrame(previewRaf);
  if (previewSource) {
    const s = previewSource;
    previewSource = null;
    s.onended = null;
    try { s.stop(); } catch (e) { /* abaikan */ }
  }
}

function playPreview(buffer, startSec, endSec, callbacks) {
  const { onTick, onEnd } = callbacks || {};
  stopPreview();
  if (!audioCtx || !buffer) { if (onEnd) onEnd(); return; }
  if (audioCtx.state === "suspended") audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(audioCtx.destination);
  const dur = Math.max(0.01, endSec - startSec);
  const t0 = audioCtx.currentTime;
  previewSource = src;
  src.onended = () => {
    if (previewSource !== src) return;
    previewSource = null;
    cancelAnimationFrame(previewRaf);
    if (onEnd) onEnd();
  };
  src.start(0, startSec, dur);
  const tick = () => {
    if (previewSource !== src) return;
    const p = Math.min(1, (audioCtx.currentTime - t0) / dur);
    if (onTick) onTick(startSec + p * dur);
    previewRaf = requestAnimationFrame(tick);
  };
  tick();
}

// ---------- OLAH AUDIO ----------

function sliceBuffer(buf, startSec, endSec) {
  const sr = buf.sampleRate;
  const s = Math.max(0, Math.floor(startSec * sr));
  const e = Math.min(buf.length, Math.ceil(endSec * sr));
  const len = Math.max(1, e - s);
  const out = audioCtx.createBuffer(buf.numberOfChannels, len, sr);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    out.copyToChannel(buf.getChannelData(ch).slice(s, s + len), ch);
  }
  return out;
}

function decodeBlob(blob) {
  return blob.arrayBuffer().then(
    (ab) =>
      new Promise((resolve, reject) => {
        const p = audioCtx.decodeAudioData(ab, resolve, reject);
        if (p && p.catch) p.catch(reject);
      })
  );
}

function pickRecorderMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function micErrorMessage(err) {
  switch (err && err.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Izin mikrofon ditolak. Izinkan akses mikrofon di pengaturan browser, lalu coba lagi.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Mikrofon tidak ditemukan. Sambungkan mikrofon lalu coba lagi.";
    case "NotReadableError":
    case "AbortError":
      return "Mikrofon sedang dipakai aplikasi lain atau tidak bisa dibuka.";
    default:
      return "Tidak bisa mengakses mikrofon.";
  }
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

// ---------- GAMBAR GELOMBANG ----------

const peakCache = new WeakMap();

function getPeaks(buffer, cols) {
  let byCols = peakCache.get(buffer);
  if (!byCols) { byCols = new Map(); peakCache.set(buffer, byCols); }
  if (byCols.has(cols)) return byCols.get(cols);
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / cols));
  const stride = Math.max(1, Math.floor(step / 64));
  const out = new Float32Array(cols * 2);
  for (let c = 0; c < cols; c++) {
    let mn = 0, mx = 0;
    const s = c * step;
    const e = Math.min(data.length, s + step);
    for (let i = s; i < e; i += stride) {
      const v = data[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    out[c * 2] = mn;
    out[c * 2 + 1] = mx;
  }
  byCols.set(cols, out);
  return out;
}

function drawWave(canvas, buffer) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth));
  const h = Math.max(1, Math.round(canvas.clientHeight));
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#cf63cf";
  const mid = h / 2;
  if (!buffer) { ctx.fillRect(0, mid - 0.5, w, 1); return; }
  const peaks = getPeaks(buffer, w);
  let max = 0.05;
  for (let i = 0; i < peaks.length; i++) max = Math.max(max, Math.abs(peaks[i]));
  const k = (h / 2 - 2) / max;
  for (let x = 0; x < w; x++) {
    const mn = peaks[x * 2] * k;
    const mx = peaks[x * 2 + 1] * k;
    ctx.fillRect(x, mid - mx, 1, Math.max(1, mx - mn));
  }
}

// Gelombang + dua pegangan untuk memotong bagian awal/akhir.
function createTrimmer(buffer, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "trim-wrap";
  const canvas = document.createElement("canvas");
  canvas.className = "trim-canvas";
  const mk = (cls) => {
    const d = document.createElement("div");
    d.className = cls;
    return d;
  };
  const shadeL = mk("trim-shade trim-shade-l");
  const shadeR = mk("trim-shade trim-shade-r");
  const handleL = mk("trim-handle trim-handle-l");
  const handleR = mk("trim-handle trim-handle-r");
  const head = mk("trim-playhead");
  handleL.tabIndex = 0;
  handleR.tabIndex = 0;
  handleL.setAttribute("role", "slider");
  handleR.setAttribute("role", "slider");
  handleL.setAttribute("aria-label", "Titik awal potong");
  handleR.setAttribute("aria-label", "Titik akhir potong");
  wrap.append(canvas, shadeL, shadeR, handleL, handleR, head);

  let a = 0;
  let b = 1;
  const minGap = () => Math.min(0.5, Math.max(0.01, 0.05 / buffer.duration));

  function layout() {
    shadeL.style.width = a * 100 + "%";
    shadeR.style.width = (1 - b) * 100 + "%";
    handleL.style.left = a * 100 + "%";
    handleR.style.left = b * 100 + "%";
    handleL.setAttribute("aria-valuenow", (a * buffer.duration).toFixed(2));
    handleR.setAttribute("aria-valuenow", (b * buffer.duration).toFixed(2));
  }
  function redraw() { drawWave(canvas, buffer); layout(); }
  function move(isLeft, f) {
    f = Math.min(1, Math.max(0, f));
    if (isLeft) a = Math.min(f, b - minGap());
    else b = Math.max(f, a + minGap());
    layout();
    if (onChange) onChange();
  }
  function bind(h, isLeft) {
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      h.classList.add("dragging");
    });
    h.addEventListener("pointermove", (e) => {
      if (!h.hasPointerCapture(e.pointerId)) return;
      const r = wrap.getBoundingClientRect();
      move(isLeft, (e.clientX - r.left) / r.width);
    });
    const end = () => h.classList.remove("dragging");
    h.addEventListener("pointerup", end);
    h.addEventListener("pointercancel", end);
    h.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.05 : 0.01;
      if (e.key === "ArrowLeft") { e.preventDefault(); move(isLeft, (isLeft ? a : b) - step); }
      if (e.key === "ArrowRight") { e.preventDefault(); move(isLeft, (isLeft ? a : b) + step); }
    });
  }
  bind(handleL, true);
  bind(handleR, false);
  if (window.ResizeObserver) new ResizeObserver(redraw).observe(wrap);
  layout();

  return {
    el: wrap,
    redraw,
    getRange() {
      return {
        start: a * buffer.duration,
        end: b * buffer.duration,
        isFull: a === 0 && b === 1
      };
    },
    setPlayhead(sec) {
      if (sec == null) { head.style.display = "none"; return; }
      head.style.display = "block";
      head.style.left = (sec / buffer.duration) * 100 + "%";
    }
  };
}

// Tombol putar/berhenti untuk pratinjau; mengembalikan fungsi reset.
function wirePreviewButton(btn, buffer, trimmer) {
  let playing = false;
  const label = () => { btn.textContent = playing ? "■ Berhenti" : "▶ Putar"; };
  const reset = () => { playing = false; label(); trimmer.setPlayhead(null); };
  btn.onclick = () => {
    if (playing) { stopPreview(); reset(); return; }
    const r = trimmer.getRange();
    playing = true;
    label();
    playPreview(buffer, r.start, r.end, {
      onTick: (t) => trimmer.setPlayhead(t),
      onEnd: reset
    });
  };
  label();
  return reset;
}

// ---------- DAFTAR SUARA ----------

function syncSoundDropdowns(rename) {
  document
    .querySelectorAll('.custom-dropdown[data-source="sounds"]')
    .forEach((dd) => {
      if (rename && dd.dataset.value === rename.from) dd.dataset.value = rename.to;
      if (dd._rebuildOptions) dd._rebuildOptions(getSoundOptions());
    });
}

function refreshSoundPalette() {
  if (typeof initPalette !== "function" || !paletteScroll) return;
  const top = paletteScroll.scrollTop;
  initPalette();
  paletteScroll.scrollTop = top;
}

function soundsChanged(rename) {
  syncSoundDropdowns(rename);
  refreshSoundPalette();
  renderSoundsTab();
}

function addSound({ name, buffer }) {
  const snd = {
    id: "snd-" + soundIdCounter++,
    name: uniqueSoundName(name),
    builtin: false,
    buffer,
    undoBuffer: null,
    duration: buffer.duration
  };
  soundLibrary.push(snd);
  selectedSoundId = snd.id;
  soundsChanged();
  return snd;
}

function renameSound(id, newName) {
  const snd = soundLibrary.find((s) => s.id === id);
  if (!snd) return null;
  const from = snd.name;
  snd.name = uniqueSoundName(newName, id);
  soundsChanged(from !== snd.name ? { from, to: snd.name } : undefined);
  return snd.name;
}

function deleteSound(id) {
  const idx = soundLibrary.findIndex((s) => s.id === id);
  if (idx < 0) return;
  stopAllSounds();
  soundLibrary.splice(idx, 1);
  if (selectedSoundId === id) {
    const next = soundLibrary[Math.min(idx, soundLibrary.length - 1)];
    selectedSoundId = next ? next.id : null;
  }
  soundsChanged();
}

function resetSoundLibrary() {
  stopAllSounds();
  soundLibrary.length = 0;
  soundLibrary.push({
    id: "snd-meow", name: "Meow", builtin: true,
    buffer: null, undoBuffer: null, duration: 0.4
  });
  selectedSoundId = "snd-meow";
  setTimeout(soundsChanged, 0);
}

function confirmDeleteSound(snd) {
  if (window.confirm('Hapus suara "' + snd.name + '"?')) deleteSound(snd.id);
}

// ---------- DIALOG REKAM ----------

function openSoundRecorder(onSaved) {
  stopPreview();
  const overlay = document.createElement("div");
  overlay.className = "scratch-dialog-overlay";
  overlay.innerHTML = `
    <div class="scratch-dialog-card sound-rec-card" role="dialog" aria-modal="true" aria-label="Rekam Suara">
      <div class="scratch-dialog-title"><span>Rekam Suara</span><button type="button" class="scratch-dialog-close" aria-label="Tutup">×</button></div>
      <div class="scratch-dialog-body sound-rec-body">
        <div class="sound-rec-status" aria-live="polite">Klik Rekam, lalu bicara ke mikrofon.</div>
        <div class="sound-rec-meter"><div class="sound-rec-meter-fill"></div></div>
        <div class="sound-rec-time">0:00</div>
        <div class="sound-rec-stage" hidden></div>
        <div class="sound-rec-name-row" hidden><label>Nama:</label><input class="sound-edit-name sound-rec-name" type="text" maxlength="40" autocomplete="off"></div>
        <div class="sound-rec-actions">
          <button type="button" class="snd-btn snd-rec sr-record">● Rekam</button>
          <button type="button" class="snd-btn snd-rec sr-stop" hidden>■ Berhenti</button>
          <button type="button" class="snd-btn sr-play" hidden>▶ Putar</button>
          <button type="button" class="snd-btn secondary sr-again" hidden>↺ Rekam ulang</button>
          <span class="sound-rec-spacer"></span>
          <button type="button" class="snd-btn secondary sr-cancel">Batal</button>
          <button type="button" class="snd-btn sr-save" hidden>Simpan</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = (sel) => overlay.querySelector(sel);
  const statusEl = $(".sound-rec-status");
  const meterEl = $(".sound-rec-meter");
  const meterFill = $(".sound-rec-meter-fill");
  const timeEl = $(".sound-rec-time");
  const stageEl = $(".sound-rec-stage");
  const nameRow = $(".sound-rec-name-row");
  const nameInput = $(".sound-rec-name");
  const btnRec = $(".sr-record");
  const btnStop = $(".sr-stop");
  const btnPlay = $(".sr-play");
  const btnAgain = $(".sr-again");
  const btnSave = $(".sr-save");

  let closed = false;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let timerId = 0;
  let startedAt = 0;
  let analyser = null;
  let srcNode = null;
  let meterData = null;
  let buffer = null;
  let trimmer = null;
  let resetPlayBtn = null;

  function setMode(m) {
    btnRec.hidden = m !== "idle";
    btnStop.hidden = m !== "recording";
    meterEl.hidden = m === "review";
    stageEl.hidden = m !== "review";
    nameRow.hidden = m !== "review";
    btnPlay.hidden = m !== "review";
    btnAgain.hidden = m !== "review";
    btnSave.hidden = m !== "review";
  }

  function cleanupCapture() {
    clearInterval(timerId);
    timerId = 0;
    try { if (srcNode) srcNode.disconnect(); } catch (e) { /* abaikan */ }
    srcNode = null;
    analyser = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    meterFill.style.width = "0%";
  }

  function close() {
    if (closed) return;
    closed = true;
    stopPreview();
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      try { recorder.stop(); } catch (e) { /* abaikan */ }
    }
    cleanupCapture();
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  async function startRec() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusEl.textContent = window.isSecureContext === false
        ? "Perekaman butuh koneksi aman (https atau localhost)."
        : "Browser ini tidak mendukung akses mikrofon.";
      return;
    }
    if (!window.MediaRecorder || !audioCtx) {
      statusEl.textContent = "Browser ini tidak mendukung perekaman audio.";
      return;
    }
    btnRec.disabled = true;
    statusEl.textContent = "Meminta izin mikrofon…";
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      btnRec.disabled = false;
      if (!closed) statusEl.textContent = micErrorMessage(err);
      return;
    }
    btnRec.disabled = false;
    if (closed) { s.getTracks().forEach((t) => t.stop()); return; }
    stream = s;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const mime = pickRecorderMime();
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch (err) {
      cleanupCapture();
      statusEl.textContent = "Perekaman tidak bisa dimulai di browser ini.";
      return;
    }
    chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      const type = recorder.mimeType || mime || "audio/webm";
      cleanupCapture();
      if (closed) return;
      const blob = new Blob(chunks, { type });
      chunks = [];
      statusEl.textContent = "Memproses rekaman…";
      try { buffer = await decodeBlob(blob); } catch (err) { buffer = null; }
      if (closed) return;
      if (!buffer || buffer.duration < 0.05) {
        statusEl.textContent = buffer
          ? "Rekaman terlalu pendek. Coba lagi."
          : "Rekaman tidak bisa diproses. Coba lagi.";
        buffer = null;
        timeEl.textContent = "0:00";
        btnStop.disabled = false;
        setMode("idle");
        return;
      }
      showReview();
    };

    try {
      srcNode = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      srcNode.connect(analyser); // tidak disambung ke speaker (hindari gema)
      meterData = new Uint8Array(analyser.fftSize);
    } catch (err) {
      analyser = null;
    }

    recorder.start(250);
    startedAt = performance.now();
    btnStop.disabled = false;
    statusEl.textContent = "Sedang merekam…";
    timeEl.textContent = "0:00";
    setMode("recording");
    timerId = setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      timeEl.textContent = fmtClock(elapsed);
      if (analyser) {
        analyser.getByteTimeDomainData(meterData);
        let sum = 0;
        for (let i = 0; i < meterData.length; i++) {
          const x = (meterData[i] - 128) / 128;
          sum += x * x;
        }
        meterFill.style.width =
          Math.min(100, Math.round(Math.sqrt(sum / meterData.length) * 220)) + "%";
      }
      if (elapsed >= MAX_RECORD_SECONDS) stopRec();
    }, 60);
  }

  function stopRec() {
    if (recorder && recorder.state !== "inactive") {
      btnStop.disabled = true;
      statusEl.textContent = "Memproses rekaman…";
      recorder.stop();
    }
  }

  function showReview() {
    stageEl.innerHTML = "";
    trimmer = createTrimmer(buffer, () => {
      stopPreview();
      if (resetPlayBtn) resetPlayBtn();
    });
    stageEl.appendChild(trimmer.el);
    resetPlayBtn = wirePreviewButton(btnPlay, buffer, trimmer);
    nameInput.value = uniqueSoundName("recording1");
    timeEl.textContent = fmtClock(buffer.duration);
    statusEl.textContent = "Geser pegangan ungu untuk memotong bagian awal atau akhir.";
    setMode("review");
    nameInput.focus();
    nameInput.select();
  }

  btnRec.addEventListener("click", startRec);
  btnStop.addEventListener("click", stopRec);
  btnAgain.addEventListener("click", () => {
    stopPreview();
    buffer = null;
    timeEl.textContent = "0:00";
    statusEl.textContent = "Klik Rekam, lalu bicara ke mikrofon.";
    setMode("idle");
  });
  btnSave.addEventListener("click", () => {
    if (!buffer || !trimmer) return;
    stopPreview();
    const r = trimmer.getRange();
    const out = r.isFull ? buffer : sliceBuffer(buffer, r.start, r.end);
    const snd = addSound({ name: nameInput.value, buffer: out });
    close();
    if (onSaved) onSaved(snd);
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnSave.click();
  });
  $(".sr-cancel").addEventListener("click", close);
  $(".scratch-dialog-close").addEventListener("click", close);
  setMode("idle");
  btnRec.focus();
}

// ---------- TAB SUARA ----------

function renderSoundsTab() {
  const panel = document.getElementById("sounds-panel");
  const listEl = document.getElementById("sounds-list");
  const editorEl = document.getElementById("sounds-editor");
  if (!panel || panel.hidden || !listEl || !editorEl) return;
  stopPreview();

  if (!soundLibrary.some((s) => s.id === selectedSoundId)) {
    selectedSoundId = soundLibrary[0] ? soundLibrary[0].id : null;
  }

  listEl.innerHTML = "";
  if (!soundLibrary.length) {
    listEl.innerHTML =
      '<div class="sounds-empty">Belum ada suara.<br>Klik tombol Rekam di bawah.</div>';
  }
  soundLibrary.forEach((snd, i) => {
    const item = document.createElement("div");
    item.className = "sound-item" + (snd.id === selectedSoundId ? " selected" : "");
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-pressed", String(snd.id === selectedSoundId));

    const head = document.createElement("div");
    head.className = "sound-item-head";
    const num = document.createElement("span");
    num.className = "sound-item-num";
    num.textContent = String(i + 1);
    const nm = document.createElement("span");
    nm.className = "sound-item-name";
    nm.textContent = snd.name;
    head.append(num, nm);

    const thumb = document.createElement("canvas");
    thumb.className = "sound-item-thumb";

    const dur = document.createElement("div");
    dur.className = "sound-item-dur";
    dur.textContent = snd.duration.toFixed(2) + " dtk";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "sound-item-del";
    del.title = "Hapus suara";
    del.setAttribute("aria-label", "Hapus suara " + snd.name);
    del.textContent = "🗑";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDeleteSound(snd);
    });

    const select = () => {
      if (selectedSoundId === snd.id) return;
      selectedSoundId = snd.id;
      renderSoundsTab();
    };
    item.addEventListener("click", select);
    item.addEventListener("keydown", (e) => {
      if (e.target !== item) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
    });

    item.append(head, thumb, dur, del);
    listEl.appendChild(item);
    drawWave(thumb, snd.buffer);
  });

  renderSoundEditor(editorEl);
}

function renderSoundEditor(editorEl) {
  editorEl.innerHTML = "";
  const snd = soundLibrary.find((s) => s.id === selectedSoundId);
  if (!snd) {
    editorEl.innerHTML =
      '<div class="sounds-empty">Rekam suara untuk mulai mengedit.</div>';
    return;
  }

  const nameRow = document.createElement("div");
  nameRow.className = "sound-edit-row";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Nama";
  const nameInput = document.createElement("input");
  nameInput.className = "sound-edit-name";
  nameInput.type = "text";
  nameInput.maxLength = 40;
  nameInput.value = snd.name;
  nameInput.autocomplete = "off";
  nameInput.addEventListener("change", () => {
    const v = nameInput.value.trim();
    if (!v) { nameInput.value = snd.name; return; }
    if (v !== snd.name) renameSound(snd.id, v);
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameInput.blur();
  });
  nameLabel.appendChild(nameInput);
  nameRow.appendChild(nameLabel);
  editorEl.appendChild(nameRow);

  const info = document.createElement("div");
  info.className = "sound-edit-info";
  info.textContent =
    snd.duration.toFixed(2) + " detik" + (snd.builtin ? " · suara bawaan" : "");
  editorEl.appendChild(info);

  const actions = document.createElement("div");
  actions.className = "sound-edit-actions";
  const mkBtn = (text, cls) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "snd-btn" + (cls ? " " + cls : "");
    b.textContent = text;
    return b;
  };
  const btnPlay = mkBtn("▶ Putar");
  const btnDelete = mkBtn("🗑 Hapus", "danger");
  btnDelete.addEventListener("click", () => confirmDeleteSound(snd));

  if (snd.buffer) {
    const btnTrim = mkBtn("✂ Potong", "secondary");
    const btnUndo = mkBtn("↶ Urungkan", "secondary");
    btnTrim.disabled = true;
    btnUndo.disabled = !snd.undoBuffer;

    let resetPlay = null;
    const trimmer = createTrimmer(snd.buffer, () => {
      stopPreview();
      if (resetPlay) resetPlay();
      btnTrim.disabled = trimmer.getRange().isFull;
    });
    resetPlay = wirePreviewButton(btnPlay, snd.buffer, trimmer);
    editorEl.appendChild(trimmer.el);

    const hint = document.createElement("div");
    hint.className = "sound-edit-hint";
    hint.textContent =
      "Geser pegangan ungu di kiri/kanan, lalu klik Potong untuk membuang bagian di luar pegangan.";
    editorEl.appendChild(hint);

    btnTrim.addEventListener("click", () => {
      const r = trimmer.getRange();
      if (r.isFull) return;
      stopPreview();
      snd.undoBuffer = snd.buffer;
      snd.buffer = sliceBuffer(snd.buffer, r.start, r.end);
      snd.duration = snd.buffer.duration;
      renderSoundsTab();
    });
    btnUndo.addEventListener("click", () => {
      if (!snd.undoBuffer) return;
      stopPreview();
      snd.buffer = snd.undoBuffer;
      snd.duration = snd.buffer.duration;
      snd.undoBuffer = null;
      renderSoundsTab();
    });
    actions.append(btnPlay, btnTrim, btnUndo, btnDelete);
  } else {
    btnPlay.addEventListener("click", () => playSoundByName(snd.name, false));
    const note = document.createElement("div");
    note.className = "sound-edit-hint";
    note.textContent =
      "Suara bawaan dibuat secara sintetis sehingga tidak bisa dipotong. Rekam suara baru untuk memakai fitur potong.";
    editorEl.appendChild(note);
    actions.append(btnPlay, btnDelete);
  }
  editorEl.appendChild(actions);
}

function initSoundsTab() {
  const tabCode = document.getElementById("tab-code");
  const tabSounds = document.getElementById("tab-sounds");
  const panel = document.getElementById("sounds-panel");
  const codeArea = document.getElementById("script-area");
  const recordBtn = document.getElementById("sounds-record-btn");
  if (!tabCode || !tabSounds || !panel || !codeArea) return;

  function showTab(which) {
    const sounds = which === "sounds";
    tabCode.classList.toggle("active", !sounds);
    tabSounds.classList.toggle("active", sounds);
    tabCode.setAttribute("aria-selected", String(!sounds));
    tabSounds.setAttribute("aria-selected", String(sounds));
    codeArea.style.display = sounds ? "none" : "";
    panel.hidden = !sounds;
    if (sounds) renderSoundsTab();
    else stopPreview();
  }
  tabCode.addEventListener("click", () => showTab("code"));
  tabSounds.addEventListener("click", () => showTab("sounds"));
  if (recordBtn) recordBtn.addEventListener("click", () => openSoundRecorder());
}

initSoundsTab();


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

// ============================================================
// BLOCK DEFINITIONS
// ============================================================

const blockDefinitions = [

  // ==========================================================
  // MOTION
  // ==========================================================

  {
    cat: "motion",
    type: "move_steps",
    text: "move {10} steps",
    defaultVal: 10
  },

  {
    cat: "motion",
    type: "turn_right",
    text: "turn ↻ {15} degrees",
    defaultVal: 15
  },

  {
    cat: "motion",
    type: "turn_left",
    text: "turn ↺ {15} degrees",
    defaultVal: 15
  },

  {
    cat: "motion",
    type: "goto_random",
    text: "go to [menu]",
    options: [
      {
        label: "random position",
        value: "random"
      },
      {
        label: "mouse-pointer",
        value: "mouse"
      }
    ]
  },

  {
    cat: "motion",
    type: "goto_xy",
    text: "go to x: {0} y: {0}",
    defaultVals: [0, 0]
  },

  {
    cat: "motion",
    type: "glide_random",
    text: "glide {1} secs to [menu]",
    defaultVal: 1,
    options: [
      {
        label: "random position",
        value: "random"
      },
      {
        label: "mouse-pointer",
        value: "mouse"
      }
    ]
  },

  {
    cat: "motion",
    type: "glide_xy",
    text: "glide {1} secs to x: {0} y: {0}",
    defaultVals: [1, 0, 0]
  },

  {
    cat: "motion",
    type: "point_direction",
    text: "point in direction {90}",
    defaultVal: 90
  },

  {
    cat: "motion",
    type: "point_towards",
    text: "point towards [menu]",
    options: [
      {
        label: "mouse-pointer",
        value: "mouse"
      },
      {
        label: "random position",
        value: "random"
      }
    ]
  },

  {
    cat: "motion",
    type: "change_x",
    text: "change x by {10}",
    defaultVal: 10
  },

  {
    cat: "motion",
    type: "set_x",
    text: "set x to {0}",
    defaultVal: 0
  },

  {
    cat: "motion",
    type: "change_y",
    text: "change y by {10}",
    defaultVal: 10
  },

  {
    cat: "motion",
    type: "set_y",
    text: "set y to {0}",
    defaultVal: 0
  },

  {
    cat: "motion",
    type: "if_edge",
    text: "if on edge, bounce"
  },

  {
    cat: "motion",
    type: "set_rotation_style",
    text: "set rotation style [menu]",
    options: [
      {
        label: "left-right",
        value: "left-right"
      },
      {
        label: "don't rotate",
        value: "dont-rotate"
      },
      {
        label: "all around",
        value: "all-around"
      }
    ]
  },

  {
    cat: "motion",
    type: "reporter_x",
    isReporter: true,
    hasCheckbox: true,
    text: "x position"
  },

  {
    cat: "motion",
    type: "reporter_y",
    isReporter: true,
    hasCheckbox: true,
    text: "y position"
  },

  {
    cat: "motion",
    type: "reporter_direction",
    isReporter: true,
    hasCheckbox: true,
    text: "direction"
  },


  // ==========================================================
  // LOOKS
  // ==========================================================

  {
    cat: "looks",
    type: "say_for_secs",
    text: "say {Hello!} for {2} seconds",
    defaultVals: ["Hello!", 2]
  },

  {
    cat: "looks",
    type: "say",
    text: "say {Hello!}",
    defaultVal: "Hello!"
  },

  {
    cat: "looks",
    type: "think_for_secs",
    text: "think {Hmm...} for {2} seconds",
    defaultVals: ["Hmm...", 2]
  },

  {
    cat: "looks",
    type: "think",
    text: "think {Hmm...}",
    defaultVal: "Hmm..."
  },

  {
    cat: "looks",
    type: "switch_costume",
    text: "switch costume to [menu]",
    options:
      COSTUME_DEFINITIONS.map(
        (costume) => ({
          label: costume.name,
          value: costume.name
        })
      )
  },

  {
    cat: "looks",
    type: "next_costume",
    text: "next costume"
  },

  {
    cat: "looks",
    type: "change_size",
    text: "change size by {10}",
    defaultVal: 10
  },

  {
    cat: "looks",
    type: "set_size",
    text: "set size to {100} %",
    defaultVal: 100
  },

  {
    cat: "looks",
    type: "show",
    text: "show"
  },

  {
    cat: "looks",
    type: "hide",
    text: "hide"
  },

  {
    cat: "looks",
    type: "change_graphic_effect",
    text: "change [menu] effect by {25}",
    options:
      GRAPHIC_EFFECT_NAMES.map(
        (effect) => ({
          label: effect,
          value: effect
        })
      ),
    defaultVal: 25
  },

  {
    cat: "looks",
    type: "set_graphic_effect",
    text: "set [menu] effect to {0}",
    options:
      GRAPHIC_EFFECT_NAMES.map(
        (effect) => ({
          label: effect,
          value: effect
        })
      ),
    defaultVal: 0
  },

  {
    cat: "looks",
    type: "clear_graphic_effects",
    text: "clear graphic effects"
  },

  {
    cat: "looks",
    type: "go_to_front",
    text: "go to front layer"
  },

  {
    cat: "looks",
    type: "go_back_layers",
    text: "go back {1} layers",
    defaultVal: 1
  },

  {
    cat: "looks",
    type: "switch_backdrop",
    text: "switch backdrop to [menu]",
    options:
      BACKDROP_DEFINITIONS.map(
        (backdrop) => ({
          label: backdrop.name,
          value: backdrop.name
        })
      )
  },

  {
    cat: "looks",
    type: "next_backdrop",
    text: "next backdrop"
  },

  {
    cat: "looks",
    type: "reporter_costume",
    isReporter: true,
    hasCheckbox: true,
    text: "costume [menu]",
    options: [
      {
        label: "number",
        value: "number"
      },
      {
        label: "name",
        value: "name"
      }
    ]
  },

  {
    cat: "looks",
    type: "reporter_backdrop",
    isReporter: true,
    hasCheckbox: true,
    text: "backdrop [menu]",
    options: [
      {
        label: "number",
        value: "number"
      },
      {
        label: "name",
        value: "name"
      }
    ]
  },

  {
    cat: "looks",
    type: "reporter_size",
    isReporter: true,
    hasCheckbox: true,
    text: "size"
  },


  // ==========================================================
  // SOUND
  // ==========================================================

  {
    cat: "sound",
    type: "play_sound_until_done",
    text: "play sound [menu] until done",
    optionsSource: "sounds",
    options: [
      {
        label: "Meow",
        value: "Meow"
      }
    ]
  },

  {
    cat: "sound",
    type: "start_sound",
    text: "start sound [menu]",
    optionsSource: "sounds",
    options: [
      {
        label: "Meow",
        value: "Meow"
      }
    ]
  },

  {
    cat: "sound",
    type: "stop_all_sounds",
    text: "stop all sounds"
  },

  {
    cat: "sound",
    type: "change_sound_effect",
    text: "change [menu] effect by {10}",
    options: [
      {
        label: "pitch",
        value: "pitch"
      },
      {
        label: "pan",
        value: "pan"
      }
    ],
    defaultVal: 10
  },

  {
    cat: "sound",
    type: "set_sound_effect",
    text: "set [menu] effect to {100}",
    options: [
      {
        label: "pitch",
        value: "pitch"
      },
      {
        label: "pan",
        value: "pan"
      }
    ],
    defaultVal: 100
  },

  {
    cat: "sound",
    type: "clear_sound_effects",
    text: "clear sound effects"
  },

  {
    cat: "sound",
    type: "change_volume",
    text: "change volume by {-10}",
    defaultVal: -10
  },

  {
    cat: "sound",
    type: "set_volume",
    text: "set volume to {100} %",
    defaultVal: 100
  },

  {
    cat: "sound",
    type: "reporter_volume",
    isReporter: true,
    hasCheckbox: true,
    text: "volume"
  },


  // ==========================================================
  // EVENTS
  // ==========================================================

// ==========================================================
// EVENTS
// ==========================================================

{
  cat: "events",
  type: "when_flag_clicked",
  text: "when 🚩 clicked"
},

{
  cat: "events",
  type: "when_key_pressed",
  text: "when [menu] key pressed",
  options: [
    { label: "space", value: "space" },
    { label: "up arrow", value: "ArrowUp" },
    { label: "down arrow", value: "ArrowDown" },
    { label: "left arrow", value: "ArrowLeft" },
    { label: "right arrow", value: "ArrowRight" },
    { label: "any key", value: "any" },
    { label: "a", value: "a" },
    { label: "b", value: "b" },
    { label: "c", value: "c" },
    { label: "d", value: "d" },
    { label: "e", value: "e" },
    { label: "f", value: "f" },
    { label: "g", value: "g" },
    { label: "h", value: "h" },
    { label: "i", value: "i" },
    { label: "j", value: "j" },
    { label: "k", value: "k" },
    { label: "l", value: "l" },
    { label: "m", value: "m" },
    { label: "n", value: "n" },
    { label: "o", value: "o" },
    { label: "p", value: "p" },
    { label: "q", value: "q" },
    { label: "r", value: "r" },
    { label: "s", value: "s" },
    { label: "t", value: "t" },
    { label: "u", value: "u" },
    { label: "v", value: "v" },
    { label: "w", value: "w" },
    { label: "x", value: "x" },
    { label: "y", value: "y" },
    { label: "z", value: "z" },
    { label: "0", value: "0" },
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "4", value: "4" },
    { label: "5", value: "5" },
    { label: "6", value: "6" },
    { label: "7", value: "7" },
    { label: "8", value: "8" },
    { label: "9", value: "9" }
  ]
},

{
  cat: "events",
  type: "when_sprite_clicked",
  text: "when this sprite clicked"
},

{
  cat: "events",
  type: "when_backdrop_switches",
  text: "when backdrop switches to [menu]",
  options:
    BACKDROP_DEFINITIONS.map(
      (backdrop) => ({
        label: backdrop.name,
        value: backdrop.name
      })
    )
},

{
  cat: "events",
  type: "when_loudness_gt",
  text: "when [loudness] > {10}",
  options: [
    { label: "loudness", value: "loudness" },
    { label: "timer", value: "timer" }
  ],
  defaultVal: 10
},

{
  cat: "events",
  type: "broadcast",
  text: "broadcast [menu]",
  optionsSource: "broadcasts"
},

{
  cat: "events",
  type: "broadcast_wait",
  text: "broadcast [menu] and wait",
  optionsSource: "broadcasts"
},

{
  cat: "events",
  type: "when_receive",
  text: "when I receive [menu]",
  optionsSource: "broadcasts"
},


  // ==========================================================
  // CONTROL — Scratch-compatible core blocks
  // ==========================================================

  { cat:"control", type:"wait_secs", text:"wait {1} seconds", defaultVal:1 },
  { cat:"control", type:"repeat", text:"repeat {10}", defaultVal:10 },
  { cat:"control", type:"forever", text:"forever" },
  { cat:"control", type:"if", text:"if {true} then" , defaultVal:"true" },
  { cat:"control", type:"if_else", text:"if {true} then", defaultVal:"true" },
  { cat:"control", type:"wait_until", text:"wait until {true}", defaultVal:"true" },
  { cat:"control", type:"repeat_until", text:"repeat until {true}", defaultVal:"true" },
  { cat:"control", type:"stop", text:"stop [menu]",
    options:[{label:"all",value:"all"},{label:"this script",value:"this-script"},{label:"other scripts in sprite",value:"other-scripts"}] },
  { cat:"control", type:"create_clone", text:"create clone of [menu]",
    options:[{label:"myself",value:"myself"}] },
  { cat:"control", type:"delete_clone", text:"delete this clone" },

  // ==========================================================
  // SENSING
  // ==========================================================

  { cat:"sensing", type:"touching", isReporter:true, text:"touching [menu] ?",
    options:[{label:"mouse pointer",value:"mouse"},{label:"touching",value:"sprite"}] },
  { cat:"sensing", type:"touching_color", isReporter:true, text:"touching color {#ff0000}?",
    defaultVal:"#ff0000", inputTypes:["color"] },
  { cat:"sensing", type:"color_touching_color", isReporter:true, text:"color {#ff0000} is touching {#00ff00}?",
    defaultVals:["#ff0000","#00ff00"], inputTypes:["color","color"] },
  { cat:"sensing", type:"distance_to", isReporter:true, text:"distance to [menu]",
    options:[{label:"mouse pointer",value:"mouse"}] },
  { cat:"sensing", type:"ask_wait", text:"ask {What's your name?} and wait", defaultVal:"What's your name?" },
  { cat:"sensing", type:"answer", isReporter:true, hasCheckbox:true, text:"answer" },
  { cat:"sensing", type:"key_pressed", isReporter:true, text:"key [menu] pressed?",
    options:[{label:"space",value:"space"},{label:"up arrow",value:"ArrowUp"},{label:"down arrow",value:"ArrowDown"},{label:"left arrow",value:"ArrowLeft"},{label:"right arrow",value:"ArrowRight"},{label:"any key",value:"any"},{label:"a",value:"a"}, {label:"b",value:"b"}, {label:"c",value:"c"}, {label:"d",value:"d"}, {label:"e",value:"e"}, {label:"f",value:"f"}, {label:"g",value:"g"}, {label:"h",value:"h"}, {label:"i",value:"i"}, {label:"j",value:"j"}, {label:"k",value:"k"}, {label:"l",value:"l"}, {label:"m",value:"m"}, {label:"n",value:"n"}, {label:"o",value:"o"}, {label:"p",value:"p"}, {label:"q",value:"q"}, {label:"r",value:"r"}, {label:"s",value:"s"}, {label:"t",value:"t"}, {label:"u",value:"u"}, {label:"v",value:"v"}, {label:"w",value:"w"}, {label:"x",value:"x"}, {label:"y",value:"y"}, {label:"z",value:"z"},{label:"0",value:"0"}, {label:"1",value:"1"}, {label:"2",value:"2"}, {label:"3",value:"3"}, {label:"4",value:"4"}, {label:"5",value:"5"}, {label:"6",value:"6"}, {label:"7",value:"7"}, {label:"8",value:"8"}, {label:"9",value:"9"} ] },
  { cat:"sensing", type:"mouse_down", isReporter:true, text:"mouse down?" },
  { cat:"sensing", type:"mouse_x", isReporter:true, text:"mouse x" },
  { cat:"sensing", type:"mouse_y", isReporter:true, text:"mouse y" },
  { cat:"sensing", type:"loudness", isReporter:true, hasCheckbox:true, text:"loudness" },
  { cat:"sensing", type:"timer", isReporter:true, hasCheckbox:true, text:"timer" },
  { cat:"sensing", type:"reset_timer", text:"reset timer" },
  { cat:"sensing", type:"current", isReporter:true, hasCheckbox:true, text:"current [menu]",
    options:[{label:"year",value:"year"},{label:"month",value:"month"},{label:"date",value:"date"},{label:"day of week",value:"day"},{label:"hour",value:"hour"},{label:"minute",value:"minute"},{label:"second",value:"second"}] },
  { cat:"sensing", type:"days_since_2000", isReporter:true, text:"days since 2000" },
  { cat:"sensing", type:"online", isReporter:true, hasCheckbox:true, text:"online?" },
  { cat:"sensing", type:"username", isReporter:true, hasCheckbox:true, text:"username" },
  { cat:"sensing", type:"backdrop_of", isReporter:true, text:"backdrop [menu] of [stage]", options:[{label:"backdrop #",value:"number"},{label:"backdrop name",value:"name"},{label:"volume",value:"volume"},{label:"my variable",value:"my variable"}], options2:[{label:"Stage",value:"stage"}] },
  { cat:"sensing", type:"set_drag_mode", text:"set drag mode [menu]", options:[{label:"draggable",value:"draggable"},{label:"not draggable",value:"not-draggable"}] },

  // ==========================================================
  // OPERATORS
  // ==========================================================

  { cat:"operators", type:"op_add", isReporter:true, text:"{1} + {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_subtract", isReporter:true, text:"{1} - {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_multiply", isReporter:true, text:"{1} * {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_divide", isReporter:true, text:"{1} / {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_random", isReporter:true, text:"pick random {1} to {10}", defaultVals:[1,10] },
  { cat:"operators", type:"op_gt", isReporter:true, text:"{1} > {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_lt", isReporter:true, text:"{1} < {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_eq", isReporter:true, text:"{1} = {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_and", isReporter:true, text:"{true} and {true}", defaultVals:["true","true"] },
  { cat:"operators", type:"op_or", isReporter:true, text:"{true} or {true}", defaultVals:["true","true"] },
  { cat:"operators", type:"op_not", isReporter:true, text:"not {true}", defaultVal:"true" },
  { cat:"operators", type:"op_join", isReporter:true, text:"join {hello } {world}", defaultVals:["hello ","world"] },
  { cat:"operators", type:"op_letter", isReporter:true, text:"letter {1} of {world}", defaultVals:[1,"world"] },
  { cat:"operators", type:"op_length", isReporter:true, text:"length of {world}", defaultVal:"world" },
  { cat:"operators", type:"op_contains", isReporter:true, text:"{world} contains {o}?", defaultVals:["world","o"] },
  { cat:"operators", type:"op_mod", isReporter:true, text:"{10} mod {3}", defaultVals:[10,3] },
  { cat:"operators", type:"op_round", isReporter:true, text:"round {3.14}", defaultVal:3.14 },
  { cat:"operators", type:"op_math", isReporter:true, text:"[menu] of {10}",
    options:[{label:"abs",value:"abs"},{label:"floor",value:"floor"},{label:"ceiling",value:"ceil"},{label:"sqrt",value:"sqrt"},{label:"sin",value:"sin"},{label:"cos",value:"cos"},{label:"tan",value:"tan"},{label:"asin",value:"asin"},{label:"acos",value:"acos"},{label:"atan",value:"atan"},{label:"ln",value:"ln"},{label:"log",value:"log"},{label:"e^",value:"e"},{label:"10^",value:"10pow"}], defaultVal:10 },

  // ==========================================================
  // VARIABLES
  // ==========================================================

  { cat:"variables", type:"set_var", text:"set [my variable] to {0}", defaultVal:0, optionsSource:"variables" },
  { cat:"variables", type:"change_var", text:"change [my variable] by {1}", defaultVal:1, optionsSource:"variables" },
  { cat:"variables", type:"show_var", text:"show variable [my variable]", optionsSource:"variables" },
  { cat:"variables", type:"hide_var", text:"hide variable [my variable]", optionsSource:"variables" },
  { cat:"variables", type:"var_reporter", isReporter:true, hasCheckbox:true, text:"[my variable]", optionsSource:"variables" },
  
  // List blocks are injected dynamically after a list is created.

  // ==========================================================
  // MY BLOCKS
  // ==========================================================
  // Custom blocks are injected dynamically after the user clicks Make a Block.
];


// ============================================================
// CANVAS
// ============================================================

const canvas =
  document.getElementById("stage");

const ctx =
  canvas
    ? canvas.getContext("2d")
    : null;

const sayBubble =
  document.getElementById("say-bubble");


// ============================================================
// POINTER / MOUSE TRACKING
// ============================================================

window.mouseX = null;
window.mouseY = null;


let stageSpriteDrag = null;
function stagePointFromEvent(e) {
  if (!canvas) return {x:0,y:0};
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX-r.left)/r.width)*480-240, y: 180-((e.clientY-r.top)/r.height)*360 };
}
function spriteHitTest(pt) {
  const half = Math.max(18, 42 * (state.sprite.size/100));
  return Math.abs(pt.x-state.sprite.x) <= half && Math.abs(pt.y-state.sprite.y) <= half;
}
if (canvas) {
  canvas.addEventListener("pointerdown", e => {
    if (state.dragMode !== "draggable" || e.button !== 0 || !state.sprite.visible) return;
    const pt = stagePointFromEvent(e);
    if (!spriteHitTest(pt)) return;
    stageSpriteDrag = {id:e.pointerId};
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", e => {
    if (!stageSpriteDrag || e.pointerId !== stageSpriteDrag.id) return;
    const pt = stagePointFromEvent(e);
    state.sprite.x = Math.max(-240, Math.min(240, pt.x));
    state.sprite.y = Math.max(-180, Math.min(180, pt.y));
    renderStage();
  });
  const endStageDrag = e => { if (stageSpriteDrag && e.pointerId === stageSpriteDrag.id) stageSpriteDrag = null; };
  canvas.addEventListener("pointerup", endStageDrag);
  canvas.addEventListener("pointercancel", endStageDrag);
}

function updatePointerPosition(e) {

  if (!e) {
    return;
  }

  if (
    typeof e.clientX === "number" &&
    typeof e.clientY === "number"
  ) {

    window.mouseX =
      e.clientX;

    window.mouseY =
      e.clientY;
  }
}


if (canvas) {

  canvas.addEventListener(
    "pointermove",
    (e) => {
      updatePointerPosition(e);
    },
    { passive: true }
  );

  canvas.addEventListener(
    "mousemove",
    (e) => {
      updatePointerPosition(e);
    },
    { passive: true }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {

      if (
        e.touches &&
        e.touches[0]
      ) {

        window.mouseX =
          e.touches[0].clientX;

        window.mouseY =
          e.touches[0].clientY;
      }

    },
    { passive: true }
  );
}


// ============================================================
// DIRECTION
// ============================================================

function normalizeDirection(
  direction
) {

  let result =
    Number(direction) % 360;

  if (!Number.isFinite(result)) {
    result = 90;
  }

  if (result < 0) {
    result += 360;
  }

  return result;
}


// ============================================================
// CLAMP
// ============================================================

function clamp(
  value,
  min,
  max
) {

  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}


// ============================================================
// RANDOM POSITION
// ============================================================

function getRandomPosition() {

  if (!canvas) {

    return {
      x: 0,
      y: 0
    };
  }

  const maxX =
    canvas.width / 2 - 25;

  const maxY =
    canvas.height / 2 - 25;

  return {

    x:
      Math.random() *
        (maxX * 2) -
      maxX,

    y:
      Math.random() *
        (maxY * 2) -
      maxY
  };
}


// ============================================================
// MOUSE POSITION
// ============================================================

function getMousePosition() {

  if (!canvas) {

    return {
      x: 0,
      y: 0
    };
  }

  const rect =
    canvas.getBoundingClientRect();

  const scaleX =
    canvas.width /
    rect.width;

  const scaleY =
    canvas.height /
    rect.height;

  const mouseScreenX =
    typeof window.mouseX === "number"
      ? window.mouseX
      : rect.left +
        rect.width / 2;

  const mouseScreenY =
    typeof window.mouseY === "number"
      ? window.mouseY
      : rect.top +
        rect.height / 2;

  return {

    x:
      (
        mouseScreenX -
        rect.left
      ) *
        scaleX -
      canvas.width / 2,

    y:
      -(
        (
          mouseScreenY -
          rect.top
        ) *
          scaleY -
        canvas.height / 2
      )
  };
}


// ============================================================
// SPRITE INFO
// ============================================================

function updateSpriteInfo() {

  const spriteX =
    document.getElementById("sprite-x");

  const spriteY =
    document.getElementById("sprite-y");

  const spriteDir =
    document.getElementById("sprite-dir");

  const spriteSize =
    document.getElementById("sprite-size");

  if (spriteX) {
    spriteX.value =
      Math.round(state.sprite.x);
  }

  if (spriteY) {
    spriteY.value =
      Math.round(state.sprite.y);
  }

  if (spriteDir) {
    spriteDir.value =
      Math.round(
        normalizeDirection(
          state.sprite.direction
        )
      );
  }

  if (spriteSize) {
    spriteSize.value =
      Math.round(state.sprite.size);
  }
}


// ============================================================
// LOOKS HELPERS
// ============================================================

const costumeList =
  COSTUME_DEFINITIONS.map(
    (costume) =>
      costume.name
  );

const backdropList =
  BACKDROP_DEFINITIONS.map(
    (backdrop) =>
      backdrop.name
  );


function getCostumeNumber() {

  const index =
    costumeList.indexOf(
      state.sprite.costume
    );

  return index >= 0
    ? index + 1
    : 1;
}


function getBackdropNumber() {

  const index =
    backdropList.indexOf(
      state.backdrop.current
    );

  return index >= 0
    ? index + 1
    : 1;
}


function nextCostume() {

  let index =
    costumeList.indexOf(
      state.sprite.costume
    );

  if (index < 0) {

    index = 0;

  } else {

    index =
      (
        index + 1
      ) %
      costumeList.length;
  }

  state.sprite.costume =
    costumeList[index];
}


function nextBackdrop() {

  let index =
    backdropList.indexOf(
      state.backdrop.current
    );

  if (index < 0) {

    index = 0;

  } else {

    index =
      (
        index + 1
      ) %
      backdropList.length;
  }

  state.backdrop.current =
    backdropList[index];
}


// ============================================================
// GRAPHIC EFFECT HELPERS
// ============================================================

function getGraphicEffectValue(
  effect
) {

  if (
    !GRAPHIC_EFFECT_NAMES.includes(
      effect
    )
  ) {

    return 0;
  }

  return Number(
    state.sprite.graphicEffects[effect]
  ) || 0;
}


function normalizeColorEffect(
  value
) {

  let result =
    Number(value) || 0;

  result =
    result % 200;

  if (result < 0) {
    result += 200;
  }

  return result;
}


function setGraphicEffect(
  effect,
  value
) {

  if (
    !GRAPHIC_EFFECT_NAMES.includes(
      effect
    )
  ) {

    return;
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return;
  }

  switch (effect) {

    case "color":

      state.sprite.graphicEffects.color =
        normalizeColorEffect(number);

      break;

    case "ghost":

      state.sprite.graphicEffects.ghost =
        clamp(
          number,
          0,
          100
        );

      break;

    case "brightness":

      state.sprite.graphicEffects.brightness =
        clamp(
          number,
          -100,
          100
        );

      break;

    default:

      state.sprite.graphicEffects[effect] =
        clamp(
          number,
          -100,
          100
        );

      break;
  }
}


function changeGraphicEffect(
  effect,
  amount
) {

  if (
    !GRAPHIC_EFFECT_NAMES.includes(
      effect
    )
  ) {

    return;
  }

  const current =
    getGraphicEffectValue(effect);

  const number =
    Number(amount);

  if (!Number.isFinite(number)) {
    return;
  }

  setGraphicEffect(
    effect,
    current + number
  );
}


function clearGraphicEffects() {

  state.sprite.graphicEffects = {

    color: 0,
    fisheye: 0,
    whirl: 0,
    pixelate: 0,
    mosaic: 0,
    brightness: 0,
    ghost: 0
  };
}


// ============================================================
// BUBBLE HELPERS
// ============================================================

function setBubble(
  text,
  type = "say"
) {

  state.sprite.sayText =
    text || "";

  state.sprite.bubbleType =
    type === "think"
      ? "think"
      : "say";

  renderStage();
}


async function waitWhileRunning(
  seconds
) {

  const safeSeconds =
    Number.isFinite(
      Number(seconds)
    )
      ? Math.max(
          0,
          Number(seconds)
        )
      : 0;

  const endTime =
    performance.now() +
    safeSeconds * 1000;

  while (
    state.isRunning &&
    performance.now() <
      endTime
  ) {

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          50
        )
    );
  }
}


// ============================================================
// RENDER BACKDROP
// ============================================================

function renderBackdrop() {

  if (!ctx || !canvas) {
    return;
  }

  // Backdrop dari pustaka (gambar SVG)
  const artBackdrop =
    BACKDROP_DEFINITIONS.find(b => b.name === state.backdrop.current);

  if (artBackdrop && artBackdrop.svg) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const bdImg = getArtImage(artBackdrop.svg);
    if (bdImg.complete && bdImg.naturalWidth) {
      ctx.drawImage(bdImg, 0, 0, canvas.width, canvas.height);
    }
    return;
  }

  if (
    state.backdrop.current ===
    "backdrop1"
  ) {

    ctx.fillStyle =
      "#ffffff";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    return;
  }


  if (
    state.backdrop.current ===
    "backdrop2"
  ) {

    ctx.fillStyle =
      "#dff4ff";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.fillStyle =
      "#b8e986";

    ctx.fillRect(
      0,
      canvas.height * 0.72,
      canvas.width,
      canvas.height * 0.28
    );

    ctx.fillStyle =
      "#ffd93d";

    ctx.beginPath();

    ctx.arc(
      canvas.width - 60,
      60,
      28,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      "#ffffff";

    ctx.beginPath();

    ctx.arc(
      80,
      80,
      20,
      0,
      Math.PI * 2
    );

    ctx.arc(
      105,
      72,
      26,
      0,
      Math.PI * 2
    );

    ctx.arc(
      135,
      82,
      18,
      0,
      Math.PI * 2
    );

    ctx.fill();

    return;
  }


  if (
    state.backdrop.current ===
    "backdrop3"
  ) {

    ctx.fillStyle =
      "#162447";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.fillStyle =
      "#fff4bd";

    ctx.beginPath();

    ctx.arc(
      canvas.width - 70,
      65,
      30,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      "#162447";

    ctx.beginPath();

    ctx.arc(
      canvas.width - 58,
      55,
      28,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      "#ffffff";

    const stars = [
      [45, 45],
      [100, 125],
      [170, 55],
      [240, 100],
      [320, 45],
      [390, 130],
      [canvas.width - 120, 150],
      [canvas.width - 40, 115]
    ];

    stars.forEach(
      ([x, y]) => {

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          2,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    );

    ctx.fillStyle =
      "#203864";

    ctx.fillRect(
      0,
      canvas.height * 0.78,
      canvas.width,
      canvas.height * 0.22
    );
  }
}


// ============================================================
// DRAW CAT
// ============================================================

function drawCat(
  targetCtx,
  forceCat
) {

  const costume =
    state.sprite.costume;

  // Sprite dari pustaka (gambar SVG)
  if (!forceCat) {
    const artDef =
      COSTUME_DEFINITIONS.find(c => c.name === costume) ||
      COSTUME_DEFINITIONS[0];

    if (artDef && artDef.svg) {
      const img = getArtImage(artDef.svg);
      if (img.complete && img.naturalWidth) {
        targetCtx.drawImage(img, -42, -42, 84, 84);
      }
      return;
    }
  }

  let catColor =
    "#FFAB19";

  if (
    costume === "costume2"
  ) {
    catColor =
      "#FF4C4C";
  }

  if (
    costume === "costume3"
  ) {
    catColor =
      "#4C97FF";
  }


  // BODY

  targetCtx.fillStyle =
    catColor;

  targetCtx.beginPath();

  targetCtx.arc(
    0,
    0,
    25,
    0,
    Math.PI * 2
  );

  targetCtx.fill();


  // EARS

  targetCtx.fillStyle =
    catColor;

  targetCtx.beginPath();

  targetCtx.moveTo(
    -15,
    -15
  );

  targetCtx.lineTo(
    -25,
    -35
  );

  targetCtx.lineTo(
    -5,
    -22
  );

  targetCtx.closePath();

  targetCtx.moveTo(
    15,
    -15
  );

  targetCtx.lineTo(
    25,
    -35
  );

  targetCtx.lineTo(
    5,
    -22
  );

  targetCtx.closePath();

  targetCtx.fill();


  // COSTUME 2 DETAIL

  if (
    costume === "costume2"
  ) {

    targetCtx.fillStyle =
      "#ffffff";

    targetCtx.beginPath();

    targetCtx.arc(
      0,
      8,
      8,
      0,
      Math.PI * 2
    );

    targetCtx.fill();
  }


  // COSTUME 3 DETAIL

  if (
    costume === "costume3"
  ) {

    targetCtx.fillStyle =
      "#ffffff";

    targetCtx.beginPath();

    targetCtx.arc(
      -8,
      7,
      5,
      0,
      Math.PI * 2
    );

    targetCtx.arc(
      8,
      7,
      5,
      0,
      Math.PI * 2
    );

    targetCtx.fill();
  }


  // EYES

  targetCtx.fillStyle =
    "#000000";

  targetCtx.beginPath();

  targetCtx.arc(
    -8,
    -5,
    3,
    0,
    Math.PI * 2
  );

  targetCtx.arc(
    8,
    -5,
    3,
    0,
    Math.PI * 2
  );

  targetCtx.fill();


  // NOSE

  targetCtx.fillStyle =
    "#ff8fa3";

  targetCtx.beginPath();

  targetCtx.arc(
    0,
    3,
    2.5,
    0,
    Math.PI * 2
  );

  targetCtx.fill();
}


// ============================================================
// RENDER SPRITE EFFECT APPROXIMATION
// ============================================================

function drawSpriteWithEffects() {

  if (!ctx || !canvas) {
    return;
  }

  const effects =
    state.sprite.graphicEffects;

  const colorEffect =
    Number(effects.color) || 0;

  const brightness =
    Number(effects.brightness) || 0;

  const ghost =
    clamp(
      Number(effects.ghost) || 0,
      0,
      100
    );

  const fisheye =
    clamp(
      Number(effects.fisheye) || 0,
      -100,
      100
    );

  const whirl =
    clamp(
      Number(effects.whirl) || 0,
      -100,
      100
    );

  const pixelate =
    clamp(
      Number(effects.pixelate) || 0,
      0,
      100
    );

  const mosaic =
    clamp(
      Number(effects.mosaic) || 0,
      0,
      100
    );

  ctx.globalAlpha =
    1 - ghost / 100;

  const filters = [];

  if (colorEffect !== 0) {

    filters.push(
      `hue-rotate(${colorEffect * 1.8}deg)`
    );
  }

  if (brightness !== 0) {

    filters.push(
      `brightness(${Math.max(
        0,
        1 + brightness / 100
      )})`
    );
  }

  ctx.filter =
    filters.length
      ? filters.join(" ")
      : "none";

  const fisheyeScale =
    1 +
    fisheye / 500;

  ctx.scale(
    fisheyeScale,
    1 / Math.max(
      0.5,
      fisheyeScale
    )
  );

  if (whirl !== 0) {

    ctx.rotate(
      whirl *
      Math.PI /
      180 *
      0.35
    );
  }

  if (pixelate > 0) {

    ctx.imageSmoothingEnabled =
      false;

    const pixelScale =
      Math.max(
        0.55,
        1 -
        pixelate / 160
      );

    ctx.scale(
      pixelScale,
      pixelScale
    );
  }

  drawCat(ctx);

  if (mosaic > 0) {

    const amount =
      Math.min(
        3,
        Math.floor(
          mosaic / 25
        )
      );

    if (amount > 0) {

      ctx.globalAlpha =
        (
          1 -
          ghost / 100
        ) *
        0.25;

      for (
        let i = 1;
        i <= amount;
        i++
      ) {

        ctx.save();

        const offset =
          i * 32;

        ctx.translate(
          offset,
          0
        );

        drawCat(ctx);

        ctx.restore();

        ctx.save();

        ctx.translate(
          -offset,
          0
        );

        drawCat(ctx);

        ctx.restore();
      }
    }
  }

  ctx.imageSmoothingEnabled =
    true;

  ctx.globalAlpha =
    1;

  ctx.filter =
    "none";
}


// ============================================================
// RENDER SAY / THINK BUBBLE
// RESPONSIVE FIX
// ============================================================

function renderBubble(
  canvasX,
  canvasY
) {

  if (!sayBubble || !canvas) {
    return;
  }

  if (
    !state.sprite.visible ||
    !state.sprite.sayText
  ) {

    sayBubble.style.display =
      "none";

    sayBubble.innerText =
      "";

    sayBubble.classList.remove(
      "think-bubble"
    );

    return;
  }

  const stageWrapper =
    canvas.parentElement;

  if (!stageWrapper) {
    return;
  }

  const canvasRect =
    canvas.getBoundingClientRect();

  const wrapperRect =
    stageWrapper.getBoundingClientRect();

  const scaleX =
    canvasRect.width /
    canvas.width;

  const scaleY =
    canvasRect.height /
    canvas.height;

  const bubbleX =
    (
      canvasX *
      scaleX
    ) +
    (
      canvasRect.left -
      wrapperRect.left
    );

  const bubbleY =
    (
      canvasY *
      scaleY
    ) +
    (
      canvasRect.top -
      wrapperRect.top
    );

  sayBubble.style.display =
    "block";

  sayBubble.innerText =
    state.sprite.sayText;

  sayBubble.style.left =
    `${bubbleX + 15 * scaleX}px`;

  sayBubble.style.top =
    `${bubbleY - 40 * scaleY}px`;

  if (
    state.sprite.bubbleType ===
    "think"
  ) {

    sayBubble.classList.add(
      "think-bubble"
    );

  } else {

    sayBubble.classList.remove(
      "think-bubble"
    );
  }
}


// ============================================================
// BUBBLE CSS
// ============================================================

function installBubbleStyles() {

  if (
    document.getElementById(
      "runtime-bubble-style"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "runtime-bubble-style";

  style.textContent = `

    #say-bubble.think-bubble {
      border-radius: 18px !important;
      position: absolute;
    }

    #say-bubble.think-bubble::before {
      content: "";
      position: absolute;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #ffffff;
      left: 7px;
      bottom: -12px;
      box-shadow:
        10px 8px 0 -2px #ffffff;
    }

    /* MOBILE BUBBLE */

    @media (max-width: 600px) {

      #say-bubble {
        max-width: 150px !important;
        font-size: 11px !important;
        line-height: 1.3 !important;
        padding: 7px 10px !important;
        word-break: break-word;
      }

    }

  `;

  document.head.appendChild(
    style
  );
}


installBubbleStyles();


// ============================================================
// RENDER STAGE
// ============================================================

function renderStage() {

  if (!canvas || !ctx) {
    return;
  }

  ctx.setTransform(
    1,
    0,
    0,
    1,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  renderBackdrop();

  if (!state.sprite.visible) {

    if (sayBubble) {

      sayBubble.style.display =
        "none";

      sayBubble.innerText =
        "";
    }

    updateSpriteInfo();

    return;
  }

  const canvasX =
    state.sprite.x +
    canvas.width / 2;

  const canvasY =
    -state.sprite.y +
    canvas.height / 2;

  ctx.save();

  ctx.translate(
    canvasX,
    canvasY
  );

  const direction =
    normalizeDirection(
      state.sprite.direction
    );

  if (
    state.sprite.rotationStyle ===
    "all-around"
  ) {

    const rotation =
      (
        direction -
        90
      ) *
      Math.PI /
      180;

    ctx.rotate(
      rotation
    );

  } else if (
    state.sprite.rotationStyle ===
    "left-right"
  ) {

    if (
      direction > 180 &&
      direction < 360
    ) {

      ctx.scale(
        -1,
        1
      );
    }
  }

  const scale =
    Math.max(
      0.01,
      state.sprite.size / 100
    );

  ctx.scale(
    scale,
    scale
  );

  drawSpriteWithEffects();

  ctx.restore();

  updateSpriteInfo();

  renderBubble(
    canvasX,
    canvasY
  );

  renderSensingMonitors();
  renderReporterMonitors();
}


// ============================================================
// CATEGORY COLORS
// ============================================================

const categoryColors = {

  motion:
    "#4c97ff",

  looks:
    "#9966ff",

  sound:
    "#cf63cf",

  events:
    "#ffbf00",

  control:
    "#ffab19",

  sensing:
    "#5cb1d6",

  operators:
    "#59c059",

  variables:
    "#ff8c1a",

  myblocks:
    "#ff6680"
};


const categoryTextColors = {

  motion:
    "#ffffff",

  looks:
    "#ffffff",

  sound:
    "#ffffff",

  events:
    "#575e75",

  control:
    "#ffffff",

  sensing:
    "#ffffff",

  operators:
    "#ffffff",

  variables:
    "#ffffff",

  myblocks:
    "#ffffff"
};


// ============================================================
// DROPDOWN CSS
// ============================================================

function installDropdownStyles() {

  if (
    document.getElementById(
      "runtime-dropdown-style"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "runtime-dropdown-style";

  style.textContent = `

    .custom-dropdown {
      position: relative !important;
      display: inline-block !important;
      vertical-align: middle !important;
      min-width: 90px;
      z-index: 1000;
      touch-action: manipulation;
    }

    .custom-dropdown-selected {
      position: relative !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      min-height: 23px !important;
      padding: 3px 24px 3px 9px !important;
      border-radius: 12px !important;
      font-size: 11px !important;
      font-weight: bold !important;
      line-height: 16px !important;
      white-space: nowrap !important;
      cursor: pointer !important;
      user-select: none !important;
      box-sizing: border-box !important;
      touch-action: manipulation;
    }

    .custom-dropdown-selected::after {
      content: "▾";
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 10px;
      pointer-events: none;
    }

    .custom-dropdown-menu {
      position: fixed !important;
      display: none !important;
      min-width: 100px;
      max-width: min(300px, calc(100vw - 16px));
      max-height: min(220px, 45vh);
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      padding: 3px 0;
      border-radius: 7px;
      box-shadow:
        0 5px 18px rgba(0,0,0,.30);
      border:
        1px solid rgba(0,0,0,.18);
      z-index:
        2147483647 !important;
      box-sizing:
        border-box;
      touch-action: pan-y;
    }

    .custom-dropdown-menu.open {
      display: block !important;
    }

    .custom-dropdown-option {
      display: block !important;
      padding: 8px 10px !important;
      min-height: 32px;
      font-size: 11px !important;
      font-weight: bold !important;
      line-height: 14px !important;
      white-space: nowrap !important;
      cursor: pointer !important;
      box-sizing: border-box !important;
      touch-action: manipulation;
    }

    .custom-dropdown-option:hover {
      filter: brightness(.88);
    }

    .custom-dropdown-option:active {
      filter: brightness(.78);
    }

  `;

  document.head.appendChild(
    style
  );
}


installDropdownStyles();


// ============================================================
// CLOSE DROPDOWNS
// ============================================================

function closeAllDropdowns(
  removeMenus = false
) {

  document
    .querySelectorAll(
      ".custom-dropdown.open"
    )
    .forEach(
      (dropdown) => {

        dropdown.classList.remove(
          "open"
        );
      }
    );

  document
    .querySelectorAll(
      ".custom-dropdown-menu.open"
    )
    .forEach(
      (menu) => {

        menu.classList.remove(
          "open"
        );
      }
    );

  if (removeMenus) {

    document
      .querySelectorAll(
        ".custom-dropdown-menu"
      )
      .forEach(
        (menu) => {

          menu.remove();
        }
      );
  }
}


// ============================================================
// POSITION DROPDOWN
// ============================================================

function positionDropdownMenu(
  dropdown
) {

  if (!dropdown) {
    return;
  }

  const selected =
    dropdown.querySelector(
      ".custom-dropdown-selected"
    );

  const menu =
    dropdown._dropdownMenu;

  if (
    !selected ||
    !menu
  ) {
    return;
  }

  const rect =
    selected.getBoundingClientRect();

  menu.style.minWidth =
    `${Math.max(
      rect.width,
      100
    )}px`;

  menu.style.left =
    `${Math.round(
      rect.left
    )}px`;

  menu.style.top =
    `${Math.round(
      rect.bottom + 4
    )}px`;

  menu.classList.add(
    "open"
  );

  const menuRect =
    menu.getBoundingClientRect();

  if (
    rect.bottom +
      menuRect.height >
    window.innerHeight - 8
  ) {

    if (
      rect.top -
        menuRect.height >
      8
    ) {

      menu.style.top =
        `${Math.round(
          rect.top -
          menuRect.height -
          4
        )}px`;
    }
  }

  const maxLeft =
    window.innerWidth -
    menuRect.width -
    8;

  if (
    parseFloat(
      menu.style.left
    ) >
    maxLeft
  ) {

    menu.style.left =
      `${Math.max(
        8,
        maxLeft
      )}px`;
  }

  if (
    parseFloat(
      menu.style.left
    ) < 8
  ) {

    menu.style.left =
      "8px";
  }
}


// ============================================================
// DYNAMIC PALETTE OPTIONS
// ============================================================

function getDynamicOptions(def) {
  if (!def || !def.optionsSource) return def?.options || [];
  if (def.optionsSource === "variables") {
    const names = Object.keys(state.variables || {});
    const base = names.length ? names.map(name => ({label:name, value:name})) : [{label:"my variable", value:"my variable"}];
    const current = base[0]?.label || "my variable";
    return [...base,
      {label:"rename variable", value:"__rename_variable__", isVariableAction:true},
      {label:`delete this "${current}" variable`, value:"__delete_variable__", isVariableAction:true}
    ];
  }
  if (def.optionsSource === "lists") {
    const names = Object.keys(state.lists || {});
    return names.length ? names.map(name => ({label:name, value:name})) : [{label:"my list", value:"my list"}];
  }
  if (def.optionsSource === "myblocks") {
    return Object.keys(state.myBlocks || {}).map(name => ({label:name, value:name}));
  }
  if (def.optionsSource === "sounds") {
    return getSoundOptions();
  }
  if (def.optionsSource === "broadcasts") {
    const messages = Array.isArray(state.broadcastMessages) && state.broadcastMessages.length ? state.broadcastMessages : ["message1"];
    return [...messages.map(name => ({label:name, value:name})), {label:"new message", value:"__new_message__"}];
  }
  return def.options || [];
}

// ============================================================
// CREATE CUSTOM DROPDOWN
// ============================================================

function createCustomDropdown(
  def
) {

  const dropdown =
    document.createElement("div");

  dropdown.className =
    `custom-dropdown dropdown-${def.cat}`;

  const categoryColor =
    categoryColors[def.cat] ||
    "#4c97ff";

  const categoryTextColor =
    categoryTextColors[def.cat] ||
    "#ffffff";

  const firstOption =
    def.options &&
    def.options.length
      ? (def.options.find((o) => !o.isSoundAction) || null)
      : null;

  if (def.optionsSource === "sounds") {
    dropdown.dataset.source = "sounds";
  }

  dropdown.dataset.value =
    firstOption
      ? firstOption.value
      : "";

  dropdown.style.setProperty(
    "--dropdown-color",
    categoryColor
  );

  dropdown.style.setProperty(
    "--dropdown-text",
    categoryTextColor
  );

  const selected =
    document.createElement("div");

  selected.className =
    "custom-dropdown-selected";

  selected.textContent =
    firstOption
      ? firstOption.label
      : (def.optionsSource === "sounds" ? "—" : "");

  selected.style.backgroundColor =
    categoryColor;

  selected.style.color =
    categoryTextColor;

  selected.setAttribute(
    "role",
    "button"
  );

  selected.setAttribute(
    "tabindex",
    "0"
  );

  const menu =
    document.createElement("div");

  menu.className =
    "custom-dropdown-menu";

  menu.style.backgroundColor =
    categoryColor;

  menu.style.color =
    categoryTextColor;

  document.body.appendChild(
    menu
  );

  dropdown._dropdownMenu =
    menu;


  function buildMenuOptions(optionList) {

    optionList.forEach(
      (option) => {

        const optionElement =
          document.createElement("div");

        optionElement.className =
          "custom-dropdown-option";

        optionElement.textContent =
          option.label;

        optionElement.dataset.value =
          option.value;

        optionElement.style.backgroundColor =
          categoryColor;

        optionElement.style.color =
          categoryTextColor;


        optionElement.addEventListener(
          "pointerdown",
          (e) => {

            e.preventDefault();
            e.stopPropagation();

            if (def.optionsSource === "variables" && option.value === "__rename_variable__") {
              const oldName = dropdown.dataset.value || Object.keys(state.variables || {})[0] || "my variable";
              const nextName = String(window.prompt(`Rename variable "${oldName}"`, oldName) || "").trim();
              if (nextName && nextName !== oldName && state.variables[oldName] !== undefined && state.variables[nextName] === undefined) {
                state.variables[nextName] = state.variables[oldName];
                delete state.variables[oldName];
                state.variableMeta[nextName] = state.variableMeta[oldName] || {visible:true, scope:"all"};
                delete state.variableMeta[oldName];
                renderVariablePaletteAndMonitors();
              }
              closeAllDropdowns();
              return;
            }

            if (def.optionsSource === "variables" && option.value === "__delete_variable__") {
              const name = dropdown.dataset.value || Object.keys(state.variables || {})[0] || "my variable";
              if (state.variables[name] !== undefined && window.confirm(`Delete variable "${name}"?`)) {
                delete state.variables[name];
                delete state.variableMeta[name];
                renderVariablePaletteAndMonitors();
              }
              closeAllDropdowns();
              return;
            }

            if (def.optionsSource === "sounds" && option.value === "__record_sound__") {
              closeAllDropdowns();
              openSoundRecorder((snd) => {
                dropdown.dataset.value = snd.name;
                selected.textContent = snd.name;
              });
              return;
            }

            if (def.optionsSource === "broadcasts" && option.value === "__new_message__") {
              const message = window.prompt("New Message", "");
              const clean = String(message || "").trim();
              if (clean) {
                state.broadcastMessages = Array.isArray(state.broadcastMessages) ? state.broadcastMessages : ["message1"];
                if (!state.broadcastMessages.includes(clean)) state.broadcastMessages.push(clean);
                dropdown.dataset.value = clean;
                selected.textContent = clean;
              }
              closeAllDropdowns();
              return;
            }

            dropdown.dataset.value =
              option.value;

            selected.textContent =
              option.label;

            closeAllDropdowns();
          }
        );


        optionElement.addEventListener(
          "click",
          (e) => {

            e.preventDefault();
            e.stopPropagation();
          }
        );


        menu.appendChild(
          optionElement
        );
      }
    );
  }

  if (def.options && def.options.length) {
    buildMenuOptions(def.options);
  }

  dropdown._rebuildOptions = (list) => {
    menu.innerHTML = "";
    buildMenuOptions(list);
    const current = list.find(
      (o) => !o.isSoundAction && o.value === dropdown.dataset.value
    );
    if (current) {
      selected.textContent = current.label;
    } else {
      const fallback = list.find((o) => !o.isSoundAction);
      dropdown.dataset.value = fallback ? fallback.value : "";
      selected.textContent = fallback ? fallback.label : "—";
    }
  };

  function toggleDropdown(e) {

    e.preventDefault();
    e.stopPropagation();

    const wasOpen =
      dropdown.classList.contains(
        "open"
      );

    closeAllDropdowns();

    if (wasOpen) {
      return;
    }

    if (def.optionsSource === "variables") {
      const currentName = dropdown.dataset.value || Object.keys(state.variables || {})[0] || "my variable";
      menu.querySelectorAll('[data-value="__delete_variable__"]').forEach(el => { el.textContent = `delete this "${currentName}" variable`; });
    }

    dropdown.classList.add(
      "open"
    );

    positionDropdownMenu(
      dropdown
    );
  }


  selected.addEventListener(
    "pointerdown",
    toggleDropdown
  );


  selected.addEventListener(
    "click",
    (e) => {

      e.preventDefault();
      e.stopPropagation();
    }
  );


  menu.addEventListener(
    "pointerdown",
    (e) => {
      e.stopPropagation();
    }
  );


  menu.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
    }
  );


  dropdown.addEventListener(
    "pointerdown",
    (e) => {
      e.stopPropagation();
    }
  );


  selected.addEventListener(
    "keydown",
    (e) => {

      if (
        e.key === "Enter" ||
        e.key === " "
      ) {

        e.preventDefault();

        toggleDropdown(e);
      }

      if (
        e.key === "Escape"
      ) {

        closeAllDropdowns();
      }
    }
  );


  dropdown.appendChild(
    selected
  );

  return dropdown;
}


// ============================================================
// DRAG PROTECTION
// ============================================================

function protectInteractiveElement(
  element,
  owner
) {

  if (
    !element ||
    !owner
  ) {
    return;
  }

  const original =
    owner.draggable;

  element.addEventListener(
    "pointerdown",
    (e) => {

      e.stopPropagation();

      owner.draggable =
        false;

      const restore =
        () => {

          owner.draggable =
            original;

          window.removeEventListener(
            "pointerup",
            restore
          );

          window.removeEventListener(
            "mouseup",
            restore
          );
        };

      window.addEventListener(
        "pointerup",
        restore
      );

      window.addEventListener(
        "mouseup",
        restore
      );
    }
  );

  element.addEventListener(
    "mousedown",
    (e) => {
      e.stopPropagation();
    }
  );

  element.addEventListener(
    "touchstart",
    (e) => {
      e.stopPropagation();
    },
    { passive: true }
  );
}


// ============================================================
// CONTROL C-BLOCK HELPERS
// ============================================================

function getControlBranchCount(type) {
  if (type === "if_else") return 2;
  if (["repeat", "forever", "if", "repeat_until"].includes(type)) return 1;
  return 0;
}

function isControlCBlock(type) {
  return getControlBranchCount(type) > 0;
}

function ensureControlBranches(blockData) {
  if (!blockData || !isControlCBlock(blockData.type)) return;
  const count = getControlBranchCount(blockData.type);
  if (!Array.isArray(blockData.branches)) {
    blockData.branches = Array.from({length: count}, () => []);
  } else {
    while (blockData.branches.length < count) blockData.branches.push([]);
  }
}

function getControlBranchBlocks(blockData, branchIndex = 0) {
  if (!blockData || !isControlCBlock(blockData.type)) return [];
  ensureControlBranches(blockData);
  return blockData.branches[branchIndex] || [];
}

function updateControlBlockLayout(blockElement) {
  if (!blockElement || !isControlCBlock(blockElement.dataset.type)) return;

  const slots = Array.from(blockElement.querySelectorAll(":scope > .control-slot"));
  if (!slots.length) return;

  // The empty cavity must be large enough to accept a block anywhere
  // inside the visible C-shaped opening (not just at the first 30px).
  // When blocks already exist, keep enough room for the whole stack plus
  // a small drop area below it so another block can be appended underneath.
  const heights = slots.map(slot => {
    const children = Array.from(slot.children);
    const childHeight = children.reduce((sum, child) => {
      return sum + Math.max(30, child.getBoundingClientRect().height / Math.max(workspaceZoom || 1, 0.01));
    }, 0);

    const MIN_CAVITY_HEIGHT = 52;
    const DROP_PADDING = 6;
    return Math.max(MIN_CAVITY_HEIGHT, childHeight + (children.length ? DROP_PADDING : 0));
  });

  const headerHeight = 43;
  const footerHeight = blockElement.dataset.type === "if_else" ? 32 : 38;
  const separator = blockElement.dataset.type === "if_else" ? 28 : 0;
  const totalHeight = headerHeight + heights.reduce((a, b) => a + b, 0) + separator + footerHeight;

  blockElement.style.height = `${Math.max(96, totalHeight)}px`;
  blockElement.style.setProperty("--control-slot-1-height", `${heights[0] || 30}px`);
  blockElement.style.setProperty("--control-slot-2-height", `${heights[1] || 30}px`);

  slots.forEach((slot, index) => {
    slot.style.height = `${heights[index] || 30}px`;
  });

  // Lebarkan blok C supaya blok di dalam rongga tidak terpotong.
  const ARM = 15;
  let maxChildWidth = 0;
  slots.forEach(slot => {
    Array.from(slot.children).forEach(child => {
      if (child.classList && child.classList.contains("scratch-block")) {
        maxChildWidth = Math.max(maxChildWidth, child.offsetWidth);
        if (blockElement._controlObserver) blockElement._controlObserver.observe(child);
      }
    });
  });
  const wantedMinWidth = maxChildWidth ? `${ARM + maxChildWidth}px` : "";
  if (blockElement.style.minWidth !== wantedMinWidth) {
    blockElement.style.minWidth = wantedMinWidth;
  }

  drawControlShape(blockElement);
}

// Menggambar bentuk "C" ala Scratch (sudut membulat, takik atas, tab bawah)
// memakai SVG, supaya blok di dalam rongga tidak ikut terpotong (clip-path).
function drawControlShape(blockElement) {
  if (!blockElement) return;
  const svg = blockElement.querySelector(":scope > svg.control-shape");
  if (!svg) return;

  const W = blockElement.offsetWidth;
  const H = blockElement.offsetHeight;
  if (!W || !H) return;

  const slots = Array.from(blockElement.querySelectorAll(":scope > .control-slot"));
  if (!slots.length) return;

  const r = 4;                       // radius sudut
  const L = slots[0].offsetLeft || 15; // lebar lengan kiri
  const T0 = 15, T1 = 19, T2 = 33, T3 = 37; // posisi takik / tab

  let d = `M0,${r} A${r},${r} 0 0 1 ${r},0 H${T0} L${T1},4 H${T2} L${T3},0 H${W - r} A${r},${r} 0 0 1 ${W},${r}`;

  slots.forEach((slot) => {
    const top = slot.offsetTop;
    const bottom = top + slot.offsetHeight;

    // sisi bawah lengan atas + tab yang menonjol ke dalam rongga
    d += ` V${top - r} A${r},${r} 0 0 1 ${W - r},${top}`;
    d += ` H${L + T3} L${L + T2},${top + 4} H${L + T1} L${L + T0},${top} H${L + r}`;
    d += ` A${r},${r} 0 0 0 ${L},${top + r}`;

    // sisi dalam lengan kiri
    d += ` V${bottom - r} A${r},${r} 0 0 0 ${L + r},${bottom}`;

    // sisi atas lengan bawah + takik
    d += ` H${L + T0} L${L + T1},${bottom + 4} H${L + T2} L${L + T3},${bottom} H${W - r}`;
    d += ` A${r},${r} 0 0 1 ${W},${bottom + r}`;
  });

  d += ` V${H - r} A${r},${r} 0 0 1 ${W - r},${H}`;
  d += ` H${T3} L${T2},${H + 4} H${T1} L${T0},${H} H${r} A${r},${r} 0 0 1 0,${H - r} Z`;

  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.querySelector("path.control-shape-body").setAttribute("d", d);

  // Panah "ulang" di pojok kanan bawah
  const arrow = svg.querySelector("path.control-shape-arrow");
  if (arrow) {
    if (blockElement.dataset.type === "forever" || blockElement.dataset.type === "repeat" || blockElement.dataset.type === "repeat_until") {
      const ax = W - 26, ay = H - 26;
      arrow.setAttribute(
        "d",
        `M${ax + 3},${ay + 15} C${ax + 3},${ay + 7} ${ax + 8},${ay + 3} ${ax + 14},${ay + 3} L${ax + 14},${ay - 1} L${ax + 20},${ay + 4} L${ax + 14},${ay + 9} L${ax + 14},${ay + 5} C${ax + 10},${ay + 5} ${ax + 7},${ay + 8} ${ax + 7},${ay + 15} Z`
      );
      arrow.style.display = "";
    } else {
      arrow.style.display = "none";
    }
  }
}

function createControlSlots(div, def) {
  const count = getControlBranchCount(def.type);
  if (!count) return;

  for (let i = 0; i < count; i++) {
    const slot = document.createElement("div");
    slot.className = "control-slot";
    slot.dataset.branch = String(i);
    slot.setAttribute("aria-label", `Control script slot ${i + 1}`);
    div.appendChild(slot);
  }

  // Label "else" di lengan tengah blok if / else (seperti Scratch)
  if (def.type === "if_else") {
    const elseLabel = document.createElement("span");
    elseLabel.className = "control-else-label";
    elseLabel.textContent = "else";
    div.appendChild(elseLabel);
  }

  // SVG bentuk "C" (ditaruh paling bawah, di belakang teks & blok anak)
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "control-shape");
  svg.setAttribute("aria-hidden", "true");
  const body = document.createElementNS(NS, "path");
  body.setAttribute("class", "control-shape-body");
  const arrow = document.createElementNS(NS, "path");
  arrow.setAttribute("class", "control-shape-arrow");
  svg.appendChild(body);
  svg.appendChild(arrow);
  div.insertBefore(svg, div.firstChild);

  // Gambar ulang bentuk kalau ukuran blok / isi rongga berubah.
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => updateControlBlockLayout(div));
    ro.observe(div);
    div._controlObserver = ro;
  }

  requestAnimationFrame(() => updateControlBlockLayout(div));
}


// ============================================================
// REPORTER SLOTS  (menaruh blok bulat / segi enam ke dalam slot)
// ============================================================

const BOOLEAN_REPORTER_TYPES = [
  "op_gt", "op_lt", "op_eq", "op_and", "op_or", "op_not",
  "op_contains", "list_contains",
  "touching", "touching_color", "color_touching_color",
  "key_pressed", "mouse_down", "online"
];

const BOOLEAN_INPUT_HOST_TYPES = ["op_and", "op_or", "op_not"];

function isBooleanReporterType(type) {
  return BOOLEAN_REPORTER_TYPES.includes(type);
}

// Input / dropdown milik blok itu sendiri (bukan milik blok yang ditaruh di dalam slotnya).
function getOwnInputs(blockEl) {
  if (!blockEl) return [];
  return Array.from(blockEl.querySelectorAll(".block-input"))
    .filter(input => input.closest(".scratch-block") === blockEl);
}

function getOwnDropdown(blockEl) {
  if (!blockEl) return null;
  return Array.from(blockEl.querySelectorAll(".custom-dropdown"))
    .find(dd => dd.closest(".scratch-block") === blockEl) || null;
}

function relayoutControlAncestors(fromEl) {
  const run = () => {
    let el = fromEl && fromEl.closest ? fromEl.closest(".scratch-block") : null;
    while (el) {
      if (isControlCBlock(el.dataset.type)) updateControlBlockLayout(el);
      el = el.parentElement ? el.parentElement.closest(".scratch-block") : null;
    }
  };
  run();
  requestAnimationFrame(run);
}

// Membuat stack baru di workspace yang isinya satu blok (dipakai saat reporter dilepas dari slot).
function createFloatingStack(blockEl, blockData, worldX, worldY) {
  const container = document.createElement("div");
  container.className = "block-stack-container";
  container.style.position = "absolute";
  container.style.left = `${Math.max(0, worldX)}px`;
  container.style.top = `${Math.max(0, worldY)}px`;
  container.draggable = false;
  container.appendChild(blockEl);
  (workspaceCanvas || scriptArea).appendChild(container);
  protectWorkspaceControls(blockEl, container);
  state.stacks.push({ containerElem: container, blocks: [blockData] });
  setupWorkspacePointerDrag(container);
  return container;
}

// Mencari slot input di workspace yang berada di bawah titik (x, y) (koordinat workspace).
function findReporterSlotAt(x, y, reporterType, excludeEl) {
  const root = workspaceCanvas || scriptArea;
  if (!root) return null;

  const isBool = isBooleanReporterType(reporterType);
  const PAD = 10 * (workspaceZoom || 1);
  let best = null;
  let bestArea = Infinity;

  root.querySelectorAll(".block-input").forEach((input) => {
    if (input.type === "color" || input.classList.contains("block-color-input")) return;
    if (excludeEl && excludeEl.contains(input)) return;
    if (input.classList.contains("block-boolean-input") && !isBool) return;

    const rectEl = input._reporterData ? input._holder : input;
    if (!rectEl || !rectEl.isConnected) return;
    const r = rectEl.getBoundingClientRect();
    if (!r.width || !r.height) return;

    const padded = {
      left: r.left - PAD, right: r.right + PAD,
      top: r.top - PAD, bottom: r.bottom + PAD
    };
    if (!ePointInsideRect(x, y, padded, scriptArea, workspaceZoom)) return;

    const area = r.width * r.height;
    if (area < bestArea) {
      best = input;
      bestArea = area;
    }
  });

  return best;
}

// Melepas reporter dari slot. Mengembalikan { el, data } atau null.
function detachReporterFromInput(hostInput) {
  const data = hostInput && hostInput._reporterData;
  if (!data) return null;

  const el = data.element;
  if (hostInput._holder) hostInput._holder.remove();

  hostInput.style.display = "";
  hostInput.classList.remove("has-reporter");
  delete hostInput.value;              // kembalikan perilaku input biasa
  hostInput._reporterData = null;
  hostInput._holder = null;

  if (el) el.classList.remove("nested-reporter");
  relayoutControlAncestors(hostInput);
  return { el, data };
}

// Menaruh reporter ke dalam slot input.
function attachReporterToInput(hostInput, reporterEl, reporterData) {
  if (!hostInput || !reporterEl) return false;

  // Kalau slot sudah terisi, blok lama dilepas (seperti di Scratch).
  if (hostInput._reporterData) {
    const holderRect = hostInput._holder.getBoundingClientRect();
    const p = getWorkspacePoint(holderRect.left + 24, holderRect.top + 34);
    const old = detachReporterFromInput(hostInput);
    if (old && old.el) createFloatingStack(old.el, old.data, p.x, p.y);
  }

  const holder = document.createElement("span");
  holder.className = "reporter-slot-holder";
  if (hostInput.classList.contains("block-boolean-input")) {
    holder.classList.add("is-boolean-slot");
  }

  // Bersihkan style posisi bawaan drag.
  reporterEl.style.position = "";
  reporterEl.style.left = "";
  reporterEl.style.top = "";
  reporterEl.classList.add("nested-reporter");
  holder.appendChild(reporterEl);

  hostInput.parentNode.insertBefore(holder, hostInput.nextSibling);
  hostInput.style.display = "none";
  hostInput.classList.add("has-reporter");
  hostInput._reporterData = reporterData;
  hostInput._holder = holder;
  holder._hostInput = hostInput;

  // Semua kode yang membaca `input.value` otomatis mendapat hasil hitung reporter.
  Object.defineProperty(hostInput, "value", {
    configurable: true,
    get() {
      try {
        const v = evaluateBlockReporter(reporterData);
        return String(v ?? "");
      } catch (err) {
        return "";
      }
    },
    set() {}
  });

  const container = hostInput.closest(".block-stack-container");
  if (container) protectWorkspaceControls(reporterEl, container);

  relayoutControlAncestors(hostInput);
  return true;
}


// ============================================================
// RONGGA C-BLOCK: cari / sisipkan / lepas blok
// ============================================================

// Rongga C-block paling dalam yang berisi titik (x, y) (koordinat workspace).
function findCavityAt(worldX, worldY, excludeStack) {
  const candidates = [];

  const collect = (block, ownerStack) => {
    if (!block || !isControlCBlock(block.type) || !block.element?.isConnected) return;
    ensureControlBranches(block);

    const slots = Array.from(block.element.querySelectorAll(":scope > .control-slot"));
    slots.forEach((slot, branchIndex) => {
      const slotRect = slot.getBoundingClientRect();
      if (ePointInsideRect(worldX, worldY, slotRect, scriptArea, workspaceZoom)) {
        candidates.push({
          parentBlock: block,
          branchIndex,
          slot,
          ownerStack,
          area: slotRect.width * slotRect.height
        });
      }
    });

    (block.branches || []).forEach(branch => {
      (branch || []).forEach(child => collect(child, ownerStack));
    });
  };

  for (const stack of state.stacks) {
    if (!stack?.blocks || stack === excludeStack) continue;
    stack.blocks.forEach(b => collect(b, stack));
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.area - b.area);
  const best = candidates[0];

  // Posisi sisip: sebelum anak yang titiknya berada di paruh atasnya.
  const siblings = best.parentBlock.branches[best.branchIndex];
  const scriptRectNow = scriptArea.getBoundingClientRect();
  let insertIndex = siblings.length;
  for (let i = 0; i < siblings.length; i++) {
    const el = siblings[i].element;
    if (!el || !el.isConnected) continue;
    const r = el.getBoundingClientRect();
    const midY = ((r.top + r.bottom) / 2 - scriptRectNow.top + scriptArea.scrollTop) / workspaceZoom;
    if (worldY < midY) {
      insertIndex = i;
      break;
    }
  }
  best.insertIndex = insertIndex;
  return best;
}

// Menyisipkan satu atau beberapa blok (urut) ke rongga hasil findCavityAt.
function insertBlocksIntoCavity(cavity, blocks) {
  const { parentBlock, branchIndex, slot, ownerStack } = cavity;
  const siblings = parentBlock.branches[branchIndex];
  const refBlock = siblings[cavity.insertIndex] || null;
  const refEl = refBlock && refBlock.element && refBlock.element.parentNode === slot
    ? refBlock.element
    : null;

  blocks.forEach((blockData, i) => {
    const el = blockData.element;
    el.classList.add("control-nested-block");
    el.style.position = "relative";
    el.style.left = "auto";
    el.style.top = "auto";
    el.style.transform = "none";
    el.style.display = "inline-flex";
    el.style.visibility = "visible";
    el.style.opacity = "1";

    if (refEl) slot.insertBefore(el, refEl);
    else slot.appendChild(el);

    siblings.splice(cavity.insertIndex + i, 0, blockData);
    protectWorkspaceControls(el, ownerStack.containerElem);
  });

  relayoutControlAncestors(blocks[0].element);
}

// Mencari posisi sebuah blok (di stack level atas atau di dalam rongga).
function findBlockLocation(blocks, element, parentBlock = null, branchIndex = -1) {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.element === element) {
      return { list: blocks, index: i, parentBlock, branchIndex };
    }
    if (b.branches) {
      for (let bi = 0; bi < b.branches.length; bi++) {
        const found = findBlockLocation(b.branches[bi], element, b, bi);
        if (found) return found;
      }
    }
  }
  return null;
}

// Stack baru di workspace berisi beberapa blok berurutan.
function createFloatingStackFromBlocks(blocks, worldX, worldY) {
  const container = document.createElement("div");
  container.className = "block-stack-container";
  container.style.position = "absolute";
  container.style.left = `${Math.max(0, worldX)}px`;
  container.style.top = `${Math.max(0, worldY)}px`;
  container.draggable = false;

  blocks.forEach((b) => {
    const el = b.element;
    el.classList.remove("control-nested-block", "nested-reporter");
    ["position", "left", "top", "transform", "display", "visibility", "opacity"].forEach(
      (prop) => { el.style[prop] = ""; }
    );
    container.appendChild(el);
  });

  (workspaceCanvas || scriptArea).appendChild(container);
  blocks.forEach((b) => protectWorkspaceControls(b.element, container));
  state.stacks.push({ containerElem: container, blocks: blocks.slice() });
  setupWorkspacePointerDrag(container);
  return container;
}

// Hapus satu stack dari workspace.
function deleteWorkspaceStack(stack) {
  if (!stack) return;
  const idx = state.stacks.indexOf(stack);
  if (idx >= 0) state.stacks.splice(idx, 1);
  if (stack.containerElem) stack.containerElem.remove();
}

// ============================================================
// CREATE BLOCK UI
// ============================================================

function createBlockUI(
  def,
  isPalette = false
) {

  const wrapper =
    document.createElement("div");

  wrapper.className =
    "scratch-block-wrapper";

  if (def.hasCheckbox) {

    const checkbox =
      document.createElement("input");

    checkbox.type =
      "checkbox";

    checkbox.className =
      "block-checkbox";

    if (def.cat === "sensing") {
      checkbox.checked = !!state.sensingMonitors?.[def.type];
    } else if (def.cat !== "variables") {
      checkbox.checked = !!state.reporterMonitors?.[def.type];
      checkbox.addEventListener("click", () => {
        state.reporterMonitors = state.reporterMonitors || {};
        state.reporterMonitors[def.type] = checkbox.checked;
        renderReporterMonitors();
      });
    } else if (def.cat === "variables" && def.type === "var_reporter") {
      checkbox.checked = !!state.variableMeta?.[def.customName]?.visible;
      checkbox.addEventListener("click", () => {
        const name = def.customName;
        if (!state.variableMeta[name]) state.variableMeta[name] = {visible:true, scope:"all"};
        state.variableMeta[name].visible = checkbox.checked;
        renderStageVariableMonitors();
      });
    } else if (def.cat === "variables" && def.type === "list_reporter") {
      checkbox.checked = !!state.listMeta?.[def.customName]?.visible;
      checkbox.addEventListener("click", () => {
        const name = def.customName;
        if (!state.listMeta[name]) state.listMeta[name] = {visible:true, scope:"all"};
        state.listMeta[name].visible = checkbox.checked;
        renderStageVariableMonitors();
      });
    }

    checkbox.addEventListener(
      "pointerdown",
      (e) => {
        e.stopPropagation();
      }
    );

    checkbox.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        if (def.cat === "sensing") {
          state.sensingMonitors = state.sensingMonitors || {};
          state.sensingMonitors[def.type] = checkbox.checked;
          state.sensingMonitorOptions = state.sensingMonitorOptions || {};
          if (def.type === "current") {
            const block = wrapper.querySelector(".scratch-block");
            const currentDropdown = block?.querySelector(".custom-dropdown");
            state.sensingMonitorOptions.current = currentDropdown?.dataset.value || "year";
          }
          if (def.type === "loudness" && checkbox.checked) ensureLoudnessMeter();
          renderSensingMonitors();
        }
      }
    );

    wrapper.appendChild(
      checkbox
    );
  }


  const div =
    document.createElement("div");

  const shapeClass =
    def.isReporter
      ? "block-reporter" + (isBooleanReporterType(def.type) ? " block-boolean" : "")
      : "block-stack";

  div.className =
    `scratch-block block-${def.cat} ${shapeClass}`;

  div.dataset.type =
    def.type;

  div.dataset.cat =
    def.cat;

  div.draggable =
    isPalette;

  div.dataset.originalDraggable =
    isPalette
      ? "true"
      : "false";


  // Important for touch dragging.
  // We handle pointer dragging manually.
  if (isPalette) {

    div.style.touchAction =
      "none";

  } else {

    div.style.touchAction =
      "pan-y";
  }


  // Custom My Blocks need Scratch-like argument shapes instead of the
  // generic text-input parser.  In particular, a define block must show
  // "define <name> (input)" in the workspace before it is executed.
  if (def.cat === "myblocks" && (def.type === "define_myblock" || def.type === "call_myblock")) {
    const lead = document.createElement("span");
    lead.textContent = def.type === "define_myblock" ? "define" : "";
    if (lead.textContent) div.appendChild(lead);

    const title = document.createElement("span");
    title.className = "myblock-custom-name";
    title.textContent = def.customName || "block name";
    div.appendChild(title);

    let customParts = Array.isArray(def.customParts) ? def.customParts : [];
    if (!customParts.length && Array.isArray(def.customInputs)) {
      customParts = def.customInputs.map(x => ({kind:x.kind || "input-text", name:x.name || "input"}));
    }

    customParts.forEach((part, idx) => {
      const kind = part.kind || "input-text";
      if (kind === "label") {
        const label = document.createElement("span");
        label.className = "myblock-custom-label";
        label.textContent = part.name || "text";
        div.appendChild(label);
        return;
      }
      const arg = document.createElement("span");
      arg.className = `myblock-custom-arg ${kind === "input-boolean" ? "boolean" : "text"}`;
      arg.textContent = part.name || (kind === "input-boolean" ? "boolean" : "input");
      arg.dataset.inputIndex = String(idx);
      if (!isPalette) arg.contentEditable = "true";
      div.appendChild(arg);
    });

    if (isPalette) {
      setupPalettePointerDrag(div, def);
      div.addEventListener("dragstart", e => {
        if (e.target.closest('input, .custom-dropdown, [contenteditable="true"]')) { e.preventDefault(); return; }
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/plain", JSON.stringify({...def, isFromPalette:true}));
      });
    }
    wrapper.appendChild(div);
    return wrapper;
  }

  const parts =
    def.text.split(
      /(\{[^}]+\}|\[[^\]]+\])/g
    );

  let inputIndex =
    0;


  parts.forEach(
    (part) => {

      if (!part) {
        return;
      }


      // INPUT

      if (
        part.startsWith("{") &&
        part.endsWith("}")
      ) {

        const input =
          document.createElement("input");

        const inputType =
          def.inputTypes && def.inputTypes[inputIndex]
            ? def.inputTypes[inputIndex]
            : "text";

        input.type = inputType === "color" ? "color" : "text";

        input.className =
          `block-input${inputType === "color" ? " block-color-input" : ""}`;

        // Scratch uses hexagonal/boolean-shaped slots for Control conditions.
        // Keep the value editable, but give the visual slot the correct shape.
        if (
          (def.cat === "control" && ["if", "if_else", "wait_until", "repeat_until"].includes(def.type)) ||
          BOOLEAN_INPUT_HOST_TYPES.includes(def.type)
        ) {
          input.classList.add("block-boolean-input");
        }

        if (
          def.defaultVals &&
          def.defaultVals[inputIndex] !==
          undefined
        ) {

          input.value =
            def.defaultVals[inputIndex];

        } else if (
          def.defaultVal !==
          undefined
        ) {

          input.value =
            def.defaultVal;
        }

        const rawValue =
          part.slice(
            1,
            -1
          );

        if (
          rawValue.length > 4
        ) {

          input.classList.add(
            "long"
          );
        }

        div.appendChild(
          input
        );

        inputIndex++;

        return;
      }


      // DROPDOWN

      if (
        part.startsWith("[") &&
        part.endsWith("]")
      ) {
        const tokenIndex = (div.querySelectorAll(".custom-dropdown").length);
        let dropdownDef = def;
        if (def.optionsSource && tokenIndex === 0) {
          dropdownDef = { ...def, options: getDynamicOptions(def) };
        } else if (tokenIndex > 0 && def.options2) {
          dropdownDef = { ...def, options: def.options2 };
        }
        const opts = dropdownDef.options || [];
        if (opts.length) {
          const dropdown = createCustomDropdown(dropdownDef);
          div.appendChild(dropdown);
        }
        return;
      }


      // TEXT

      const span =
        document.createElement("span");

      span.textContent =
        part;

      div.appendChild(
        span
      );
    }
  );


  // Control blocks get real drop targets for their C-shaped script slots.
  createControlSlots(div, def);

  if (isPalette) {

    div.querySelectorAll(
      "input, .custom-dropdown"
    ).forEach(
      (element) => {

        protectInteractiveElement(
          element,
          div
        );
      }
    );
  }


  // ==========================================================
  // DESKTOP HTML5 DRAG
  // ==========================================================

  if (isPalette) {

    div.addEventListener(
      "dragstart",
      (e) => {

        if (
          e.target.closest(
            "input, .custom-dropdown"
          )
        ) {

          e.preventDefault();

          return;
        }

        const payload = {
          ...def,
          isFromPalette: true
        };

        e.dataTransfer.effectAllowed =
          "copy";

        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify(payload)
        );
      }
    );
  }


  // ==========================================================
  // MOBILE / POINTER DRAG
  // ==========================================================

  if (isPalette) {

    setupPalettePointerDrag(
      div,
      def
    );
  }


  wrapper.appendChild(
    div
  );

  return wrapper;
}


// ============================================================
// MOBILE PALETTE POINTER DRAG
// ============================================================

let activePointerDrag =
  null;


function setupPalettePointerDrag(
  blockElement,
  def
) {

  if (!blockElement) {
    return;
  }


  blockElement.addEventListener(
    "pointerdown",
    (e) => {

      // Only primary pointer.
      if (
        e.isPrimary === false
      ) {
        return;
      }

      // Do not drag when touching controls.
      if (
        e.target.closest(
          "input, textarea, select, button, .custom-dropdown, .custom-dropdown-selected"
        )
      ) {
        return;
      }

      // Desktop mouse continues using native HTML5 drag.
      if (
        e.pointerType === "mouse"
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      closeAllDropdowns();


      const clone =
        blockElement.cloneNode(true);

      clone.classList.add(
        "pointer-drag-clone"
      );

      clone.style.position =
        "fixed";

      clone.style.zIndex =
        "2147483646";

      clone.style.pointerEvents =
        "none";

      clone.style.width =
        `${blockElement.getBoundingClientRect().width}px`;

      clone.style.opacity =
        "0.9";

      clone.style.transform =
        "scale(1.03)";

      clone.style.margin =
        "0";


      // Remove duplicate dropdown menus from clone.
      clone
        .querySelectorAll(
          ".custom-dropdown-menu"
        )
        .forEach(
          (menu) => menu.remove()
        );


      document.body.appendChild(
        clone
      );


      const rect =
        blockElement.getBoundingClientRect();

      activePointerDrag = {

        pointerId:
          e.pointerId,

        blockElement,

        def,

        clone,

        offsetX:
          e.clientX -
          rect.left,

        offsetY:
          e.clientY -
          rect.top
      };


      movePointerDrag(
        e.clientX,
        e.clientY
      );


      window.addEventListener(
        "pointermove",
        handlePointerDragMove,
        { passive: false }
      );

      window.addEventListener(
        "pointerup",
        handlePointerDragEnd
      );

      window.addEventListener(
        "pointercancel",
        handlePointerDragEnd
      );
    },
    { passive: false }
  );
}


function movePointerDrag(
  clientX,
  clientY
) {

  if (!activePointerDrag) {
    return;
  }

  const drag =
    activePointerDrag;

  drag.clone.style.left =
    `${clientX - drag.offsetX}px`;

  drag.clone.style.top =
    `${clientY - drag.offsetY}px`;
}


function handlePointerDragMove(e) {

  if (!activePointerDrag) {
    return;
  }

  if (
    e.pointerId !==
    activePointerDrag.pointerId
  ) {
    return;
  }

  e.preventDefault();

  movePointerDrag(
    e.clientX,
    e.clientY
  );
}


function handlePointerDragEnd(e) {

  if (!activePointerDrag) {
    return;
  }

  if (
    e.pointerId !==
    activePointerDrag.pointerId
  ) {
    return;
  }

  e.preventDefault();

  const drag =
    activePointerDrag;

  const scriptRect =
    scriptArea
      ? scriptArea.getBoundingClientRect()
      : null;


  if (scriptRect) {

    const insideWorkspace =
      e.clientX >= scriptRect.left &&
      e.clientX <= scriptRect.right &&
      e.clientY >= scriptRect.top &&
      e.clientY <= scriptRect.bottom;

    if (insideWorkspace) {

      const workspacePoint =
        getWorkspacePoint(
          e.clientX,
          e.clientY
        );

      const dropX =
        workspacePoint.x;

      const dropY =
        workspacePoint.y;

      handleBlockDrop(
        {
          ...drag.def,
          isFromPalette: true
        },
        dropX,
        dropY
      );
    }
  }


  if (drag.clone) {
    drag.clone.remove();
  }


  activePointerDrag =
    null;


  window.removeEventListener(
    "pointermove",
    handlePointerDragMove
  );

  window.removeEventListener(
    "pointerup",
    handlePointerDragEnd
  );

  window.removeEventListener(
    "pointercancel",
    handlePointerDragEnd
  );
}


// ============================================================
// PALETTE
// ============================================================

const paletteScroll =
  document.getElementById(
    "palette-scroll"
  );


function renderAllStageMonitors() {
  const stage = document.querySelector(".stage-wrapper");
  if (!stage) return;

  // All monitors share ONE layout queue so they never overlap.
  stage.querySelectorAll(
    ".sensing-monitor, .reporter-monitor, .variable-monitor:not(.sensing-monitor):not(.reporter-monitor), .list-monitor"
  ).forEach(el => el.remove());

  let offset = 0;
  const nextTop = () => `${12 + offset++ * 34}px`;

  // Sensing monitors
  const sensingLabels = {
    answer: "answer",
    loudness: "loudness",
    timer: "timer",
    current: "current",
    online: "online?",
    username: "username"
  };
  Object.keys(state.sensingMonitors || {}).forEach(type => {
    if (!state.sensingMonitors[type] || !sensingLabels[type]) return;
    const monitor = document.createElement("div");
    monitor.className = "variable-monitor sensing-monitor";
    monitor.style.top = nextTop();
    const title = document.createElement("span");
    title.className = "var-title";
    title.textContent = `${sensingLabels[type]}:`;
    const value = document.createElement("span");
    value.className = "var-value";
    const option = state.sensingMonitorOptions?.[type];
    value.textContent = String(getSensingValue(type, option));
    monitor.append(title, value);
    stage.appendChild(monitor);
  });

  // Motion / Looks / Sound reporter monitors
  const reporterLabels = {
    reporter_x: "x position",
    reporter_y: "y position",
    reporter_direction: "direction",
    reporter_size: "size",
    reporter_costume: "costume",
    reporter_backdrop: "backdrop",
    reporter_volume: "volume"
  };
  Object.keys(state.reporterMonitors || {}).forEach(type => {
    if (!state.reporterMonitors[type] || !reporterLabels[type]) return;
    const monitor = document.createElement("div");
    monitor.className = "variable-monitor reporter-monitor";
    monitor.style.top = nextTop();
    const title = document.createElement("span");
    title.className = "var-title";
    title.textContent = `${reporterLabels[type]}:`;
    const value = document.createElement("span");
    value.className = "var-value";
    let v = "";
    if (type === "reporter_x") v = state.sprite.x;
    if (type === "reporter_y") v = state.sprite.y;
    if (type === "reporter_direction") v = state.sprite.direction;
    if (type === "reporter_size") v = state.sprite.size;
    if (type === "reporter_costume") v = state.sprite.costume;
    if (type === "reporter_backdrop") v = state.backdrop.current;
    if (type === "reporter_volume") v = state.soundState.volume;
    value.textContent = String(v);
    monitor.append(title, value);
    stage.appendChild(monitor);
  });

  // Variables: each checked variable gets its own row.
  Object.entries(state.variableMeta || {}).forEach(([name, meta]) => {
    if (!meta.visible || state.variables[name] === undefined) return;
    const monitor = document.createElement("div");
    monitor.className = "variable-monitor";
    monitor.id = `var-monitor-${name}`;
    monitor.style.top = nextTop();
    const title = document.createElement("span");
    title.className = "var-title";
    title.textContent = `${name}:`;
    const value = document.createElement("span");
    value.className = "var-value";
    value.textContent = state.variables[name] ?? 0;
    monitor.append(title, value);
    stage.appendChild(monitor);
  });

  // Lists follow variables and also get their own rows.
  Object.entries(state.listMeta || {}).forEach(([name, meta]) => {
    if (!meta.visible || !state.lists[name]) return;
    const monitor = document.createElement("div");
    monitor.className = "list-monitor";
    monitor.style.top = nextTop();
    const title = document.createElement("div");
    title.className = "list-monitor-title";
    title.textContent = name;
    const items = document.createElement("div");
    items.className = "list-monitor-items";
    const values = state.lists[name] || [];
    items.textContent = values.length
      ? values.map((v, i) => `${i + 1}: ${v}`).join("\n")
      : "(empty)";
    monitor.append(title, items);
    stage.appendChild(monitor);
  });
}

function renderSensingMonitors() {
  renderAllStageMonitors();
}

function renderReporterMonitors() {
  renderAllStageMonitors();
}

function makePaletteActionButton(label, onClick, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `palette-action-button ${className || ""}`;
  button.textContent = label;
  button.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); onClick(); });
  return button;
}

function renderVariablePaletteAndMonitors() {
  if (!paletteScroll) return;
  const active = document.querySelector('.cat-item.active')?.dataset.cat;
  initPalette();
  if (active) {
    const header = document.getElementById(`cat-header-${active}`);
    if (header) paletteScroll.scrollTo({top: header.offsetTop - paletteScroll.offsetTop});
  }
  renderStageVariableMonitors();
}

function renderStageVariableMonitors() {
  renderAllStageMonitors();
}

function openScratchNameDialog(kind, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "scratch-dialog-overlay";
  const title = kind === "list" ? "New List" : "New Variable";
  const label = kind === "list" ? "New list name:" : "New variable name:";
  const groupName = `scope-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  overlay.innerHTML = `
    <div class="scratch-dialog-card" role="dialog" aria-modal="true">
      <div class="scratch-dialog-title"><span>${title}</span><button type="button" class="scratch-dialog-close">×</button></div>
      <div class="scratch-dialog-body">
        <label>${label}</label>
        <input class="scratch-dialog-name" type="text" autocomplete="off">
        <div class="scratch-dialog-radios">
          <label><input type="radio" name="${groupName}" value="all" checked> For all sprites</label>
          <label><input type="radio" name="${groupName}" value="local"> For this sprite only</label>
        </div>
        <div class="scratch-dialog-actions"><button type="button" class="scratch-cancel">Cancel</button><button type="button" class="scratch-ok">OK</button></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector(".scratch-dialog-name");
  const close = () => overlay.remove();
  overlay.querySelector(".scratch-dialog-close").onclick = close;
  overlay.querySelector(".scratch-cancel").onclick = close;
  overlay.querySelector(".scratch-ok").onclick = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const scope = overlay.querySelector('input[type="radio"]:checked')?.value || "all";
    onConfirm(name, scope);
    close();
  };
  input.addEventListener("keydown", e => { if (e.key === "Enter") overlay.querySelector(".scratch-ok").click(); if (e.key === "Escape") close(); });
  requestAnimationFrame(() => input.focus());
}

function openMakeBlockDialog(onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "scratch-dialog-overlay";
  overlay.innerHTML = `
    <div class="scratch-dialog-card myblock-dialog scratch-make-block-dialog" role="dialog" aria-modal="true">
      <div class="scratch-dialog-title"><span>Make a Block</span><button type="button" class="scratch-dialog-close">×</button></div>
      <div class="myblock-design-area">
        <button type="button" class="myblock-trash" aria-label="Remove last input" title="Remove last input">🗑</button>
        <div class="myblock-design-canvas">
          <div class="myblock-preview scratch-block block-myblocks block-stack">
            <span>define</span>
            <input class="myblock-name-inline" value="block name" aria-label="block name">
          </div>
        </div>
      </div>
      <div class="myblock-controls">
        <button type="button" class="myblock-add-card" data-kind="input-text">
          <span class="myblock-icon myblock-icon-input"> </span>
          <strong>Add an input</strong><small>number or text</small>
        </button>
        <button type="button" class="myblock-add-card" data-kind="input-boolean">
          <span class="myblock-icon myblock-icon-boolean">◆</span>
          <strong>Add an input</strong><small>boolean</small>
        </button>
        <button type="button" class="myblock-add-card" data-kind="label">
          <span class="myblock-icon myblock-icon-label">text</span>
          <strong>Add a label</strong>
        </button>
      </div>
      <label class="myblock-refresh"><input type="checkbox"> Run without screen refresh</label>
      <div class="scratch-dialog-actions myblock-actions"><button type="button" class="scratch-cancel">Cancel</button><button type="button" class="scratch-ok">OK</button></div>
    </div>`;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector(".myblock-preview");
  const nameInput = overlay.querySelector(".myblock-name-inline");
  const added = [];
  let focusedToken = null;

  const refreshPreview = () => {
    // Keep the name input as the first editable item in the Scratch-like block.
    const name = nameInput.value.trim() || "block name";
    if (nameInput.value !== name) nameInput.value = name;
    canvas.querySelectorAll(".myblock-token").forEach((el, i) => {
      const item = added[i];
      if (!item) return;
      if (item.kind === "label") el.textContent = item.name || "text";
      else el.textContent = item.name || (item.kind === "input-boolean" ? "boolean input" : "number or text");
    });
  };

  const removeLast = () => {
    if (!added.length) return;
    const item = added.pop();
    item.el?.remove();
    refreshPreview();
    nameInput.focus();
  };

  overlay.querySelector(".myblock-trash").onclick = removeLast;
  overlay.querySelector(".scratch-dialog-close").onclick = () => overlay.remove();
  overlay.querySelector(".scratch-cancel").onclick = () => overlay.remove();

  overlay.querySelectorAll(".myblock-add-card").forEach(btn => btn.onclick = () => {
    const kind = btn.dataset.kind;
    const token = document.createElement("span");
    token.className = `myblock-token ${kind}`;
    token.contentEditable = "true";
    token.spellcheck = false;
    token.textContent = kind === "label" ? "text" : (kind === "input-boolean" ? "boolean input" : "number or text");
    canvas.appendChild(token);
    const item = {kind, name:"", el:token};
    added.push(item);
    token.addEventListener("input", () => { item.name = token.textContent.trim(); });
    token.addEventListener("focus", () => { focusedToken = item; });
    token.addEventListener("blur", () => { item.name = token.textContent.trim(); });
    token.focus();
    focusedToken = item;
  });

  nameInput.addEventListener("focus", () => {
    if (nameInput.value === "block name") nameInput.select();
  });
  nameInput.addEventListener("input", refreshPreview);
  nameInput.addEventListener("keydown", e => { if (e.key === "Enter") overlay.querySelector(".scratch-ok").click(); });

  overlay.querySelector(".scratch-ok").onclick = () => {
    const name = nameInput.value.trim();
    if (!name || name === "block name") { nameInput.focus(); nameInput.select(); return; }
    const parts = added.map(x => ({kind:x.kind, name:x.el.textContent.trim()})).filter(x => x.name);
    const inputs = parts.filter(x => x.kind !== "label");
    const labels = parts.filter(x => x.kind === "label");
    onConfirm(name, inputs, labels, overlay.querySelector(".myblock-refresh input").checked, parts);
    overlay.remove();
  };
  requestAnimationFrame(() => { nameInput.focus(); nameInput.select(); });
}

function makeVariableDefList() {
  const defs = [
    { cat:"variables", type:"set_var", text:"set [my variable] to {0}", defaultVal:0, optionsSource:"variables" },
    { cat:"variables", type:"change_var", text:"change [my variable] by {1}", defaultVal:1, optionsSource:"variables" },
    { cat:"variables", type:"show_var", text:"show variable [my variable]", optionsSource:"variables" },
    { cat:"variables", type:"hide_var", text:"hide variable [my variable]", optionsSource:"variables" }
  ];
  Object.keys(state.variables || {}).forEach(name => defs.push({cat:"variables", type:"var_reporter", isReporter:true, hasCheckbox:true, customName:name, text:name}));
  Object.keys(state.lists || {}).forEach(name => {
    defs.push({cat:"variables", type:"list_add", text:`add {thing} to [${name}]`, defaultVal:"thing", optionsSource:"lists"});
    defs.push({cat:"variables", type:"list_delete_item", text:`delete {1} of [${name}]`, defaultVal:1, optionsSource:"lists"});
    defs.push({cat:"variables", type:"delete_list_all", text:`delete all of [${name}]`, optionsSource:"lists"});
    defs.push({cat:"variables", type:"list_insert", text:`insert {thing} at {1} of [${name}]`, defaultVals:["thing",1], optionsSource:"lists"});
    defs.push({cat:"variables", type:"list_replace", text:`replace item {1} of [${name}] with {thing}`, defaultVals:[1,"thing"], optionsSource:"lists"});
    defs.push({cat:"variables", type:"show_list", text:`show list [${name}]`, optionsSource:"lists"});
    defs.push({cat:"variables", type:"hide_list", text:`hide list [${name}]`, optionsSource:"lists"});
    defs.push({cat:"variables", type:"list_reporter", isReporter:true, hasCheckbox:true, customName:name, text:name});
    defs.push({cat:"variables", type:"list_item", isReporter:true, text:`item {1} of [${name}]`, defaultVal:1, optionsSource:"lists"});
    defs.push({cat:"variables", type:"list_length", isReporter:true, text:`length of [${name}]`, optionsSource:"lists"});
    defs.push({cat:"variables", type:"list_contains", isReporter:true, text:`[${name}] contains {thing}?`, defaultVal:"thing", optionsSource:"lists"});
  });
  return defs;
}

function makeMyBlockDefs() {
  const defs = [];
  Object.entries(state.myBlocks || {}).forEach(([name, info]) => {
    const inputs = info.inputs || [];
    const inputTokens = inputs.map(x => `{${x.name}}`).join(" ");
    const customParts = Array.isArray(info.customParts) && info.customParts.length
      ? info.customParts
      : inputs.map(x => ({kind: x.kind || "input-text", name: x.name || "input"}));
    defs.push({cat:"myblocks", type:"call_myblock", customName:name, customInputs:inputs, customParts, text:`${name}${inputTokens ? " " + inputTokens : ""}`});
  });
  return defs;
}

function initPalette() {
  if (!paletteScroll) return;
  closeAllDropdowns(true);
  paletteScroll.innerHTML = "";
  const categories = ["motion","looks","sound","events","control","sensing","operators","variables","myblocks"];
  categories.forEach(cat => {
    const header = document.createElement("div"); header.className = "category-header"; header.innerText = cat.toUpperCase(); header.id = `cat-header-${cat}`; paletteScroll.appendChild(header);

    if (cat === "variables") {
      paletteScroll.appendChild(makePaletteActionButton("Make a Variable", () => openScratchNameDialog("variable", (name, scope) => {
        if (state.variables[name] !== undefined) return;
        state.variables[name] = 0; state.variableMeta[name] = {visible:true, scope}; renderVariablePaletteAndMonitors();
      }), "variables-action"));
      paletteScroll.appendChild(makePaletteActionButton("Make a List", () => openScratchNameDialog("list", (name, scope) => {
        if (state.lists[name]) return;
        state.lists[name] = []; state.listMeta[name] = {visible:true, scope}; renderVariablePaletteAndMonitors();
      }), "variables-action"));
      makeVariableDefList().forEach(def => paletteScroll.appendChild(createBlockUI(def, true)));
      return;
    }

    if (cat === "myblocks") {
      paletteScroll.appendChild(makePaletteActionButton("Make a Block", () => openMakeBlockDialog((name, inputs, labels, noRefresh, parts) => {
        if (state.myBlocks[name]) return;
        state.myBlocks[name] = {defined:true, inputs, labels, customParts: parts || [], runWithoutRefresh:noRefresh};
        renderVariablePaletteAndMonitors();
        const customParts = (parts && parts.length) ? parts : inputs.map(x => ({kind:x.kind || "input-text", name:x.name || "input"}));
        const def = {cat:"myblocks", type:"define_myblock", customName:name, customInputs:inputs, customParts, text:`define ${name}${inputs.map(x=>` {${x.name}}`).join("")}`};
        if (scriptArea) handleBlockDrop(def, 20, 20);
      }), "myblocks-action"));
      makeMyBlockDefs().forEach(def => paletteScroll.appendChild(createBlockUI(def, true)));
      return;
    }

    blockDefinitions.filter(block => block.cat === cat).forEach(blockDef => paletteScroll.appendChild(createBlockUI(blockDef, true)));
  });
}


// ============================================================
// SIDEBAR
// ============================================================

function setupSidebarNavigation() {

  const catItems =
    document.querySelectorAll(
      ".cat-item"
    );

  catItems.forEach(
    (item) => {

      item.addEventListener(
        "click",
        () => {

          catItems.forEach(
            (i) =>
              i.classList.remove(
                "active"
              )
          );

          item.classList.add(
            "active"
          );

          const catName =
            item.dataset.cat;

          const targetHeader =
            document.getElementById(
              `cat-header-${catName}`
            );

          if (
            targetHeader &&
            paletteScroll
          ) {

            paletteScroll.scrollTo({

              top:
                targetHeader.offsetTop -
                paletteScroll.offsetTop,

              behavior:
                "smooth"
            });
          }
        }
      );


      // Keyboard accessibility

      item.addEventListener(
        "keydown",
        (e) => {

          if (
            e.key === "Enter" ||
            e.key === " "
          ) {

            e.preventDefault();

            item.click();
          }
        }
      );
    }
  );
}


// ============================================================
// WORKSPACE
// ============================================================

const scriptArea =
  document.getElementById(
    "script-area"
  );

const workspaceCanvas =
  document.getElementById(
    "workspace-canvas"
  );

const workspaceZoomInBtn =
  document.getElementById(
    "workspace-zoom-in"
  );

const workspaceZoomOutBtn =
  document.getElementById(
    "workspace-zoom-out"
  );

const workspaceZoomResetBtn =
  document.getElementById(
    "workspace-zoom-reset"
  );

let workspaceZoom = 1;

const WORKSPACE_ZOOM_MIN = 0.5;
const WORKSPACE_ZOOM_MAX = 2;
const WORKSPACE_ZOOM_STEP = 0.1;

function applyWorkspaceZoom() {
  if (!workspaceCanvas) return;

  workspaceCanvas.style.transform =
    `scale(${workspaceZoom})`;

  // Scratch-like feedback: prevent zooming past the allowed range.
  if (workspaceZoomInBtn) {
    workspaceZoomInBtn.disabled =
      workspaceZoom >= WORKSPACE_ZOOM_MAX;
  }

  if (workspaceZoomOutBtn) {
    workspaceZoomOutBtn.disabled =
      workspaceZoom <= WORKSPACE_ZOOM_MIN;
  }
}

function setWorkspaceZoom(nextZoom) {
  workspaceZoom =
    Math.min(
      WORKSPACE_ZOOM_MAX,
      Math.max(
        WORKSPACE_ZOOM_MIN,
        Math.round(nextZoom * 100) / 100
      )
    );

  applyWorkspaceZoom();
}

function getWorkspacePoint(clientX, clientY) {
  if (!scriptArea) {
    return { x: clientX, y: clientY };
  }

  const rect =
    scriptArea.getBoundingClientRect();

  return {
    x:
      (clientX - rect.left + scriptArea.scrollLeft) /
      workspaceZoom,
    y:
      (clientY - rect.top + scriptArea.scrollTop) /
      workspaceZoom
  };
}

applyWorkspaceZoom();

[
  workspaceZoomInBtn,
  workspaceZoomOutBtn,
  workspaceZoomResetBtn
].forEach((button) => {
  if (!button) return;

  button.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    }
  );
});

if (workspaceZoomInBtn) {
  workspaceZoomInBtn.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setWorkspaceZoom(
        workspaceZoom + WORKSPACE_ZOOM_STEP
      );
    }
  );
}

if (workspaceZoomOutBtn) {
  workspaceZoomOutBtn.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setWorkspaceZoom(
        workspaceZoom - WORKSPACE_ZOOM_STEP
      );
    }
  );
}

if (workspaceZoomResetBtn) {
  workspaceZoomResetBtn.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setWorkspaceZoom(1);
    }
  );
}


let draggedWorkspaceElem =
  null;

let dragOffsetX =
  0;

let dragOffsetY =
  0;


// ============================================================
// DESKTOP WORKSPACE DROP
// ============================================================

if (scriptArea) {

  scriptArea.addEventListener(
    "dragover",
    (e) => {

      e.preventDefault();

      if (e.dataTransfer) {
        e.dataTransfer.dropEffect =
          "copy";
      }
    }
  );


  scriptArea.addEventListener(
    "drop",
    (e) => {

      e.preventDefault();

      const rect =
        scriptArea.getBoundingClientRect();

      const workspacePoint =
        getWorkspacePoint(
          e.clientX,
          e.clientY
        );

      const dropX =
        workspacePoint.x;

      const dropY =
        workspacePoint.y;

      const rawData =
        e.dataTransfer
          ? e.dataTransfer.getData(
              "text/plain"
            )
          : "";


      if (rawData) {

        try {

          const parsedData =
            JSON.parse(
              rawData
            );

          if (
            parsedData.isFromPalette
          ) {

            handleBlockDrop(
              parsedData,
              dropX,
              dropY
            );

            draggedWorkspaceElem =
              null;

            return;
          }

        } catch (error) {
          // Not palette JSON.
        }
      }


      if (
        draggedWorkspaceElem
      ) {

        draggedWorkspaceElem.style.left =
          `${dropX - dragOffsetX}px`;

        draggedWorkspaceElem.style.top =
          `${dropY - dragOffsetY}px`;

        draggedWorkspaceElem =
          null;
      }
    }
  );
}


function ePointInsideRect(x, y, rect, scriptAreaElem, zoom) {
  if (!rect || !scriptAreaElem) return false;

  const scriptRect = scriptAreaElem.getBoundingClientRect();
  const worldLeft = (rect.left - scriptRect.left + scriptAreaElem.scrollLeft) / zoom;
  const worldTop = (rect.top - scriptRect.top + scriptAreaElem.scrollTop) / zoom;
  const worldRight = (rect.right - scriptRect.left + scriptAreaElem.scrollLeft) / zoom;
  const worldBottom = (rect.bottom - scriptRect.top + scriptAreaElem.scrollTop) / zoom;

  return x >= worldLeft && x <= worldRight && y >= worldTop && y <= worldBottom;
}

// ============================================================
// HANDLE BLOCK DROP
// ============================================================

function handleBlockDrop(
  def,
  x,
  y
) {

  if (!scriptArea) {
    return;
  }


  // Keep block inside a reasonable workspace area.
  const safeX =
    Math.max(
      4,
      x
    );

  const safeY =
    Math.max(
      4,
      y
    );


  const newBlockWrapper =
    createBlockUI(
      def,
      false
    );

  const newBlockElem =
    newBlockWrapper.querySelector(
      ".scratch-block"
    );


  const blockData = {
    type: def.type,
    element: newBlockElem,
    customName: def.customName || null,
    customInputs: def.customInputs || [],
    customParts: def.customParts || [],
    runWithoutRefresh: !!def.runWithoutRefresh,
    branches: isControlCBlock(def.type)
      ? Array.from({length: getControlBranchCount(def.type)}, () => [])
      : []
  };


  // ----------------------------------------------------------
  // Reporter dijatuhkan tepat di atas sebuah slot input -> masuk ke slot.
  // ----------------------------------------------------------
  if (def.isReporter) {
    const hostInput = findReporterSlotAt(x, y, def.type, null);
    if (hostInput) {
      attachReporterToInput(hostInput, newBlockElem, blockData);
      return;
    }
  }

  let targetStack =
    null;

  let snapPosition =
    null;


  const SNAP_THRESHOLD_X =
    100;

  const SNAP_THRESHOLD_Y =
    40;

  // ----------------------------------------------------------
  // Drop into a Control C-block cavity (termasuk C-block yang bersarang,
  // misalnya "if" di dalam "forever"). Rongga paling dalam yang dipilih.
  // ----------------------------------------------------------
  if (!def.isReporter && !isEventHat(def.type)) {
    const cavity = findCavityAt(safeX, safeY, null);
    if (cavity) {
      insertBlocksIntoCavity(cavity, [blockData]);
      return;
    }
  }


  for (
    const stack of state.stacks
  ) {

    if (
      !stack.containerElem ||
      !stack.containerElem.isConnected
    ) {
      continue;
    }

    const stackRect =
      stack.containerElem
        .getBoundingClientRect();

    const scriptRect =
      scriptArea
        .getBoundingClientRect();

    const stackX =
      (
        stackRect.left -
        scriptRect.left +
        scriptArea.scrollLeft
      ) / workspaceZoom;

    const stackTop =
      (
        stackRect.top -
        scriptRect.top +
        scriptArea.scrollTop
      ) / workspaceZoom;

    const stackBottom =
      (
        stackRect.bottom -
        scriptRect.top +
        scriptArea.scrollTop
      ) / workspaceZoom;


    if (
      Math.abs(
        safeX -
        stackX
      ) <
      SNAP_THRESHOLD_X
    ) {

      const targetFirstBlock =
        getFirstBlock(stack);

      const targetIsEvent =
        targetFirstBlock &&
        isEventHat(targetFirstBlock.type);

      const sourceIsEvent =
        isEventHat(def.type);

      // Normal blocks can connect underneath an event hat.
      if (
        !sourceIsEvent &&
        targetIsEvent &&
        Math.abs(
          safeY -
          stackBottom
        ) <
        SNAP_THRESHOLD_Y
      ) {

        targetStack =
          stack;

        snapPosition =
          "bottom";

        break;
      }

      // An event hat can only be the first block.
      if (
        sourceIsEvent &&
        !targetIsEvent &&
        Math.abs(
          safeY -
          stackTop
        ) <
        SNAP_THRESHOLD_Y
      ) {

        targetStack =
          stack;

        snapPosition =
          "top";

        break;
      }

      // Normal blocks can also connect to other normal blocks.
      if (
        !sourceIsEvent &&
        !targetIsEvent
      ) {
        if (
          Math.abs(
            safeY -
            stackBottom
          ) <
          SNAP_THRESHOLD_Y
        ) {

          targetStack =
            stack;

          snapPosition =
            "bottom";

          break;
        }

        if (
          Math.abs(
            safeY -
            stackTop
          ) <
          SNAP_THRESHOLD_Y
        ) {

          targetStack =
            stack;

          snapPosition =
            "top";

          break;
        }
      }
    }
  }


  if (targetStack) {

    if (
      snapPosition ===
      "bottom"
    ) {

      targetStack.containerElem
        .appendChild(
          newBlockElem
        );

      targetStack.blocks.push(
        blockData
      );

    } else {

      targetStack.containerElem
        .insertBefore(
          newBlockElem,
          targetStack.containerElem
            .firstChild
        );

      targetStack.blocks.unshift(
        blockData
      );
    }


    protectWorkspaceControls(
      newBlockElem,
      targetStack.containerElem
    );

    return;
  }


  // ==========================================================
  // NEW STACK
  // ==========================================================

  const container =
    document.createElement(
      "div"
    );

  container.className =
    "block-stack-container";

  container.style.position =
    "absolute";

  container.style.left =
    `${safeX}px`;

  container.style.top =
    `${safeY}px`;

  /*
    Workspace stack dibuat draggable dengan Pointer Events.
    Ini menggantikan native HTML5 drag supaya blok bisa
    dipindah dengan mouse maupun touch secara konsisten.
  */
  container.draggable = false;

  container.appendChild(
    newBlockElem
  );

  if (workspaceCanvas) {
    workspaceCanvas.appendChild(
      container
    );
  } else {
    scriptArea.appendChild(
      container
    );
  }

  protectWorkspaceControls(
    newBlockElem,
    container
  );

  state.stacks.push({
    containerElem:
      container,

    blocks: [
      blockData
    ]
  });

  setupWorkspacePointerDrag(container);
}


// ============================================================
// WORKSPACE POINTER DRAG
// ============================================================

function setupWorkspacePointerDrag(container) {

  if (!container || !scriptArea) {
    return;
  }

  container.style.touchAction = "none";
  container.draggable = false;

  let pointerId = null;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  let pendingDetachEl = null;
  let pendingBlockEl = null;

  const MOVE_THRESHOLD = 4;

  function isInteractiveTarget(target) {
    if (!target || !target.closest) {
      return false;
    }

    return !!target.closest(
      "input, textarea, select, button, " +
      ".custom-dropdown, " +
      ".custom-dropdown-selected, " +
      ".custom-dropdown-option, " +
      ".block-checkbox"
    );
  }

  function cleanup() {
    window.removeEventListener(
      "pointermove",
      onPointerMove
    );

    window.removeEventListener(
      "pointerup",
      onPointerUp
    );

    window.removeEventListener(
      "pointercancel",
      onPointerCancel
    );

    container.classList.remove("is-dragging");
    container.classList.remove("dragging");

    if (pointerId !== null) {
      try {
        container.releasePointerCapture(pointerId);
      } catch (err) {}
    }

    pointerId = null;
    dragging = false;
  }

  function onPointerDown(e) {

    if (e.isPrimary === false) {
      return;
    }

    if (
      e.pointerType === "mouse" &&
      e.button !== 0
    ) {
      return;
    }

    if (isInteractiveTarget(e.target)) {
      return;
    }

    // Reporter yang sedang berada di dalam slot -> bisa ditarik keluar.
    pendingDetachEl =
      e.target && e.target.closest
        ? e.target.closest(".reporter-slot-holder > .scratch-block")
        : null;

    // Blok yang sudah terpasang (di dalam rongga C atau di tengah stack)
    // -> bisa ditarik keluar bersama blok-blok di bawahnya.
    pendingBlockEl = null;
    if (!pendingDetachEl && e.target && e.target.closest) {
      let el = e.target.closest(".scratch-block");
      while (el && container.contains(el)) {
        const parent = el.parentElement;
        if (parent === container ||
            (parent && parent.classList.contains("control-slot"))) {
          pendingBlockEl = el;
          break;
        }
        el = parent ? parent.closest(".scratch-block") : null;
      }
    }

    const rect =
      container.getBoundingClientRect();

    const scriptRect =
      scriptArea.getBoundingClientRect();

    offsetX =
      (
        e.clientX -
        scriptRect.left +
        scriptArea.scrollLeft
      ) / workspaceZoom -
      parseFloat(
        container.style.left || "0"
      );

    offsetY =
      (
        e.clientY -
        scriptRect.top +
        scriptArea.scrollTop
      ) / workspaceZoom -
      parseFloat(
        container.style.top || "0"
      );

    pointerId =
      e.pointerId;

    dragging = false;

    try {
      container.setPointerCapture(
        pointerId
      );
    } catch (err) {}

    e.preventDefault();
    e.stopPropagation();

    window.addEventListener(
      "pointermove",
      onPointerMove,
      { passive: false }
    );

    window.addEventListener(
      "pointerup",
      onPointerUp,
      { passive: false }
    );

    window.addEventListener(
      "pointercancel",
      onPointerCancel,
      { passive: false }
    );
  }

  function onPointerMove(e) {

    if (
      pointerId === null ||
      e.pointerId !== pointerId
    ) {
      return;
    }

    const rect =
      container.getBoundingClientRect();

    /*
      Gunakan posisi relatif ke script-area.
      scrollLeft/scrollTop ikut dihitung sehingga
      blok tetap berada di posisi yang benar saat
      workspace sedang discroll.
    */
    const scriptRect =
      scriptArea.getBoundingClientRect();

    if (!dragging) {

      /*
        Jangan anggap klik biasa sebagai drag.
      */
      const dx =
        e.clientX -
        (rect.left + offsetX * workspaceZoom);

      const dy =
        e.clientY -
        (rect.top + offsetY * workspaceZoom);

      if (
        Math.abs(dx) < MOVE_THRESHOLD &&
        Math.abs(dy) < MOVE_THRESHOLD
      ) {
        return;
      }

      // Tarik reporter keluar dari slot -> jadi blok lepas yang ikut digeser.
      if (pendingDetachEl) {
        const hostInput = pendingDetachEl.parentElement
          ? pendingDetachEl.parentElement._hostInput
          : null;
        const detachedRect = pendingDetachEl.getBoundingClientRect();
        const pt = getWorkspacePoint(detachedRect.left, detachedRect.top);
        const detached = hostInput ? detachReporterFromInput(hostInput) : null;
        pendingDetachEl = null;

        if (detached && detached.el) {
          const newContainer = createFloatingStack(detached.el, detached.data, pt.x, pt.y);
          const startEvent = new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            clientX: e.clientX,
            clientY: e.clientY,
            pointerId: e.pointerId,
            pointerType: e.pointerType,
            isPrimary: true,
            button: 0
          });
          cleanup();
          newContainer.dispatchEvent(startEvent);
          return;
        }
      }

      // Tarik blok yang sudah terpasang -> lepas dari induknya.
      if (pendingBlockEl) {
        const blockEl = pendingBlockEl;
        pendingBlockEl = null;

        const ownStack = findStackByContainer(container);
        const loc = ownStack ? findBlockLocation(ownStack.blocks, blockEl) : null;
        const isWholeStack = loc && !loc.parentBlock && loc.index === 0;

        if (loc && !isWholeStack) {
          const br = blockEl.getBoundingClientRect();
          const pt = getWorkspacePoint(br.left, br.top);

          // Blok ini + semua blok di bawahnya ikut terlepas (seperti Scratch).
          const moved = loc.list.splice(loc.index);
          const newContainer = createFloatingStackFromBlocks(moved, pt.x, pt.y);
          if (loc.parentBlock) relayoutControlAncestors(loc.parentBlock.element);

          const startEvent = new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            clientX: e.clientX,
            clientY: e.clientY,
            pointerId: e.pointerId,
            pointerType: e.pointerType,
            isPrimary: true,
            button: 0
          });
          cleanup();
          newContainer.dispatchEvent(startEvent);
          return;
        }
      }

      dragging = true;

      container.classList.add(
        "is-dragging"
      );

      container.classList.add(
        "dragging"
      );
    }

    e.preventDefault();

    let newLeft =
      (
        e.clientX -
        scriptRect.left +
        scriptArea.scrollLeft
      ) / workspaceZoom -
      offsetX;

    let newTop =
      (
        e.clientY -
        scriptRect.top +
        scriptArea.scrollTop
      ) / workspaceZoom -
      offsetY;

    /*
      Minimal 0 supaya blok tidak hilang
      ke sebelah kiri/atas workspace.
    */
    newLeft =
      Math.max(0, newLeft);

    newTop =
      Math.max(0, newTop);

    container.style.left =
      `${newLeft}px`;

    container.style.top =
      `${newTop}px`;
  }

  function onPointerUp(e) {

    if (
      pointerId === null ||
      e.pointerId !== pointerId
    ) {
      return;
    }

    e.preventDefault();

    const wasDragging = dragging;
    const clickedBlock =
      e.target && e.target.closest
        ? e.target.closest(".scratch-block")
        : null;

    if (!wasDragging && clickedBlock) {
      runClickedWorkspaceBlock(
        container,
        clickedBlock
      );
    }

    cleanup();

    // Reporter lepas yang dijatuhkan di atas slot -> masuk ke slot.
    if (wasDragging) {
      const ownStack = findStackByContainer(container);
      const only = ownStack && ownStack.blocks.length === 1 ? ownStack.blocks[0] : null;
      const isReporterBlock = only && only.element && only.element.classList.contains("block-reporter");
      if (isReporterBlock) {
        const pt = getWorkspacePoint(e.clientX, e.clientY);
        const hostInput = findReporterSlotAt(pt.x, pt.y, only.type, container);
        if (hostInput) {
          const idx = state.stacks.indexOf(ownStack);
          if (idx >= 0) state.stacks.splice(idx, 1);
          attachReporterToInput(hostInput, only.element, only);
          container.remove();
          return;
        }
      }
    }

    if (wasDragging) {
      const ownStack = findStackByContainer(container);

      // Dilepas di atas palette (daftar blok) -> hapus, seperti Scratch.
      if (ownStack && paletteScroll) {
        const pr = paletteScroll.getBoundingClientRect();
        if (e.clientX >= pr.left && e.clientX <= pr.right &&
            e.clientY >= pr.top && e.clientY <= pr.bottom) {
          deleteWorkspaceStack(ownStack);
          return;
        }
      }

      // Dilepas di atas rongga C-block -> masuk ke rongga itu.
      if (ownStack && ownStack.blocks.length && !isEventHat(ownStack.blocks[0].type)) {
        const pt = getWorkspacePoint(e.clientX, e.clientY);
        const cavity = findCavityAt(pt.x, pt.y, ownStack);
        if (cavity) {
          const blocks = ownStack.blocks.slice();
          deleteWorkspaceStack(ownStack);
          insertBlocksIntoCavity(cavity, blocks);
          return;
        }
      }
    }

    /*
      Kalau ada sistem snap, jalankan setelah
      blok selesai dipindahkan.
    */
    if (
      typeof updateStackSnap ===
      "function"
    ) {
      updateStackSnap(container);
    }
  }

  function onPointerCancel(e) {

    if (
      pointerId === null ||
      e.pointerId !== pointerId
    ) {
      return;
    }

    cleanup();
  }

  container.addEventListener(
    "pointerdown",
    onPointerDown,
    { passive: false }
  );
}


// ============================================================

// ============================================================
// STACK SNAP / CONNECT
// ============================================================

function updateStackSnap(sourceContainer) {
  if (!sourceContainer || !scriptArea) {
    return;
  }

  const sourceStack = findStackByContainer(sourceContainer);
  if (!sourceStack) {
    return;
  }

  const sourceFirst = getFirstBlock(sourceStack);
  const sourceIsEvent = sourceFirst && isEventHat(sourceFirst.type);

  const sourceRect = sourceContainer.getBoundingClientRect();
  const scriptRect = scriptArea.getBoundingClientRect();
  const sourceX =
    (
      sourceRect.left -
      scriptRect.left +
      scriptArea.scrollLeft
    ) / workspaceZoom;
  const sourceTop =
    (
      sourceRect.top -
      scriptRect.top +
      scriptArea.scrollTop
    ) / workspaceZoom;
  const sourceBottom =
    (
      sourceRect.bottom -
      scriptRect.top +
      scriptArea.scrollTop
    ) / workspaceZoom;

  const THRESHOLD_X = 100;
  const THRESHOLD_Y = 45;

  let target = null;
  let mode = null;
  let bestDistance = Infinity;

  for (const stack of state.stacks) {
    if (stack === sourceStack || !stack.containerElem?.isConnected) {
      continue;
    }

    const targetRect = stack.containerElem.getBoundingClientRect();
    const targetX =
      (
        targetRect.left -
        scriptRect.left +
        scriptArea.scrollLeft
      ) / workspaceZoom;
    const targetTop =
      (
        targetRect.top -
        scriptRect.top +
        scriptArea.scrollTop
      ) / workspaceZoom;
    const targetBottom =
      (
        targetRect.bottom -
        scriptRect.top +
        scriptArea.scrollTop
      ) / workspaceZoom;
    const xDistance = Math.abs(sourceX - targetX);

    if (xDistance > THRESHOLD_X) {
      continue;
    }

    // Normal stack -> event stack: attach underneath the event stack.
    const bottomToTop = Math.abs(sourceTop - targetBottom);
    if (bottomToTop < THRESHOLD_Y && bottomToTop < bestDistance) {
      // An event hat can never be placed after another block.
      if (!sourceIsEvent && isEventHat(getFirstBlock(stack)?.type)) {
        target = stack;
        mode = "append-to-target";
        bestDistance = bottomToTop;
      }
    }

    // Event stack -> normal stack: put the event stack above target.
    const topToBottom = Math.abs(sourceBottom - targetTop);
    if (topToBottom < THRESHOLD_Y && topToBottom < bestDistance) {
      const targetIsEvent = isEventHat(getFirstBlock(stack)?.type);
      if (!targetIsEvent && sourceIsEvent) {
        target = stack;
        mode = "prepend-target";
        bestDistance = topToBottom;
      }
    }

    // Normal stack -> normal stack: either direction is valid.
    if (!sourceIsEvent && !isEventHat(getFirstBlock(stack)?.type)) {
      if (bottomToTop < THRESHOLD_Y && bottomToTop < bestDistance) {
        target = stack;
        mode = "append-to-target";
        bestDistance = bottomToTop;
      }
      if (topToBottom < THRESHOLD_Y && topToBottom < bestDistance) {
        target = stack;
        mode = "prepend-target";
        bestDistance = topToBottom;
      }
    }
  }

  if (!target || !mode) {
    return;
  }

  const sourceIndex = state.stacks.indexOf(sourceStack);
  if (sourceIndex >= 0) {
    state.stacks.splice(sourceIndex, 1);
  }

  if (mode === "append-to-target") {
    for (const block of sourceStack.blocks) {
      target.containerElem.appendChild(block.element);
      target.blocks.push(block);
    }
  } else {
    for (let i = sourceStack.blocks.length - 1; i >= 0; i--) {
      const block = sourceStack.blocks[i];
      target.containerElem.insertBefore(
        block.element,
        target.containerElem.firstChild
      );
      target.blocks.unshift(block);
    }
  }

  sourceContainer.remove();
}

// ============================================================
// PROTECT WORKSPACE CONTROLS
// ============================================================

function protectWorkspaceControls(
  block,
  container
) {

  if (
    !block ||
    !container
  ) {
    return;
  }

  block.querySelectorAll(
    "input, .custom-dropdown"
  ).forEach(
    (element) => {

      protectInteractiveElement(
        element,
        container
      );
    }
  );
}

// ============================================================
// EVENTS SYSTEM
// ============================================================

function isEventHat(type) {
  return [
    "when_flag_clicked",
    "when_key_pressed",
    "when_sprite_clicked",
    "when_backdrop_switches",
    "when_loudness_gt",
    "when_receive"
  ].includes(type);
}


function getFirstBlock(stack) {
  if (
    !stack ||
    !stack.blocks ||
    !stack.blocks.length
  ) {
    return null;
  }

  return stack.blocks[0];
}


function getBlockDropdownValue(block) {

  if (!block || !block.element) {
    return null;
  }

  const dropdown = getOwnDropdown(block.element);

  return dropdown
    ? dropdown.dataset.value
    : null;
}


function getBlockInputValue(block) {

  if (!block || !block.element) {
    return null;
  }

  const input = getOwnInputs(block.element)[0];

  return input
    ? input.value
    : null;
}



function valueOf(v) {
  const raw = String(v ?? "").trim();
  if (Object.prototype.hasOwnProperty.call(state.variables, raw)) return state.variables[raw];
  if (raw.toLowerCase() === "true") return true;
  if (raw.toLowerCase() === "false") return false;
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) ? n : raw;
}

function truthyScratch(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "" || s === "false" || s === "0" || s === "nan") return false;
  return true;
}

function updateVariableMonitor(name) {
  const display = document.getElementById(`var-val-${name}`);
  if (display) display.innerText = state.variables[name];
}

function setVariableVisible(name, visible) {
  if (!state.variableMeta[name]) state.variableMeta[name] = { visible:true, scope:"all" };
  state.variableMeta[name].visible = visible;
  renderStageVariableMonitors();
}

let loudnessAnalyser = null;
let loudnessData = null;
let loudnessStream = null;
async function ensureLoudnessMeter() {
  if (loudnessAnalyser) return true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    loudnessStream = await navigator.mediaDevices.getUserMedia({audio:true});
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const source = ac.createMediaStreamSource(loudnessStream);
    loudnessAnalyser = ac.createAnalyser();
    loudnessAnalyser.fftSize = 1024;
    source.connect(loudnessAnalyser);
    loudnessData = new Uint8Array(loudnessAnalyser.fftSize);
    return true;
  } catch (e) { return false; }
}
function getCurrentLoudness() {
  if (!loudnessAnalyser || !loudnessData) return 0;
  loudnessAnalyser.getByteTimeDomainData(loudnessData);
  let sum = 0;
  for (const v of loudnessData) { const x = (v - 128) / 128; sum += x*x; }
  const rms = Math.sqrt(sum / loudnessData.length);
  return Math.max(0, Math.min(100, Math.round(rms * 180)));
}

function getSensingValue(type, option) {
  if (type === "mouse_x") return getMousePosition().x;
  if (type === "mouse_y") return getMousePosition().y;
  if (type === "timer") return (performance.now() - state.timerStartedAt) / 1000;
  if (type === "days_since_2000") return (Date.now() - Date.UTC(2000,0,1)) / 86400000;
  if (type === "online") return navigator.onLine;
  if (type === "username") return state.currentUser || "";
  if (type === "loudness") return getCurrentLoudness();
  if (type === "answer") return state.answer;
  if (type === "current") {
    const d = new Date();
    return {year:d.getFullYear(),month:d.getMonth()+1,date:d.getDate(),day:d.getDay()+1,hour:d.getHours(),minute:d.getMinutes(),second:d.getSeconds()}[option];
  }
  if (type === "mouse_down") return !!window.mouseDown;
  if (type === "key_pressed") return !!window.__keys?.has(option);
  if (type === "distance_to") {
    const p = option === "mouse" ? getMousePosition() : {x:state.sprite.x,y:state.sprite.y};
    return Math.hypot(p.x-state.sprite.x,p.y-state.sprite.y);
  }
  if (type === "touching") {
    if (option === "edge") return Math.abs(state.sprite.x) >= 220 || Math.abs(state.sprite.y) >= 160;
    if (option === "mouse") return Math.hypot(getMousePosition().x-state.sprite.x,getMousePosition().y-state.sprite.y) < 30;
    return false;
  }
  return "";
}

function evaluateBlockReporter(blockObj) {
  if (!blockObj?.element) return "";
  const inputs = getOwnInputs(blockObj.element).map(i => i.value);
  const dropdown = getOwnDropdown(blockObj.element);
  const option = dropdown?.dataset.value;
  const a = valueOf(inputs[0]), b = valueOf(inputs[1]);
  switch(blockObj.type) {
    case "reporter_x": return state.sprite.x;
    case "reporter_y": return state.sprite.y;
    case "reporter_direction": return state.sprite.direction;
    case "reporter_size": return state.sprite.size;
    case "backdrop_of": {
      if (option === "number") return BACKDROP_DEFINITIONS.findIndex(b=>b.name===state.backdrop.current)+1;
      if (option === "volume") return state.soundState.volume;
      if (option === "my variable") return state.variables["my variable"] ?? "";
      return state.backdrop.current;
    }
    case "reporter_volume": return state.soundState.volume;
    case "reporter_costume": return option === "number" ? COSTUME_DEFINITIONS.findIndex(c=>c.name===state.sprite.costume)+1 : state.sprite.costume;
    case "reporter_backdrop": return option === "number" ? BACKDROP_DEFINITIONS.findIndex(b=>b.name===state.backdrop.current)+1 : state.backdrop.current;
    case "var_reporter": return state.variables[blockObj.customName || option] ?? "";
    case "list_reporter": return (state.lists[blockObj.customName || option] || []).join(" ");
    case "list_length": return (state.lists[option] || []).length;
    case "list_item": {
      const idx = Math.floor(Number(a)); const list = state.lists[option] || []; return idx >= 1 && idx <= list.length ? list[idx-1] : "";
    }
    case "list_contains": return (state.lists[option] || []).some(v => String(v).toLowerCase() === String(a).toLowerCase());
    case "touching_color": return false;
    case "color_touching_color": return false;
    case "op_add": return Number(a)+Number(b);
    case "op_subtract": return Number(a)-Number(b);
    case "op_multiply": return Number(a)*Number(b);
    case "op_divide": return Number(b) === 0 ? "Infinity" : Number(a)/Number(b);
    case "op_random": { const lo=Number(a), hi=Number(b); return Number.isInteger(lo)&&Number.isInteger(hi) ? Math.floor(Math.random()*(hi-lo+1))+Math.min(lo,hi) : Math.random()*(hi-lo)+lo; }
    case "op_gt": return a > b;
    case "op_lt": return a < b;
    case "op_eq": return String(a).toLowerCase() === String(b).toLowerCase();
    case "op_and": return truthyScratch(a)&&truthyScratch(b);
    case "op_or": return truthyScratch(a)||truthyScratch(b);
    case "op_not": return !truthyScratch(a);
    case "op_join": return String(a)+String(b);
    case "op_letter": return String(b)[Math.max(0,Number(a)-1)] ?? "";
    case "op_length": return String(a).length;
    case "op_contains": return String(a).toLowerCase().includes(String(b).toLowerCase());
    case "op_mod": return Number(a)%Number(b);
    case "op_round": return Math.round(Number(a));
    case "op_math": {
      const n=Number(b);
      if (!Number.isFinite(n)) return 0;
      const rad=n*Math.PI/180;
      switch(option){
        case "abs": return Math.abs(n);
        case "floor": return Math.floor(n);
        case "ceil": return Math.ceil(n);
        case "sqrt": return Math.sqrt(n);
        case "sin": return Math.sin(rad);
        case "cos": return Math.cos(rad);
        case "tan": return Math.tan(rad);
        case "asin": return Math.asin(n)*180/Math.PI;
        case "acos": return Math.acos(n)*180/Math.PI;
        case "atan": return Math.atan(n)*180/Math.PI;
        case "ln": return Math.log(n);
        case "log": return Math.log10 ? Math.log10(n) : Math.log(n)/Math.LN10;
        case "e": return Math.exp(n);
        case "10pow": return Math.pow(10,n);
        default: return n;
      }
    }
    default: return getSensingValue(blockObj.type, option);
  }
}

// Execute exactly one block. Event hats are handled by the event system.
async function executeSingleEventBlock(blockObj) {
  if (!blockObj || !blockObj.element) {
    return;
  }

const inputs = getOwnInputs(blockObj.element);


const val0 =
  inputs[0]
    ? inputs[0].value
    : null;

const val1 =
  inputs[1]
    ? inputs[1].value
    : null;

const val2 =
  inputs[2]
    ? inputs[2].value
    : null;


const dropdown = getOwnDropdown(blockObj.element);


const selectedOption =
  dropdown
    ? dropdown.dataset.value
    : null;


switch (
  blockObj.type
) {

  // ==================================================
  // MOTION
  // ==================================================

  case "move_steps": {

    const steps =
      parseFloat(val0);

    const safeSteps =
      Number.isFinite(steps)
        ? steps
        : 0;

    const rad =
      state.sprite.direction *
      Math.PI /
      180;

    state.sprite.x +=
      Math.sin(rad) *
      safeSteps;

    state.sprite.y +=
      Math.cos(rad) *
      safeSteps;

    break;
  }


  case "turn_right": {

    const amount =
      parseFloat(val0);

    state.sprite.direction =
      normalizeDirection(
        state.sprite.direction +
        (
          Number.isFinite(amount)
            ? amount
            : 0
        )
      );

    break;
  }


  case "turn_left": {

    const amount =
      parseFloat(val0);

    state.sprite.direction =
      normalizeDirection(
        state.sprite.direction -
        (
          Number.isFinite(amount)
            ? amount
            : 0
        )
      );

    break;
  }


  case "goto_random": {

    const target =
      selectedOption === "mouse"
        ? getMousePosition()
        : getRandomPosition();

    state.sprite.x =
      target.x;

    state.sprite.y =
      target.y;

    break;
  }


  case "goto_xy": {

    const xValue =
      parseFloat(val0);

    const yValue =
      parseFloat(val1);

    state.sprite.x =
      Number.isFinite(xValue)
        ? xValue
        : 0;

    state.sprite.y =
      Number.isFinite(yValue)
        ? yValue
        : 0;

    break;
  }


  case "glide_random": {

    const seconds =
      parseFloat(val0);

    const duration =
      (
        Number.isFinite(seconds)
          ? Math.max(
              0.01,
              seconds
            )
          : 1
      ) *
      1000;

    const startX =
      state.sprite.x;

    const startY =
      state.sprite.y;

    const target =
      selectedOption === "mouse"
        ? getMousePosition()
        : getRandomPosition();

    const startTime =
      performance.now();

    await new Promise(
      (resolve) => {

        function animate(now) {

          if (
            !state.isRunning
          ) {

            resolve();

            return;
          }

          const progress =
            Math.min(
              (
                now -
                startTime
              ) /
              duration,
              1
            );

          state.sprite.x =
            startX +
            (
              target.x -
              startX
            ) *
            progress;

          state.sprite.y =
            startY +
            (
              target.y -
              startY
            ) *
            progress;

          renderStage();

          if (
            progress <
            1
          ) {

            requestAnimationFrame(
              animate
            );

          } else {

            resolve();
          }
        }

        requestAnimationFrame(
          animate
        );
      }
    );

    break;
  }


  case "glide_xy": {

    const seconds =
      parseFloat(val0);

    const duration =
      (
        Number.isFinite(seconds)
          ? Math.max(
              0.01,
              seconds
            )
          : 1
      ) *
      1000;

    const targetXValue =
      parseFloat(val1);

    const targetYValue =
      parseFloat(val2);

    const targetX =
      Number.isFinite(targetXValue)
        ? targetXValue
        : 0;

    const targetY =
      Number.isFinite(targetYValue)
        ? targetYValue
        : 0;

    const startX =
      state.sprite.x;

    const startY =
      state.sprite.y;

    const startTime =
      performance.now();

    await new Promise(
      (resolve) => {

        function animate(now) {

          if (
            !state.isRunning
          ) {

            resolve();

            return;
          }

          const progress =
            Math.min(
              (
                now -
                startTime
              ) /
              duration,
              1
            );

          state.sprite.x =
            startX +
            (
              targetX -
              startX
            ) *
            progress;

          state.sprite.y =
            startY +
            (
              targetY -
              startY
            ) *
            progress;

          renderStage();

          if (
            progress <
            1
          ) {

            requestAnimationFrame(
              animate
            );

          } else {

            resolve();
          }
        }

        requestAnimationFrame(
          animate
        );
      }
    );

    break;
  }


  case "point_direction": {

    const direction =
      parseFloat(val0);

    state.sprite.direction =
      normalizeDirection(
        Number.isFinite(direction)
          ? direction
          : 90
      );

    break;
  }


  case "point_towards": {

    const target =
      selectedOption === "mouse"
        ? getMousePosition()
        : getRandomPosition();

    const dx =
      target.x -
      state.sprite.x;

    const dy =
      target.y -
      state.sprite.y;

    if (
      dx !== 0 ||
      dy !== 0
    ) {

      state.sprite.direction =
        normalizeDirection(
          Math.atan2(
            dx,
            dy
          ) *
          180 /
          Math.PI
        );
    }

    break;
  }


  case "change_x": {

    const amount =
      parseFloat(val0);

    state.sprite.x +=
      Number.isFinite(amount)
        ? amount
        : 0;

    break;
  }


  case "set_x": {

    const xValue =
      parseFloat(val0);

    state.sprite.x =
      Number.isFinite(xValue)
        ? xValue
        : 0;

    break;
  }


  case "change_y": {

    const amount =
      parseFloat(val0);

    state.sprite.y +=
      Number.isFinite(amount)
        ? amount
        : 0;

    break;
  }


  case "set_y": {

    const yValue =
      parseFloat(val0);

    state.sprite.y =
      Number.isFinite(yValue)
        ? yValue
        : 0;

    break;
  }


  case "if_edge": {

    if (!canvas) {
      break;
    }

    const maxX =
      canvas.width / 2 - 25;

    const maxY =
      canvas.height / 2 - 25;

    if (
      state.sprite.x >
      maxX
    ) {

      state.sprite.x =
        maxX;

      state.sprite.direction =
        360 -
        state.sprite.direction;
    }

    if (
      state.sprite.x <
      -maxX
    ) {

      state.sprite.x =
        -maxX;

      state.sprite.direction =
        360 -
        state.sprite.direction;
    }

    if (
      state.sprite.y >
      maxY
    ) {

      state.sprite.y =
        maxY;

      state.sprite.direction =
        180 -
        state.sprite.direction;
    }

    if (
      state.sprite.y <
      -maxY
    ) {

      state.sprite.y =
        -maxY;

      state.sprite.direction =
        180 -
        state.sprite.direction;
    }

    state.sprite.direction =
      normalizeDirection(
        state.sprite.direction
      );

    break;
  }


  case "set_rotation_style": {

    if (
      selectedOption
    ) {

      state.sprite.rotationStyle =
        selectedOption;
    }

    break;
  }


  // ==================================================
  // LOOKS
  // ==================================================

  case "say_for_secs": {

    setBubble(
      val0 || "",
      "say"
    );

    const saySeconds =
      parseFloat(val1);

    const safeSaySeconds =
      Number.isFinite(saySeconds)
        ? Math.max(
            0,
            saySeconds
          )
        : 2;

    await waitWhileRunning(
      safeSaySeconds
    );

    if (
      state.isRunning
    ) {

      state.sprite.sayText =
        "";

      renderStage();
    }

    break;
  }


  case "say": {

    setBubble(
      val0 || "",
      "say"
    );

    break;
  }


  case "think_for_secs": {

    setBubble(
      val0 || "",
      "think"
    );

    const thinkSeconds =
      parseFloat(val1);

    const safeThinkSeconds =
      Number.isFinite(thinkSeconds)
        ? Math.max(
            0,
            thinkSeconds
          )
        : 2;

    await waitWhileRunning(
      safeThinkSeconds
    );

    if (
      state.isRunning
    ) {

      state.sprite.sayText =
        "";

      state.sprite.bubbleType =
        "say";

      renderStage();
    }

    break;
  }


  case "think": {

    setBubble(
      val0 || "",
      "think"
    );

    break;
  }


  case "switch_costume": {

    if (
      selectedOption
    ) {

      state.sprite.costume =
        selectedOption;
    }

    break;
  }


  case "next_costume": {

    nextCostume();

    break;
  }


  case "change_size": {

    const amount =
      parseFloat(val0);

    if (
      Number.isFinite(amount)
    ) {

      state.sprite.size +=
        amount;
    }

    state.sprite.size =
      clamp(
        state.sprite.size,
        1,
        1000
      );

    break;
  }


  case "set_size": {

    const newSize =
      parseFloat(val0);

    if (
      Number.isFinite(newSize)
    ) {

      state.sprite.size =
        clamp(
          newSize,
          1,
          1000
        );
    }

    break;
  }


  case "show": {

    // Sprite yang sudah dihapus tidak boleh muncul lagi lewat blok
    state.sprite.visible =
      !state.sprite.deleted;

    break;
  }


  case "hide": {

    state.sprite.visible =
      false;

    break;
  }


  case "change_graphic_effect": {

    changeGraphicEffect(
      selectedOption,
      parseFloat(val0)
    );

    break;
  }


  case "set_graphic_effect": {

    setGraphicEffect(
      selectedOption,
      parseFloat(val0)
    );

    break;
  }


  case "clear_graphic_effects": {

    clearGraphicEffects();

    break;
  }


  case "go_to_front": {

    state.sprite.layer =
      999999;

    break;
  }


  case "go_back_layers": {

    const layers =
      parseFloat(val0);

    if (
      Number.isFinite(layers)
    ) {

      state.sprite.layer -=
        layers;
    }

    break;
  }


  case "switch_backdrop": {

    if (
      selectedOption
    ) {

      state.backdrop.current =
        selectedOption;
    }

    break;
  }


  case "next_backdrop": {

    nextBackdrop();

    break;
  }


  // ==================================================
  // SOUND
  // ==================================================

  case "play_sound_until_done": {

    await playSoundByName(
      selectedOption,
      true
    );

    break;
  }


  case "start_sound": {

    playSoundByName(
      selectedOption,
      false
    );

    break;
  }


  case "stop_all_sounds": {

    stopAllSounds();

    break;
  }


  case "change_sound_effect": {

    const amount =
      parseFloat(val0);

    if (
      selectedOption ===
      "pitch"
    ) {

      state.soundState.pitch +=
        Number.isFinite(amount)
          ? amount
          : 0;
    }

    if (
      selectedOption ===
      "pan"
    ) {

      state.soundState.pan +=
        Number.isFinite(amount)
          ? amount
          : 0;
    }

    break;
  }


  case "set_sound_effect": {

    const amount =
      parseFloat(val0);

    if (
      selectedOption ===
      "pitch"
    ) {

      state.soundState.pitch =
        Number.isFinite(amount)
          ? amount
          : 0;
    }

    if (
      selectedOption ===
      "pan"
    ) {

      state.soundState.pan =
        Number.isFinite(amount)
          ? amount
          : 0;
    }

    break;
  }


  case "clear_sound_effects": {

    state.soundState.pitch =
      0;

    state.soundState.pan =
      0;

    break;
  }


  case "change_volume": {

    const amount =
      parseFloat(val0);

    if (
      Number.isFinite(amount)
    ) {

      state.soundState.volume =
        clamp(
          state.soundState.volume +
          amount,
          0,
          100
        );
    }

    break;
  }


  case "set_volume": {

    const volume =
      parseFloat(val0);

    if (
      Number.isFinite(volume)
    ) {

      state.soundState.volume =
        clamp(
          volume,
          0,
          100
        );
    }

    break;
  }


  // ==================================================
  // CONTROL
  // ==================================================

  case "wait_secs": {

    const seconds =
      parseFloat(val0);

    const waitTime =
      Number.isFinite(seconds)
        ? Math.max(
            0,
            seconds
          )
        : 1;

    await waitWhileRunning(
      waitTime
    );

    break;
  }


  // ==================================================
  // VARIABLES
  // ==================================================

  case "change_var": {
    const amount = parseFloat(val0);
    const name = selectedOption || "my variable";
    if (Number.isFinite(amount)) {
      state.variables[name] = Number(state.variables[name] || 0) + amount;
      updateVariableMonitor(name);
    }
    break;
  }


  // ==================================================
  // CONTROL
  // ==================================================

  case "repeat": {
    const n = Math.max(0, Math.floor(Number(val0) || 0));
    const children = getControlBranchBlocks(blockObj, 0);

    if (children.length) {
      for (let k = 0; k < n && state.isRunning; k++) {
        for (const child of children) {
          if (!state.isRunning) break;
          await executeSingleEventBlock(child);
        }
      }
    } else {
      // Backward-compatible flat-workspace fallback.
      const stack = state.stacks.find(st => st.blocks.includes(blockObj));
      const i = stack ? stack.blocks.indexOf(blockObj) : -1;
      const next = stack?.blocks[i + 1];
      if (next && n > 0) {
        for (let k = 0; k < n && state.isRunning; k++) {
          await executeSingleEventBlock(next);
        }
      }
    }
    break;
  }

  case "forever": {
    const children = getControlBranchBlocks(blockObj, 0);

    if (children.length) {
      let guard = 0;
      while (state.isRunning && guard++ < 10000) {
        for (const child of children) {
          if (!state.isRunning) break;
          await executeSingleEventBlock(child);
        }
        await new Promise(r => setTimeout(r, 0));
      }
    } else {
      // Backward-compatible flat-workspace fallback.
      const stack = state.stacks.find(st => st.blocks.includes(blockObj));
      const i = stack ? stack.blocks.indexOf(blockObj) : -1;
      const next = stack?.blocks[i + 1];
      let guard = 0;
      while (state.isRunning && next && guard++ < 10000) {
        await executeSingleEventBlock(next);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    break;
  }

  case "if": {
    if (truthyScratch(valueOf(val0))) {
      const children = getControlBranchBlocks(blockObj, 0);
      if (children.length) {
        for (const child of children) {
          if (!state.isRunning) break;
          await executeSingleEventBlock(child);
        }
      } else {
        const stack = state.stacks.find(st => st.blocks.includes(blockObj));
        const i = stack ? stack.blocks.indexOf(blockObj) : -1;
        if (stack?.blocks[i + 1]) {
          await executeSingleEventBlock(stack.blocks[i + 1]);
        }
      }
    }
    break;
  }

  case "if_else": {
    const branch = truthyScratch(valueOf(val0)) ? 0 : 1;
    const children = getControlBranchBlocks(blockObj, branch);

    if (children.length) {
      for (const child of children) {
        if (!state.isRunning) break;
        await executeSingleEventBlock(child);
      }
    } else {
      // Backward-compatible flat-workspace fallback for the first branch.
      const stack = state.stacks.find(st => st.blocks.includes(blockObj));
      const i = stack ? stack.blocks.indexOf(blockObj) : -1;
      const next = stack?.blocks[i + 1];
      if (branch === 0 && next) {
        await executeSingleEventBlock(next);
      }
    }
    break;
  }

  case "wait_until": {
    const started=performance.now();
    const liveCond = () => { const i = getOwnInputs(blockObj.element)[0]; return i ? i.value : val0; };
    while(state.isRunning && !truthyScratch(valueOf(liveCond())) && performance.now()-started<60000)
      await new Promise(r=>setTimeout(r,50));
    break;
  }

  case "repeat_until": {
    const children = getControlBranchBlocks(blockObj, 0);

    if (children.length) {
      let guard = 0;
      while (
        state.isRunning &&
        !truthyScratch(valueOf(getOwnInputs(blockObj.element)[0]?.value ?? val0)) &&
        guard++ < 10000
      ) {
        for (const child of children) {
          if (!state.isRunning) break;
          await executeSingleEventBlock(child);
        }
        await new Promise(r=>setTimeout(r,0));
      }
    } else {
      // Backward-compatible flat-workspace fallback.
      const stack = state.stacks.find(st => st.blocks.includes(blockObj));
      const i = stack ? stack.blocks.indexOf(blockObj) : -1;
      const next = stack?.blocks[i + 1];
      let guard = 0;
      while (
        state.isRunning &&
        !truthyScratch(valueOf(getOwnInputs(blockObj.element)[0]?.value ?? val0)) &&
        next &&
        guard++ < 10000
      ) {
        await executeSingleEventBlock(next);
        await new Promise(r=>setTimeout(r,0));
      }
    }
    break;
  }

  case "stop": {
    state.isRunning=false;
    break;
  }

  case "create_clone": {
    // This app currently has one editable sprite; clone support is represented
    // by a snapshot and a clone event hook for future multi-sprite work.
    state.lastClone = {...state.sprite};
    break;
  }

  case "delete_clone": {
    state.sprite.visible=false;
    break;
  }

  // ==================================================
  // SENSING
  // ==================================================

  case "ask_wait": {
    const answer=window.prompt(val0 || "");
    state.answer=answer ?? "";
    break;
  }

  case "reset_timer": {
    state.timerStartedAt=performance.now();
    break;
  }

  case "key_pressed": {
    break;
  }

  case "set_drag_mode": {
    state.dragMode = selectedOption === "draggable" ? "draggable" : "not-draggable";
    break;
  }

  // ==================================================
  // VARIABLES
  // ==================================================

  case "set_var": {
    const name=selectedOption || "my variable";
    state.variables[name]=valueOf(val0);
    if (!state.variableMeta[name]) state.variableMeta[name]={visible:true};
    updateVariableMonitor(name);
    break;
  }

  case "show_var": {
    setVariableVisible(selectedOption || "my variable", true);
    break;
  }

  case "hide_var": {
    setVariableVisible(selectedOption || "my variable", false);
    break;
  }

  case "add_list": {
    const name = String(val0 || "my list").trim();
    if (name) {
      state.lists[name] = [];
      state.listMeta[name] = { visible: true, scope: state._pendingListScope || "all" };
      state._pendingListScope = null;
      renderVariablePaletteAndMonitors();
    }
    break;
  }

  case "delete_list_all": {
    const name = selectedOption || Object.keys(state.lists)[0];
    if (name && state.lists[name]) state.lists[name] = [];
    renderVariablePaletteAndMonitors();
    break;
  }

  case "list_add": {
    const name = selectedOption || Object.keys(state.lists)[0];
    if (name && state.lists[name]) state.lists[name].push(val0 ?? "");
    renderVariablePaletteAndMonitors();
    break;
  }

  case "list_delete_item": {
    const name = selectedOption || Object.keys(state.lists)[0];
    const idx = Math.floor(Number(val0));
    if (name && state.lists[name] && Number.isFinite(idx) && idx >= 1 && idx <= state.lists[name].length) state.lists[name].splice(idx - 1, 1);
    renderVariablePaletteAndMonitors();
    break;
  }

  case "list_insert": {
    const name = selectedOption || Object.keys(state.lists)[0];
    const idx = Math.max(1, Math.floor(Number(val1) || 1));
    if (name && state.lists[name]) state.lists[name].splice(Math.min(idx - 1, state.lists[name].length), 0, val0 ?? "");
    renderVariablePaletteAndMonitors();
    break;
  }

  case "list_replace": {
    const name = selectedOption || Object.keys(state.lists)[0];
    const idx = Math.floor(Number(val0));
    if (name && state.lists[name] && Number.isFinite(idx) && idx >= 1 && idx <= state.lists[name].length) state.lists[name][idx - 1] = val1 ?? "";
    renderVariablePaletteAndMonitors();
    break;
  }

  case "show_list": {
    const name = selectedOption || Object.keys(state.lists)[0];
    if (name && state.listMeta[name]) state.listMeta[name].visible = true;
    renderVariablePaletteAndMonitors();
    break;
  }

  case "hide_list": {
    const name = selectedOption || Object.keys(state.lists)[0];
    if (name && state.listMeta[name]) state.listMeta[name].visible = false;
    renderVariablePaletteAndMonitors();
    break;
  }

  // ==================================================
  // MY BLOCKS
  // ==================================================

  case "define_myblock": {
    break;
  }

  case "call_myblock": {
    const name = blockObj.customName || selectedOption || "";
    const defStack = state.stacks.find(st => st.blocks[0]?.type === "define_myblock" && st.blocks[0]?.customName === name);
    if (defStack) {
      const oldRunning = state.isRunning;
      for (let i = 1; i < defStack.blocks.length && state.isRunning; i++) {
        await executeSingleEventBlock(defStack.blocks[i]);
      }
      state.isRunning = oldRunning;
    }
    break;
  }

  // ==================================================
  // REPORTERS
  // ==================================================

  case "reporter_x":
  case "reporter_y":
  case "reporter_direction":
  case "reporter_costume":
  case "reporter_backdrop":
  case "reporter_size":
  case "backdrop_of":
  case "reporter_volume":
  case "var_reporter":
  case "op_add":
  case "op_subtract":
  case "op_multiply":
  case "op_divide":
  case "op_random":
  case "op_gt":
  case "op_lt":
  case "op_eq":
  case "op_and":
  case "op_or":
  case "op_not":
  case "op_join":
  case "op_letter":
  case "op_length":
  case "op_contains":
  case "op_mod":
  case "op_round":
  case "op_math":
  case "touching":
  case "touching_color":
  case "color_touching_color":
  case "distance_to":
  case "answer":
  case "mouse_down":
  case "mouse_x":
  case "mouse_y":
  case "loudness":
  case "timer":
  case "current":
  case "days_since_2000":
  case "username":
  case "online":
  case "list_reporter":
  case "list_length":
  case "list_item":
  case "list_contains":
    blockObj.lastValue = evaluateBlockReporter(blockObj);
    break;
}


renderStage();


if (
  state.isRunning
) {

  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        100
      )
  );
}
}

// ============================================================
// KEY PRESSED
// ============================================================

document.addEventListener(
  "keydown",
  (e) => {

    // Jangan trigger ketika sedang mengetik
    // di input block.
    if (
      e.target &&
      (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA"
      )
    ) {
      return;
    }

    if (e.repeat) {
      return;
    }

    let key =
      e.key;

    if (key === " ") {
      key = "space";
    }

    state.stacks.forEach(
      (stack) => {

        const firstBlock =
          getFirstBlock(stack);

        if (
          !firstBlock ||
          firstBlock.type !==
            "when_key_pressed"
        ) {
          return;
        }

        const selectedKey =
          getBlockDropdownValue(
            firstBlock
          );

        if (
          selectedKey === "any" ||
          selectedKey === key
        ) {

          runEventStack(
            stack
          );
        }
      }
    );
  }
);


// ============================================================
// SPRITE CLICKED
// ============================================================

if (canvas) {

  canvas.addEventListener(
    "click",
    (e) => {

      if (
        !state.sprite.visible
      ) {
        return;
      }

      const rect =
        canvas.getBoundingClientRect();

      const scaleX =
        canvas.width /
        rect.width;

      const scaleY =
        canvas.height /
        rect.height;

      const clickX =
        (
          e.clientX -
          rect.left
        ) *
        scaleX;

      const clickY =
        (
          e.clientY -
          rect.top
        ) *
        scaleY;

      const spriteX =
        state.sprite.x +
        canvas.width / 2;

      const spriteY =
        -state.sprite.y +
        canvas.height / 2;

      const radius =
        Math.max(
          30,
          35 *
          state.sprite.size /
          100
        );

      const distance =
        Math.sqrt(
          Math.pow(
            clickX - spriteX,
            2
          ) +
          Math.pow(
            clickY - spriteY,
            2
          )
        );

      if (
        distance <= radius
      ) {

        state.stacks
          .filter(
            (stack) => {

              const firstBlock =
                getFirstBlock(stack);

              return (
                firstBlock &&
                firstBlock.type ===
                  "when_sprite_clicked"
              );
            }
          )
          .forEach(
            (stack) => {

              runEventStack(
                stack
              );
            }
          );
      }
    }
  );
}


// ============================================================
// CLICK-TO-RUN WORKSPACE BLOCK
// ============================================================

function findStackByContainer(container) {
  return state.stacks.find(
    (stack) => stack.containerElem === container
  ) || null;
}

function findNestedBlockOwner(blocks, element) {
  for (const block of blocks || []) {
    if (block?.element === element) {
      return block;
    }

    for (const branch of block?.branches || []) {
      const found = findNestedBlockOwner(branch, element);
      if (found) return found;
    }
  }
  return null;
}

async function runClickedWorkspaceBlock(container, blockElement) {
  const stack = findStackByContainer(container);

  if (!stack || !blockElement) {
    return;
  }

  const index = stack.blocks.findIndex(
    (block) => block.element === blockElement
  );

  // Nested blocks inside Control C-blocks are not part of the
  // top-level stack array. They can still be clicked directly.
  if (index < 0) {
    const nestedBlock = findNestedBlockOwner(stack.blocks, blockElement);
    if (!nestedBlock || nestedBlock.type === "when_flag_clicked") {
      return;
    }

    if (state.isRunning) {
      return;
    }

    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    state.isRunning = true;
    try {
      await executeSingleEventBlock(nestedBlock);
      if (typeof renderStage === "function") renderStage();
    } finally {
      state.isRunning = false;
    }
    return;
  }

  const block = stack.blocks[index];

  // The flag hat is intentionally NOT directly executable.
  if (block.type === "when_flag_clicked") {
    return;
  }

  if (state.isRunning) {
    return;
  }

  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  state.isRunning = true;

  try {
    // If another event hat is clicked, start after the hat.
    let startIndex = index;
    if (isEventHat(block.type)) {
      startIndex = index + 1;
    }

    for (let i = startIndex; i < stack.blocks.length; i++) {
      if (!state.isRunning) {
        break;
      }

      const blockObj = stack.blocks[i];

      if (blockObj.type === "broadcast") {
        await triggerBroadcast(getBlockDropdownValue(blockObj));
        continue;
      }

      if (blockObj.type === "broadcast_wait") {
        await triggerBroadcast(getBlockDropdownValue(blockObj), true);
        continue;
      }

      await executeSingleEventBlock(blockObj);

      // Update the stage immediately so a block clicked directly
      // gives visible feedback (e.g. move/turn/say) without
      // requiring the green flag.
      if (typeof renderStage === "function") {
        renderStage();
      }

      // Keep the same small visual step used by event stacks.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    state.isRunning = false;
  }
}

// ============================================================
// RUN EVENT STACK
// ============================================================

async function runEventStack(
  stack
) {

  if (
    !stack ||
    !stack.blocks ||
    !stack.blocks.length
  ) {
    return;
  }

  const firstBlock =
    getFirstBlock(stack);

  let startIndex =
    isEventHat(firstBlock.type)
      ? 1
      : 0;

  const oldRunning =
    state.isRunning;

  state.isRunning =
    true;

  try {

    for (
      let i = startIndex;
      i < stack.blocks.length;
      i++
    ) {

      if (
        !state.isRunning
      ) {
        break;
      }

      const blockObj =
        stack.blocks[i];

      // Broadcast ditangani khusus
      if (
        blockObj.type ===
        "broadcast"
      ) {

        const message =
          getBlockDropdownValue(
            blockObj
          );

        triggerBroadcast(
          message
        );

        continue;
      }


      if (
        blockObj.type ===
        "broadcast_wait"
      ) {

        const message =
          getBlockDropdownValue(
            blockObj
          );

        await triggerBroadcast(
          message,
          true
        );

        continue;
      }


      // Untuk blok lainnya,
      // gunakan execution engine lama.
      await executeSingleEventBlock(
        blockObj
      );

      renderStage();

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            100
          )
      );
    }

  } finally {

    if (!oldRunning) {
      state.isRunning =
        false;
    }
  }
}


// ============================================================
// LOUDNESS / TIMER EVENT HATS
// ============================================================

function pollSensorEventHats() {
  state.stacks.forEach((stack) => {
    const firstBlock = getFirstBlock(stack);
    if (!firstBlock || firstBlock.type !== "when_loudness_gt") return;
    const source = getBlockDropdownValue(firstBlock) || "loudness";
    const threshold = Number(getBlockInputValue(firstBlock));
    const limit = Number.isFinite(threshold) ? threshold : 10;
    const value = source === "timer" ? getSensingValue("timer") : getSensingValue("loudness");
    const active = Number(value) > limit;
    const wasActive = state.eventTriggerState.get(firstBlock) === true;
    if (active && !wasActive && !state.isRunning) runEventStack(stack);
    state.eventTriggerState.set(firstBlock, active);
  });
}

setInterval(pollSensorEventHats, 100);

// ============================================================
// BROADCAST
// ============================================================

async function triggerBroadcast(
  message,
  waitForDone = false
) {

  if (!message) {
    return;
  }

  const receivers =
    state.stacks.filter(
      (stack) => {

        const firstBlock =
          getFirstBlock(stack);

        if (
          !firstBlock ||
          firstBlock.type !==
            "when_receive"
        ) {
          return false;
        }

        return (
          getBlockDropdownValue(
            firstBlock
          ) === message
        );
      }
    );


  const runs =
    receivers.map(
      (stack) =>
        runEventStack(stack)
    );


  if (waitForDone) {
    await Promise.all(runs);
  }
}
// ============================================================
// EXECUTION ENGINE
// ============================================================

async function runProgram() {

  // Run button behavior:
  // - Event stacks (when 🚩 clicked / when key / etc.) are optional.
  // - A normal stack that starts directly with Motion, Looks, Control,
  //   etc. is also executable from the Run button.
  // This makes the Run button useful even when the user has not added
  // a `when 🚩 clicked` hat block.
  if (state.isRunning) {
    return;
  }

  const runnableStacks = state.stacks.filter((stack) => {
    return stack && Array.isArray(stack.blocks) && stack.blocks.length > 0 && stack.blocks[0].type !== "define_myblock";
  });

  if (!runnableStacks.length) {
    return;
  }

  state.isRunning = true;

  try {
    // Run every visible stack from top to bottom. For an event stack,
    // runEventStack() automatically skips its event/hat block. For a
    // normal stack, runEventStack() starts at block 0.
    //
    // We intentionally run stacks one after another here because the
    // execution engine uses one shared state.isRunning flag. This keeps
    // Stop reliable and prevents one short stack from cancelling another.
    for (const stack of runnableStacks) {
      if (!state.isRunning) {
        break;
      }

      await runEventStack(stack);

      // runEventStack manages the shared flag internally, so restore it
      // between standalone stacks while the Run operation is still active.
      if (stack !== runnableStacks[runnableStacks.length - 1]) {
        state.isRunning = true;
      }
    }
  } finally {
    state.isRunning = false;
    if (typeof renderStage === "function") {
      renderStage();
    }
  }
}

// ============================================================
// CONTROLS
// ============================================================

const greenFlagBtn =
  document.getElementById(
    "green-flag-btn"
  );

const stopBtn =
  document.getElementById(
    "stop-btn"
  );


if (greenFlagBtn) {

  greenFlagBtn.addEventListener(
    "click",
    () => {

      if (
        audioCtx &&
        audioCtx.state ===
        "suspended"
      ) {

        audioCtx.resume();
      }

      runProgram();
    }
  );
}


if (stopBtn) {

  stopBtn.addEventListener(
    "click",
    () => {

      stopAllSounds();

      state.isRunning =
        false;

      state.sprite.sayText =
        "";

      state.sprite.bubbleType =
        "say";

      renderStage();
    }
  );
}


// ============================================================
// RESET PROJECT
// ===========================================================
function resetProjectState() {
  state.isRunning =
    false;
  state.stacks =
    [];
  draggedWorkspaceElem =
    null;
  dragOffsetX =
    0;
  dragOffsetY =
    0;
  if (activePointerDrag) {
    if (
      activePointerDrag.clone
    ) {
      activePointerDrag.clone.remove();
    }
    activePointerDrag =
      null;
  }
  // Reset sprite
  state.sprite = {
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    sayText: "",
    bubbleType: "say",
    costume: "costume1",
    name: "Kucing",
    rotationStyle:
      "all-around",
    graphicEffects: {
      color: 0,
      fisheye: 0,
      whirl: 0,
      pixelate: 0,
      mosaic: 0,
      brightness: 0,
      ghost: 0
    },
    layer: 0
  };
  // Reset backdrop
  state.backdrop = {
    current:
      "backdrop1"
  };
  // Reset sound
  resetSoundLibrary();
  state.soundState = {
    volume: 100,
    pitch: 0,
    pan: 0
  };
  // Reset variables
  state.variables = { score: 0 };
  state.variableMeta = { score: { visible: true, scope: "all" } };
  state.lists = {};
  state.listMeta = {};
  state.myBlocks = {};
  state.sensingMonitors = {};
  window.mouseX =
    null;
  window.mouseY =
    null;
  closeAllDropdowns(true);
  // Clear workspace without destroying the zoom canvas/controls.
  // The previous implementation used scriptArea.innerHTML = "",
  // which removed #workspace-canvas from the DOM while the JS reference
  // still pointed to the detached element. New blocks were then appended
  // into that invisible detached canvas.
  state.stacks = [];
  state.eventTriggerState = new WeakMap();
  if (workspaceCanvas) {
    workspaceCanvas
      .querySelectorAll(".block-stack-container")
      .forEach((container) => container.remove());
  } else if (scriptArea) {
    // Safety fallback for an older DOM without workspace-canvas.
    scriptArea
      .querySelectorAll(".block-stack-container")
      .forEach((container) => container.remove());
  }
  // Score
  const scoreElem =
    document.getElementById(
      "var-val-score"
    );
  if (scoreElem) {

    scoreElem.innerText =
      "0";
  }
  // Bubble
  if (sayBubble) {
    sayBubble.style.display =
      "none";
    sayBubble.innerText =
      "";
    sayBubble.style.left =
      "";
    sayBubble.style.top =
      "";
    sayBubble.classList.remove(
      "think-bubble"
    );
  }
  // Canvas

  if (
    canvas &&
    ctx
  ) {
    ctx.setTransform(
      1,
      0,
      0,
      1,
      0,
      0
    );
    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
  }
  renderStage();
  updateSpriteInfo();
}
// CLEAR WORKSPACE BUTTON
const clearWsBtn =
  document.getElementById(
    "clear-ws-btn"
  );
if (clearWsBtn) {
  clearWsBtn.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetProjectState();
    }
  );
}
// GLOBAL DROPDOWN
document.addEventListener(
  "pointerdown",
  (e) => {

    if (
      e.target.closest(
        ".custom-dropdown-menu"
      )
    ) {
      return;
    }
    if (
      e.target.closest(
        ".custom-dropdown-selected"
      )
    ) {
      return;
    }
    closeAllDropdowns();
  }
);
// RESIZE
let resizeTimer =
  null;
window.addEventListener(
  "resize",
  () => {

    clearTimeout(
      resizeTimer
    );
    resizeTimer =
      setTimeout(
        () => {
          const dropdown =
            document.querySelector(
              ".custom-dropdown.open"
            );
          if (dropdown) {

            positionDropdownMenu(
              dropdown
            );
          }
          renderStage();
        },
        50
      );
  }
);
// ORIENTATION CHANGE
window.addEventListener(
  "orientationchange",
  () => {
    setTimeout(
      () => {
        const dropdown =
          document.querySelector(
            ".custom-dropdown.open"
          );
        if (dropdown) {
          positionDropdownMenu(
            dropdown
          );
        }
        renderStage();
      },
      150
    );
  }
);
// ============================================================
// SCROLL
// ============================================================
if (paletteScroll) {
  paletteScroll.addEventListener(
    "scroll",
    () => {

      closeAllDropdowns();
    },
    { passive: true }
  );
}
if (scriptArea) {

  scriptArea.addEventListener(
    "scroll",
    () => {

      closeAllDropdowns();
    },
    { passive: true }
  );
}
// TOUCH / MOBILE SAFETY
document.addEventListener(
  "touchmove",
  (e) => {

    if (
      activePointerDrag
    ) {

      e.preventDefault();
    }
  },
  { passive: false }
);
setInterval(() => {
  if (state.sensingMonitors?.timer || state.sensingMonitors?.loudness || state.sensingMonitors?.online || state.sensingMonitors?.username || state.sensingMonitors?.answer || state.sensingMonitors?.current) {
    renderSensingMonitors();
  }
  if (Object.values(state.reporterMonitors || {}).some(Boolean)) renderReporterMonitors();
  if (state.sensingMonitors?.loudness && !loudnessAnalyser) ensureLoudnessMeter();
}, 100);
// ============================================================
// INITIAL SETUP
// ============================================================
checkAuth();
initPalette();
setupSidebarNavigation();
renderStage();
renderStageVariableMonitors();
renderSensingMonitors();
renderReporterMonitors();
// ============================================================
// SPRITE & BACKDROP LIBRARY (ala Scratch)
// ============================================================

function getArtImage(svg) {
  window.__artCache = window.__artCache || new Map();
  let img = window.__artCache.get(svg);
  if (!img) {
    img = new Image();
    img.onload = () => { try { renderStage(); } catch (e) {} };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    window.__artCache.set(svg, img);
  }
  return img;
}

function svgDataUri(svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

const ASSET_LIBRARY = {"sprites":[{"id":"bear","name":"Beruang","tags":["Hewan"],"costumes":[{"name":"beruang","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><ellipse cx=\"36\" cy=\"93\" rx=\"11\" ry=\"6\" fill=\"#8a5a30\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"64\" cy=\"93\" rx=\"11\" ry=\"6\" fill=\"#8a5a30\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"72\" rx=\"25\" ry=\"23\" fill=\"#9c6b3f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"76\" rx=\"14\" ry=\"15\" fill=\"#e6c79c\"/><ellipse cx=\"24\" cy=\"70\" rx=\"7\" ry=\"13\" fill=\"#9c6b3f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"rotate(20 24 70)\"/><ellipse cx=\"76\" cy=\"70\" rx=\"7\" ry=\"13\" fill=\"#9c6b3f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"rotate(-20 76 70)\"/><circle cx=\"28\" cy=\"27\" r=\"10\" fill=\"#9c6b3f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"72\" cy=\"27\" r=\"10\" fill=\"#9c6b3f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"28\" cy=\"27\" r=\"4.5\" fill=\"#e0a678\"/><circle cx=\"72\" cy=\"27\" r=\"4.5\" fill=\"#e0a678\"/><circle cx=\"50\" cy=\"40\" r=\"26\" fill=\"#b07a48\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"49\" rx=\"13\" ry=\"10\" fill=\"#ecd2aa\"/><circle cx=\"40\" cy=\"34\" r=\"3.2\" fill=\"#2b1a10\"/><circle cx=\"60\" cy=\"34\" r=\"3.2\" fill=\"#2b1a10\"/><circle cx=\"41\" cy=\"33\" r=\"1\" fill=\"#fff\"/><circle cx=\"61\" cy=\"33\" r=\"1\" fill=\"#fff\"/><ellipse cx=\"50\" cy=\"45\" rx=\"5\" ry=\"3.5\" fill=\"#2b1a10\"/><path d=\"M50 48.5v3.5M43.5 53q6.5 4.5 13 0\" stroke=\"#2b1a10\" stroke-width=\"1.7\" fill=\"none\" stroke-linecap=\"round\"/></svg>"}]},{"id":"bat","name":"Kelelawar","tags":["Hewan"],"costumes":[{"name":"sayap-atas","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M41 52Q22 16 3 24Q10 36 11 46Q18 40 21 52Q27 46 31 58Q37 56 41 64Z\" fill=\"#8a8a98\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M41 52Q22 16 3 24Q10 36 11 46Q18 40 21 52Q27 46 31 58Q37 56 41 64Z\" fill=\"#8a8a98\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"translate(100 0) scale(-1 1)\"/><ellipse cx=\"50\" cy=\"58\" rx=\"11\" ry=\"17\" fill=\"#5b5b68\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"40,34 37,15 48,27\" fill=\"#5b5b68\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"60,34 63,15 52,27\" fill=\"#5b5b68\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"40\" r=\"12\" fill=\"#5b5b68\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"45\" cy=\"38\" r=\"3.4\" fill=\"#fff\"/><circle cx=\"55\" cy=\"38\" r=\"3.4\" fill=\"#fff\"/><circle cx=\"45.5\" cy=\"38.5\" r=\"1.6\" fill=\"#111\"/><circle cx=\"54.5\" cy=\"38.5\" r=\"1.6\" fill=\"#111\"/><ellipse cx=\"50\" cy=\"45\" rx=\"3\" ry=\"2.2\" fill=\"#ff7b9c\"/><path d=\"M46 48l1.5 3 2-2 2 2 1.5-3\" stroke=\"#fff\" stroke-width=\"1.2\" fill=\"#fff\"/></svg>"},{"name":"sayap-bawah","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M41 52Q26 66 5 82Q16 78 19 71Q25 78 29 71Q35 75 38 67Q41 64 41 60Z\" fill=\"#8a8a98\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M41 52Q26 66 5 82Q16 78 19 71Q25 78 29 71Q35 75 38 67Q41 64 41 60Z\" fill=\"#8a8a98\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"translate(100 0) scale(-1 1)\"/><ellipse cx=\"50\" cy=\"58\" rx=\"11\" ry=\"17\" fill=\"#5b5b68\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"40,34 37,15 48,27\" fill=\"#5b5b68\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"60,34 63,15 52,27\" fill=\"#5b5b68\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"40\" r=\"12\" fill=\"#5b5b68\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"45\" cy=\"38\" r=\"3.4\" fill=\"#fff\"/><circle cx=\"55\" cy=\"38\" r=\"3.4\" fill=\"#fff\"/><circle cx=\"45.5\" cy=\"38.5\" r=\"1.6\" fill=\"#111\"/><circle cx=\"54.5\" cy=\"38.5\" r=\"1.6\" fill=\"#111\"/><ellipse cx=\"50\" cy=\"45\" rx=\"3\" ry=\"2.2\" fill=\"#ff7b9c\"/><path d=\"M46 48l1.5 3 2-2 2 2 1.5-3\" stroke=\"#fff\" stroke-width=\"1.2\" fill=\"#fff\"/></svg>"}]},{"id":"beetle","name":"Kumbang","tags":["Hewan"],"costumes":[{"name":"kumbang-1","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M30 44L17 50M70 44L83 50\" stroke=\"#2b2230\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M30 58L11 64M70 58L89 64\" stroke=\"#2b2230\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M30 72L17 82M70 72L83 82\" stroke=\"#2b2230\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M42 22L34 8M58 22L66 8\" stroke=\"#2b2230\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"26\" r=\"11\" fill=\"#f2842a\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"45\" cy=\"24\" r=\"2.5\" fill=\"#fff\"/><circle cx=\"55\" cy=\"24\" r=\"2.5\" fill=\"#fff\"/><circle cx=\"45\" cy=\"24.5\" r=\"1.2\" fill=\"#111\"/><circle cx=\"55\" cy=\"24.5\" r=\"1.2\" fill=\"#111\"/><ellipse cx=\"50\" cy=\"60\" rx=\"24\" ry=\"30\" fill=\"#7b4fb3\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50 32V90\" stroke=\"#2b2230\" stroke-width=\"1.6\"/><circle cx=\"38\" cy=\"54\" r=\"4.5\" fill=\"#f2c94c\"/><circle cx=\"62\" cy=\"54\" r=\"4.5\" fill=\"#f2c94c\"/><circle cx=\"39\" cy=\"72\" r=\"4\" fill=\"#f2c94c\"/><circle cx=\"61\" cy=\"72\" r=\"4\" fill=\"#f2c94c\"/></svg>"},{"name":"kumbang-2","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M30 44L11 50M70 44L89 50\" stroke=\"#2b2230\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M30 58L17 64M70 58L83 64\" stroke=\"#2b2230\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M30 72L11 82M70 72L89 82\" stroke=\"#2b2230\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M42 22L34 8M58 22L66 8\" stroke=\"#2b2230\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"26\" r=\"11\" fill=\"#f2842a\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"45\" cy=\"24\" r=\"2.5\" fill=\"#fff\"/><circle cx=\"55\" cy=\"24\" r=\"2.5\" fill=\"#fff\"/><circle cx=\"45\" cy=\"24.5\" r=\"1.2\" fill=\"#111\"/><circle cx=\"55\" cy=\"24.5\" r=\"1.2\" fill=\"#111\"/><ellipse cx=\"50\" cy=\"60\" rx=\"24\" ry=\"30\" fill=\"#7b4fb3\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50 32V90\" stroke=\"#2b2230\" stroke-width=\"1.6\"/><circle cx=\"38\" cy=\"54\" r=\"4.5\" fill=\"#f2c94c\"/><circle cx=\"62\" cy=\"54\" r=\"4.5\" fill=\"#f2c94c\"/><circle cx=\"39\" cy=\"72\" r=\"4\" fill=\"#f2c94c\"/><circle cx=\"61\" cy=\"72\" r=\"4\" fill=\"#f2c94c\"/></svg>"}]},{"id":"fish","name":"Ikan","tags":["Hewan"],"costumes":[{"name":"ikan-1","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M22 50L4 30Q10 50 4 70Z\" fill=\"#ff8a3d\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M40 30Q52 12 62 30Z\" fill=\"#ff8a3d\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"55\" cy=\"50\" rx=\"34\" ry=\"22\" fill=\"#ffa64d\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M40 34Q34 50 40 66M52 30Q46 50 52 70\" stroke=\"#ff7a1a\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M58 60Q68 72 76 62Q70 58 58 60Z\" fill=\"#ff8a3d\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"74\" cy=\"44\" r=\"5.5\" fill=\"#fff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"75.5\" cy=\"44\" r=\"2.6\" fill=\"#111\"/><path d=\"M86 55q-4 3-8 0\" stroke=\"#2b2230\" stroke-width=\"1.8\" fill=\"none\" stroke-linecap=\"round\"/></svg>"},{"name":"ikan-2","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M22 50L4 38Q10 50 4 62Z\" fill=\"#ff8a3d\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M40 30Q52 12 62 30Z\" fill=\"#ff8a3d\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"55\" cy=\"50\" rx=\"34\" ry=\"22\" fill=\"#ffa64d\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M40 34Q34 50 40 66M52 30Q46 50 52 70\" stroke=\"#ff7a1a\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M58 60Q68 72 76 62Q70 58 58 60Z\" fill=\"#ff8a3d\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"74\" cy=\"44\" r=\"5.5\" fill=\"#fff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"75.5\" cy=\"44\" r=\"2.6\" fill=\"#111\"/><path d=\"M86 55q-4 3-8 0\" stroke=\"#2b2230\" stroke-width=\"1.8\" fill=\"none\" stroke-linecap=\"round\"/></svg>"}]},{"id":"frog","name":"Katak","tags":["Hewan"],"costumes":[{"name":"katak","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><ellipse cx=\"22\" cy=\"86\" rx=\"14\" ry=\"7\" fill=\"#4caf50\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"78\" cy=\"86\" rx=\"14\" ry=\"7\" fill=\"#4caf50\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"66\" rx=\"30\" ry=\"25\" fill=\"#66c05a\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"72\" rx=\"18\" ry=\"16\" fill=\"#c9f0a8\"/><circle cx=\"32\" cy=\"34\" r=\"12\" fill=\"#66c05a\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"68\" cy=\"34\" r=\"12\" fill=\"#66c05a\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"32\" cy=\"33\" r=\"7.5\" fill=\"#fff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"68\" cy=\"33\" r=\"7.5\" fill=\"#fff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"33\" cy=\"34\" r=\"3.6\" fill=\"#111\"/><circle cx=\"67\" cy=\"34\" r=\"3.6\" fill=\"#111\"/><path d=\"M34 58Q50 72 66 58\" stroke=\"#2b2230\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"46\" cy=\"49\" r=\"1.3\" fill=\"#2b2230\"/><circle cx=\"54\" cy=\"49\" r=\"1.3\" fill=\"#2b2230\"/></svg>"}]},{"id":"bird","name":"Burung","tags":["Hewan"],"costumes":[{"name":"burung","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M20 50L2 38L6 56L0 68L22 62Z\" fill=\"#2f7fd6\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M44 84v8M56 84v8M40 93h10M52 93h10\" stroke=\"#f0a020\" stroke-width=\"2.6\" fill=\"none\" stroke-linecap=\"round\"/><ellipse cx=\"46\" cy=\"58\" rx=\"30\" ry=\"26\" fill=\"#4aa3ff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"66\" rx=\"18\" ry=\"14\" fill=\"#d9eeff\"/><path d=\"M30 52Q42 40 56 56Q46 72 30 62Z\" fill=\"#2f7fd6\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"70\" cy=\"34\" r=\"18\" fill=\"#4aa3ff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"86,30 100,36 86,42\" fill=\"#ffb02e\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"74\" cy=\"30\" r=\"4.4\" fill=\"#fff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"75.2\" cy=\"30.4\" r=\"2\" fill=\"#111\"/></svg>"}]},{"id":"apple","name":"Apel","tags":["Makanan"],"costumes":[{"name":"apel","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M50 30Q34 18 20 34Q8 52 24 78Q36 96 50 88Q64 96 76 78Q92 52 80 34Q66 18 50 30Z\" fill=\"#e53935\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50 30Q48 20 54 12\" stroke=\"#6b4423\" stroke-width=\"3.5\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M54 22Q66 8 80 16Q72 30 54 22Z\" fill=\"#4caf50\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M26 42Q28 34 36 32\" stroke=\"#fff\" stroke-opacity=\".7\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/></svg>"}]},{"id":"banana","name":"Pisang","tags":["Makanan"],"costumes":[{"name":"pisang","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M20 22Q16 62 46 82Q66 92 86 78Q88 74 82 72Q52 72 38 40Q34 26 30 20Q24 14 20 22Z\" fill=\"#ffe14d\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M30 22Q34 52 56 70\" stroke=\"#e0b800\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M20 22Q22 12 30 12Q34 14 30 20Z\" fill=\"#7a5a2a\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M86 78Q90 76 88 72L82 72Z\" fill=\"#7a5a2a\"/></svg>"}]},{"id":"icecream","name":"Es Krim","tags":["Makanan"],"costumes":[{"name":"es-krim","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><polygon points=\"30,50 70,50 50,96\" fill=\"#e3b26b\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M38 60L58 60M42 70L56 70M36 52L58 82M64 52L42 82M46 52L58 74\" stroke=\"#b9843c\" stroke-width=\"1.4\" fill=\"none\"/><circle cx=\"50\" cy=\"42\" r=\"20\" fill=\"#ff9ec4\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M30 46Q50 62 70 46Q70 36 50 30Q30 36 30 46Z\" fill=\"#fff2d8\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"20\" r=\"6\" fill=\"#e53935\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50 14Q52 6 58 4\" stroke=\"#4a7a2a\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\"/></svg>"}]},{"id":"cupcake","name":"Cupcake","tags":["Makanan"],"costumes":[{"name":"cupcake","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M22 56L30 92H70L78 56Z\" fill=\"#ffd166\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M34 56L38 92M46 56L47 92M58 56L57 92M68 56L64 92\" stroke=\"#e0a53a\" stroke-width=\"2\" fill=\"none\"/><ellipse cx=\"50\" cy=\"54\" rx=\"32\" ry=\"12\" fill=\"#ff9ec4\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"40\" rx=\"24\" ry=\"11\" fill=\"#ffb3d1\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"28\" rx=\"15\" ry=\"9\" fill=\"#ff9ec4\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"15\" r=\"6\" fill=\"#e53935\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"34\" y=\"34\" width=\"4\" height=\"2.4\" rx=\"1\" fill=\"#fff\" transform=\"rotate(20 36 35)\"/><rect x=\"58\" y=\"44\" width=\"4\" height=\"2.4\" rx=\"1\" fill=\"#4aa3ff\"/><rect x=\"42\" y=\"49\" width=\"4\" height=\"2.4\" rx=\"1\" fill=\"#ffd166\" transform=\"rotate(-20 44 50)\"/></svg>"}]},{"id":"ball","name":"Bola","tags":["Olahraga"],"costumes":[{"name":"bola","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><defs><radialGradient id=\"g\" cx=\"35%\" cy=\"30%\" r=\"75%\"><stop offset=\"0\" stop-color=\"#fff3a0\"/><stop offset=\".55\" stop-color=\"#ffc21a\"/><stop offset=\"1\" stop-color=\"#f29a00\"/></radialGradient></defs><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"url(#g)\" stroke=\"#d98200\" stroke-width=\"1.6\"/></svg>"}]},{"id":"basketball","name":"Bola Basket","tags":["Olahraga"],"costumes":[{"name":"bola-basket","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"#f28a1e\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M10 50H90M50 10V90M19 22Q40 50 19 78M81 22Q60 50 81 78\" stroke=\"#2b2230\" stroke-width=\"2\" fill=\"none\"/></svg>"}]},{"id":"baseball","name":"Bola Baseball","tags":["Olahraga"],"costumes":[{"name":"baseball","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"#fbf6ea\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M26 18Q40 50 26 82M74 18Q60 50 74 82\" stroke=\"#e53935\" stroke-width=\"2\" fill=\"none\"/><path d=\"M30 28l6 -2M33 38l7 -1M34 50h7M33 62l7 1M30 72l6 2M70 28l-6 -2M67 38l-7 -1M66 50h-7M67 62l-7 1M70 72l-6 2\" stroke=\"#e53935\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/></svg>"}]},{"id":"beachball","name":"Bola Pantai","tags":["Olahraga"],"costumes":[{"name":"bola-pantai","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><clipPath id=\"c\"><circle cx=\"50\" cy=\"50\" r=\"40\"/></clipPath><g clip-path=\"url(#c)\"><path d=\"M50 50L50.0 6.0A44 44 0 0 1 88.1 28.0Z\" fill=\"#e53935\"/><path d=\"M50 50L88.1 28.0A44 44 0 0 1 88.1 72.0Z\" fill=\"#ffd23f\"/><path d=\"M50 50L88.1 72.0A44 44 0 0 1 50.0 94.0Z\" fill=\"#4aa3ff\"/><path d=\"M50 50L50.0 94.0A44 44 0 0 1 11.9 72.0Z\" fill=\"#4caf50\"/><path d=\"M50 50L11.9 72.0A44 44 0 0 1 11.9 28.0Z\" fill=\"#ff8a3d\"/><path d=\"M50 50L11.9 28.0A44 44 0 0 1 50.0 6.0Z\" fill=\"#c060e0\"/></g><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"none\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"50\" r=\"6\" fill=\"#fff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></svg>"}]},{"id":"soccer","name":"Sepak Bola","tags":["Olahraga"],"costumes":[{"name":"sepak-bola","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"#fff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50.0 37.0L50.0 10.0M62.4 46.0L88.0 37.6M57.6 60.5L73.5 82.4M42.4 60.5L26.5 82.4M37.6 46.0L12.0 37.6\" stroke=\"#2b2230\" stroke-width=\"2\" fill=\"none\"/><polygon points=\"50.0,37.0 62.4,46.0 57.6,60.5 42.4,60.5 37.6,46.0\" fill=\"#2b2230\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></svg>"}]},{"id":"rocket","name":"Roket","tags":["Fantasi"],"costumes":[{"name":"roket-1","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M40 76Q50 96 60 76Z\" fill=\"#ff9a1a\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M44 76Q50 88 56 76Z\" fill=\"#ffe14d\"/><path d=\"M34 62L18 80L18 58L32 44Z\" fill=\"#e53935\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M66 62L82 80L82 58L68 44Z\" fill=\"#e53935\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50 6Q72 24 68 74H32Q28 24 50 6Z\" fill=\"#f4f4fb\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50 6Q64 18 67 40H33Q36 18 50 6Z\" fill=\"#e53935\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"52\" r=\"9\" fill=\"#7fd0ff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"47\" cy=\"49\" r=\"2.6\" fill=\"#fff\" fill-opacity=\".8\"/></svg>"},{"name":"roket-2","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M40 76Q50 102 60 76Z\" fill=\"#ff9a1a\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M44 76Q50 94 56 76Z\" fill=\"#ffe14d\"/><path d=\"M34 62L18 80L18 58L32 44Z\" fill=\"#e53935\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M66 62L82 80L82 58L68 44Z\" fill=\"#e53935\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50 6Q72 24 68 74H32Q28 24 50 6Z\" fill=\"#f4f4fb\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50 6Q64 18 67 40H33Q36 18 50 6Z\" fill=\"#e53935\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"52\" r=\"9\" fill=\"#7fd0ff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"47\" cy=\"49\" r=\"2.6\" fill=\"#fff\" fill-opacity=\".8\"/></svg>"}]},{"id":"ghost","name":"Hantu","tags":["Fantasi"],"costumes":[{"name":"hantu","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M20 90V46Q20 12 50 12Q80 12 80 46V90L70 80L60 90L50 80L40 90L30 80Z\" fill=\"#f6f6ff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"40\" cy=\"44\" rx=\"5\" ry=\"7\" fill=\"#2b2230\"/><ellipse cx=\"60\" cy=\"44\" rx=\"5\" ry=\"7\" fill=\"#2b2230\"/><circle cx=\"41.5\" cy=\"41.5\" r=\"1.6\" fill=\"#fff\"/><circle cx=\"61.5\" cy=\"41.5\" r=\"1.6\" fill=\"#fff\"/><ellipse cx=\"50\" cy=\"60\" rx=\"6\" ry=\"8\" fill=\"#2b2230\"/><ellipse cx=\"31\" cy=\"55\" rx=\"5\" ry=\"3\" fill=\"#ffb3c6\"/><ellipse cx=\"69\" cy=\"55\" rx=\"5\" ry=\"3\" fill=\"#ffb3c6\"/></svg>"}]},{"id":"robot","name":"Robot","tags":["Fantasi"],"costumes":[{"name":"robot","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M50 14V4\" stroke=\"#2b2230\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"4\" r=\"3.6\" fill=\"#e53935\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"20\" y=\"52\" width=\"60\" height=\"34\" rx=\"6\" fill=\"#b8c2d6\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"6\" y=\"54\" width=\"12\" height=\"26\" rx=\"5\" fill=\"#97a3bb\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"82\" y=\"54\" width=\"12\" height=\"26\" rx=\"5\" fill=\"#97a3bb\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"68\" r=\"6\" fill=\"#ffd23f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"30\" y=\"86\" width=\"12\" height=\"9\" rx=\"2\" fill=\"#97a3bb\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"58\" y=\"86\" width=\"12\" height=\"9\" rx=\"2\" fill=\"#97a3bb\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"24\" y=\"14\" width=\"52\" height=\"38\" rx=\"9\" fill=\"#d5dcec\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"38\" cy=\"32\" r=\"7\" fill=\"#4aa3ff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"62\" cy=\"32\" r=\"7\" fill=\"#4aa3ff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"39.5\" cy=\"30.5\" r=\"2\" fill=\"#fff\"/><circle cx=\"63.5\" cy=\"30.5\" r=\"2\" fill=\"#fff\"/><path d=\"M38 44H62\" stroke=\"#2b2230\" stroke-width=\"2.2\" stroke-linecap=\"round\"/></svg>"}]},{"id":"star","name":"Bintang","tags":["Fantasi"],"costumes":[{"name":"bintang","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><polygon points=\"50.0,10.0 61.2,38.6 91.8,40.4 68.1,59.9 75.9,89.6 50.0,73.0 24.1,89.6 31.9,59.9 8.2,40.4 38.8,38.6\" fill=\"#ffd23f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"50.0,28.0 56.5,45.1 74.7,46.0 60.5,57.4 65.3,75.0 50.0,65.0 34.7,75.0 39.5,57.4 25.3,46.0 43.5,45.1\" fill=\"#ffe98a\"/></svg>"}]},{"id":"heart","name":"Hati","tags":["Fantasi"],"costumes":[{"name":"hati","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M50 88Q8 58 10 34Q12 14 30 14Q44 14 50 28Q56 14 70 14Q88 14 90 34Q92 58 50 88Z\" fill=\"#ef476f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M22 32Q24 24 32 22\" stroke=\"#fff\" stroke-opacity=\".75\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/></svg>"}]},{"id":"balloon","name":"Balon","tags":["Benda"],"costumes":[{"name":"balon","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M50 88Q56 96 48 100\" stroke=\"#555\" stroke-width=\"1.6\" fill=\"none\"/><polygon points=\"50,80 43,90 57,90\" fill=\"#1f7fd0\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50 82Q14 62 16 36Q18 6 50 6Q82 6 84 36Q86 62 50 82Z\" fill=\"#2fb2ff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M28 32Q30 20 40 16\" stroke=\"#fff\" stroke-opacity=\".75\" stroke-width=\"4.5\" fill=\"none\" stroke-linecap=\"round\"/></svg>"}]},{"id":"bell","name":"Lonceng","tags":["Benda","Musik"],"costumes":[{"name":"lonceng","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"12\" r=\"5\" fill=\"#e6a800\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M50 14Q22 16 22 56Q22 70 12 80H88Q78 70 78 56Q78 16 50 14Z\" fill=\"#ffd23f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M34 34Q36 22 46 20\" stroke=\"#fff\" stroke-opacity=\".7\" stroke-width=\"4\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"86\" r=\"8\" fill=\"#e6a800\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></svg>"}]},{"id":"arrow","name":"Panah","tags":["Benda"],"costumes":[{"name":"panah","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M8 40H60V20L94 50L60 80V60H8Z\" fill=\"#ef476f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></svg>"}]},{"id":"crown","name":"Mahkota","tags":["Benda","Fantasi"],"costumes":[{"name":"mahkota","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M12 78L8 30L32 50L50 20L68 50L92 30L88 78Z\" fill=\"#ffd23f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"12\" y=\"74\" width=\"76\" height=\"12\" rx=\"3\" fill=\"#e6a800\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"8\" cy=\"28\" r=\"5\" fill=\"#ef476f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"18\" r=\"5\" fill=\"#4aa3ff\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"92\" cy=\"28\" r=\"5\" fill=\"#ef476f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"30\" cy=\"80\" r=\"3\" fill=\"#fff\"/><circle cx=\"50\" cy=\"80\" r=\"3\" fill=\"#fff\"/><circle cx=\"70\" cy=\"80\" r=\"3\" fill=\"#fff\"/></svg>"}]},{"id":"note","name":"Not Musik","tags":["Musik"],"costumes":[{"name":"not-musik","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M38 74V16L78 8V64\" stroke=\"#2b2230\" stroke-width=\"6\" fill=\"none\" stroke-linejoin=\"round\"/><path d=\"M38 24L78 16\" stroke=\"#2b2230\" stroke-width=\"7\"/><ellipse cx=\"28\" cy=\"76\" rx=\"14\" ry=\"10\" fill=\"#8a5cf5\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"rotate(-18 28 76)\"/><ellipse cx=\"68\" cy=\"66\" rx=\"14\" ry=\"10\" fill=\"#8a5cf5\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"rotate(-18 68 66)\"/></svg>"}]},{"id":"sun","name":"Matahari","tags":["Alam"],"costumes":[{"name":"matahari","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M80.0 50.0L94.0 50.0\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M76.0 65.0L88.1 72.0\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M65.0 76.0L72.0 88.1\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M50.0 80.0L50.0 94.0\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M35.0 76.0L28.0 88.1\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M24.0 65.0L11.9 72.0\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M20.0 50.0L6.0 50.0\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M24.0 35.0L11.9 28.0\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M35.0 24.0L28.0 11.9\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M50.0 20.0L50.0 6.0\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M65.0 24.0L72.0 11.9\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M76.0 35.0L88.1 28.0\" stroke=\"#ffb400\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"50\" r=\"24\" fill=\"#ffd23f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"42\" cy=\"46\" r=\"2.6\" fill=\"#2b2230\"/><circle cx=\"58\" cy=\"46\" r=\"2.6\" fill=\"#2b2230\"/><path d=\"M40 56Q50 66 60 56\" stroke=\"#2b2230\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\"/></svg>"}]},{"id":"cloud","name":"Awan","tags":["Alam"],"costumes":[{"name":"awan","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M26 78Q6 78 8 60Q10 46 26 48Q28 28 48 28Q62 28 68 40Q90 36 92 58Q94 78 74 78Z\" fill=\"#f4faff\" stroke=\"#8fb8de\" stroke-width=\"2\" stroke-linejoin=\"round\"/></svg>"}]},{"id":"tree","name":"Pohon","tags":["Alam"],"costumes":[{"name":"pohon","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M44 96V58H56V96Z\" fill=\"#8a5a30\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"34\" r=\"26\" fill=\"#3fa34d\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"30\" cy=\"52\" r=\"18\" fill=\"#4caf50\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"70\" cy=\"52\" r=\"18\" fill=\"#4caf50\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"50\" r=\"18\" fill=\"#57b85f\"/><circle cx=\"38\" cy=\"30\" r=\"3.4\" fill=\"#e53935\"/><circle cx=\"60\" cy=\"42\" r=\"3.4\" fill=\"#e53935\"/><circle cx=\"46\" cy=\"52\" r=\"3.4\" fill=\"#e53935\"/></svg>"}]},{"id":"kid","name":"Anak","tags":["Orang"],"costumes":[{"name":"berdiri","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><rect x=\"38\" y=\"70\" width=\"10\" height=\"24\" rx=\"4\" fill=\"#ffcf9f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"52\" y=\"70\" width=\"10\" height=\"24\" rx=\"4\" fill=\"#ffcf9f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"41\" cy=\"95\" rx=\"9\" ry=\"4\" fill=\"#2f7fd6\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"59\" cy=\"95\" rx=\"9\" ry=\"4\" fill=\"#2f7fd6\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"30\" y=\"72\" width=\"40\" height=\"10\" rx=\"4\" fill=\"#3b4a8a\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M30 46Q30 42 36 42H64Q70 42 70 46V74H30Z\" fill=\"#ef476f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"16\" y=\"44\" width=\"12\" height=\"26\" rx=\"5\" fill=\"#ef476f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"rotate(10 22 44)\"/><rect x=\"72\" y=\"44\" width=\"12\" height=\"26\" rx=\"5\" fill=\"#ef476f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"rotate(-10 78 44)\"/><circle cx=\"50\" cy=\"26\" r=\"17\" fill=\"#ffcf9f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M33 24Q34 8 50 8Q66 8 67 24Q58 16 50 18Q42 16 33 24Z\" fill=\"#4a2c17\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"44\" cy=\"28\" r=\"2.4\" fill=\"#2b2230\"/><circle cx=\"56\" cy=\"28\" r=\"2.4\" fill=\"#2b2230\"/><path d=\"M44 34Q50 39 56 34\" stroke=\"#2b2230\" stroke-width=\"1.8\" fill=\"none\" stroke-linecap=\"round\"/></svg>"},{"name":"berjalan","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"><path d=\"M42 70L28 92\" stroke=\"#2b2230\" stroke-width=\"12.4\" stroke-linecap=\"round\"/><path d=\"M42 70L28 92\" stroke=\"#ffcf9f\" stroke-width=\"9.6\" stroke-linecap=\"round\"/><path d=\"M58 70L72 92\" stroke=\"#2b2230\" stroke-width=\"12.4\" stroke-linecap=\"round\"/><path d=\"M58 70L72 92\" stroke=\"#ffcf9f\" stroke-width=\"9.6\" stroke-linecap=\"round\"/><ellipse cx=\"25\" cy=\"94\" rx=\"9\" ry=\"4\" fill=\"#2f7fd6\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"75\" cy=\"94\" rx=\"9\" ry=\"4\" fill=\"#2f7fd6\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"30\" y=\"72\" width=\"40\" height=\"10\" rx=\"4\" fill=\"#3b4a8a\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M30 46Q30 42 36 42H64Q70 42 70 46V74H30Z\" fill=\"#ef476f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"16\" y=\"44\" width=\"12\" height=\"26\" rx=\"5\" fill=\"#ef476f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"rotate(10 22 44)\"/><rect x=\"72\" y=\"44\" width=\"12\" height=\"26\" rx=\"5\" fill=\"#ef476f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"rotate(-10 78 44)\"/><circle cx=\"50\" cy=\"26\" r=\"17\" fill=\"#ffcf9f\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M33 24Q34 8 50 8Q66 8 67 24Q58 16 50 18Q42 16 33 24Z\" fill=\"#4a2c17\" stroke=\"#2b2230\" stroke-width=\"1.8\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"44\" cy=\"28\" r=\"2.4\" fill=\"#2b2230\"/><circle cx=\"56\" cy=\"28\" r=\"2.4\" fill=\"#2b2230\"/><path d=\"M44 34Q50 39 56 34\" stroke=\"#2b2230\" stroke-width=\"1.8\" fill=\"none\" stroke-linecap=\"round\"/></svg>"}]}],"backdrops":[{"name":"Pantai","tags":["Luar Ruangan"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><defs><linearGradient id=\"s\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#7cc8ff\"/><stop offset=\"1\" stop-color=\"#e3f5ff\"/></linearGradient></defs><rect width=\"480\" height=\"360\" fill=\"url(#s)\"/><circle cx=\"405\" cy=\"70\" r=\"36\" fill=\"#ffd23f\"/><ellipse cx=\"110\" cy=\"70\" rx=\"46\" ry=\"16\" fill=\"#fff\" fill-opacity=\".9\"/><ellipse cx=\"140\" cy=\"60\" rx=\"30\" ry=\"14\" fill=\"#fff\" fill-opacity=\".9\"/><rect y=\"170\" width=\"480\" height=\"100\" fill=\"#2f9be0\"/><path d=\"M0 200Q30 190 60 200T120 200T180 200T240 200T300 200T360 200T420 200T480 200\" stroke=\"#8fd3ff\" stroke-width=\"4\" fill=\"none\"/><path d=\"M0 235Q30 225 60 235T120 235T180 235T240 235T300 235T360 235T420 235T480 235\" stroke=\"#8fd3ff\" stroke-width=\"4\" fill=\"none\"/><path d=\"M0 262Q120 240 240 262T480 250V360H0Z\" fill=\"#f3d9a0\"/><path d=\"M60 330l14-30 14 30Z\" fill=\"#ef476f\"/><path d=\"M60 330V344\" stroke=\"#7a5a2a\" stroke-width=\"3\"/><circle cx=\"380\" cy=\"318\" r=\"10\" fill=\"#ffb3c6\"/><circle cx=\"330\" cy=\"336\" r=\"6\" fill=\"#ffd166\"/></svg>"},{"name":"Hutan","tags":["Luar Ruangan"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><rect width=\"480\" height=\"360\" fill=\"#cdeeb8\"/><rect y=\"250\" width=\"480\" height=\"110\" fill=\"#5aa84a\"/><rect x=\"53\" y=\"150\" width=\"14\" height=\"150\" fill=\"#7a5230\"/><circle cx=\"60\" cy=\"142\" r=\"50\" fill=\"#2e8b43\"/><circle cx=\"35\" cy=\"164\" r=\"35\" fill=\"#3aa055\"/><circle cx=\"85\" cy=\"164\" r=\"35\" fill=\"#3aa055\"/><rect x=\"163\" y=\"120\" width=\"14\" height=\"180\" fill=\"#7a5230\"/><circle cx=\"170\" cy=\"112\" r=\"58\" fill=\"#2e8b43\"/><circle cx=\"141\" cy=\"134\" r=\"40\" fill=\"#3aa055\"/><circle cx=\"199\" cy=\"134\" r=\"40\" fill=\"#3aa055\"/><rect x=\"293\" y=\"160\" width=\"14\" height=\"140\" fill=\"#7a5230\"/><circle cx=\"300\" cy=\"152\" r=\"48\" fill=\"#2e8b43\"/><circle cx=\"276\" cy=\"174\" r=\"33\" fill=\"#3aa055\"/><circle cx=\"324\" cy=\"174\" r=\"33\" fill=\"#3aa055\"/><rect x=\"403\" y=\"110\" width=\"14\" height=\"190\" fill=\"#7a5230\"/><circle cx=\"410\" cy=\"102\" r=\"60\" fill=\"#2e8b43\"/><circle cx=\"380\" cy=\"124\" r=\"42\" fill=\"#3aa055\"/><circle cx=\"440\" cy=\"124\" r=\"42\" fill=\"#3aa055\"/><ellipse cx=\"240\" cy=\"320\" rx=\"70\" ry=\"16\" fill=\"#4a9a3c\"/><circle cx=\"90\" cy=\"300\" r=\"7\" fill=\"#e53935\"/><circle cx=\"130\" cy=\"322\" r=\"6\" fill=\"#ffd23f\"/><circle cx=\"380\" cy=\"308\" r=\"7\" fill=\"#ef476f\"/></svg>"},{"name":"Kamar","tags":["Dalam Ruangan"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><rect width=\"480\" height=\"360\" fill=\"#f8e3c2\"/><rect y=\"250\" width=\"480\" height=\"110\" fill=\"#b5835a\"/><path d=\"M0 250H480\" stroke=\"#8f6540\" stroke-width=\"4\"/><rect x=\"70\" y=\"50\" width=\"140\" height=\"120\" rx=\"6\" fill=\"#7fd0ff\" stroke=\"#fff\" stroke-width=\"8\"/><path d=\"M140 50V170M70 110H210\" stroke=\"#fff\" stroke-width=\"6\"/><circle cx=\"180\" cy=\"86\" r=\"14\" fill=\"#ffd23f\" fill-opacity=\".9\"/><rect x=\"300\" y=\"60\" width=\"90\" height=\"70\" fill=\"#fff\" stroke=\"#8a5a30\" stroke-width=\"7\"/><path d=\"M308 122l25-30 20 20 15-14 28 24Z\" fill=\"#5aa84a\"/><circle cx=\"360\" cy=\"84\" r=\"7\" fill=\"#ffd23f\"/><ellipse cx=\"240\" cy=\"305\" rx=\"130\" ry=\"26\" fill=\"#ef476f\"/><ellipse cx=\"240\" cy=\"305\" rx=\"98\" ry=\"18\" fill=\"#ff8fab\"/><rect x=\"410\" y=\"200\" width=\"34\" height=\"50\" rx=\"4\" fill=\"#c9773a\"/><circle cx=\"427\" cy=\"180\" r=\"24\" fill=\"#3aa055\"/><circle cx=\"410\" cy=\"196\" r=\"14\" fill=\"#4caf50\"/><circle cx=\"446\" cy=\"196\" r=\"14\" fill=\"#4caf50\"/></svg>"},{"name":"Luar Angkasa","tags":["Luar Angkasa"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><defs><radialGradient id=\"a\" cx=\"50%\" cy=\"40%\" r=\"80%\"><stop offset=\"0\" stop-color=\"#1b1b4f\"/><stop offset=\"1\" stop-color=\"#05051a\"/></radialGradient></defs><rect width=\"480\" height=\"360\" fill=\"url(#a)\"/><circle cx=\"169\" cy=\"81\" r=\"2\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"28\" cy=\"41\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"302\" cy=\"33\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"48\" cy=\"226\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"127\" cy=\"50\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"427\" cy=\"293\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"326\" cy=\"325\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"303\" cy=\"207\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"27\" cy=\"289\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"218\" cy=\"77\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"161\" cy=\"290\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"301\" cy=\"296\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"53\" cy=\"284\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"34\" cy=\"320\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"352\" cy=\"276\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"242\" cy=\"303\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"157\" cy=\"131\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"403\" cy=\"128\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"157\" cy=\"272\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"377\" cy=\"233\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"41\" cy=\"64\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"391\" cy=\"179\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"219\" cy=\"24\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"297\" cy=\"164\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"183\" cy=\"308\" r=\"2\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"412\" cy=\"237\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"142\" cy=\"246\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"378\" cy=\"162\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"370\" cy=\"201\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"240\" cy=\"185\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"63\" cy=\"256\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"397\" cy=\"151\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"130\" cy=\"207\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"45\" cy=\"89\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"285\" cy=\"146\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"446\" cy=\"285\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"216\" cy=\"187\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"81\" cy=\"46\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"122\" cy=\"341\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"252\" cy=\"305\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"148\" cy=\"6\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"277\" cy=\"193\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"357\" cy=\"267\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"464\" cy=\"352\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"208\" cy=\"205\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"328\" cy=\"209\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"38\" cy=\"110\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"60\" cy=\"178\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"4\" cy=\"294\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"55\" cy=\"190\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"451\" cy=\"110\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"328\" cy=\"133\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"190\" cy=\"246\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"438\" cy=\"253\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"251\" cy=\"163\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"56\" cy=\"179\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"428\" cy=\"86\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"274\" cy=\"189\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"282\" cy=\"17\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"446\" cy=\"50\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"191\" cy=\"89\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"276\" cy=\"281\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"118\" cy=\"317\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"422\" cy=\"209\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"269\" cy=\"256\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"18\" cy=\"18\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"136\" cy=\"103\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"417\" cy=\"182\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"116\" cy=\"56\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"104\" cy=\"176\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"323\" cy=\"316\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"469\" cy=\"338\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"47\" cy=\"342\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"404\" cy=\"106\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"226\" cy=\"329\" r=\"1.4\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"414\" cy=\"206\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"384\" cy=\"47\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"69\" cy=\"18\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"467\" cy=\"242\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"427\" cy=\"309\" r=\"2\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"183\" cy=\"83\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"11\" cy=\"336\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"387\" cy=\"75\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"426\" cy=\"112\" r=\"1\" fill=\"#fff\" fill-opacity=\"0.8\"/><circle cx=\"112\" cy=\"153\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"170\" cy=\"136\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.6\"/><circle cx=\"35\" cy=\"185\" r=\"2\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"302\" cy=\"268\" r=\"2\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"70\" cy=\"276\" r=\"1\" fill=\"#fff\" fill-opacity=\"1\"/><circle cx=\"265\" cy=\"13\" r=\"2\" fill=\"#fff\" fill-opacity=\"0.6\"/><ellipse cx=\"340\" cy=\"130\" rx=\"74\" ry=\"14\" fill=\"none\" stroke=\"#f4c27a\" stroke-width=\"7\" transform=\"rotate(-18 340 130)\" stroke-opacity=\".7\"/><circle cx=\"340\" cy=\"130\" r=\"42\" fill=\"#e9944f\"/><path d=\"M304 118Q340 104 376 122M300 140Q340 156 380 138\" stroke=\"#c96f34\" stroke-width=\"6\" fill=\"none\"/><ellipse cx=\"340\" cy=\"130\" rx=\"74\" ry=\"14\" fill=\"none\" stroke=\"#f4c27a\" stroke-width=\"7\" stroke-dasharray=\"90 400\" transform=\"rotate(-18 340 130)\"/><circle cx=\"90\" cy=\"270\" r=\"50\" fill=\"#8fb8de\"/><circle cx=\"72\" cy=\"254\" r=\"10\" fill=\"#7ea6cc\"/><circle cx=\"108\" cy=\"288\" r=\"14\" fill=\"#7ea6cc\"/><circle cx=\"110\" cy=\"250\" r=\"6\" fill=\"#7ea6cc\"/></svg>"},{"name":"Bawah Laut","tags":["Bawah Air"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><defs><linearGradient id=\"w\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#5cc8ff\"/><stop offset=\"1\" stop-color=\"#0b4f9c\"/></linearGradient></defs><rect width=\"480\" height=\"360\" fill=\"url(#w)\"/><path d=\"M120 0L60 360H140L200 0Z M300 0L260 360H340L380 0Z\" fill=\"#fff\" fill-opacity=\".08\"/><path d=\"M0 330Q120 300 240 330T480 320V360H0Z\" fill=\"#e9d29a\"/><path d=\"M60 340Q40 300 66 270Q88 240 60 210\" stroke=\"#2fa35a\" stroke-width=\"10\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M420 340Q446 300 420 270Q396 240 424 210\" stroke=\"#2fa35a\" stroke-width=\"10\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M110 340Q96 310 116 290\" stroke=\"#3fc46a\" stroke-width=\"8\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"210\" cy=\"250\" r=\"10\" fill=\"#fff\" fill-opacity=\".35\" stroke=\"#fff\" stroke-opacity=\".7\"/><circle cx=\"226\" cy=\"210\" r=\"7\" fill=\"#fff\" fill-opacity=\".35\" stroke=\"#fff\" stroke-opacity=\".7\"/><circle cx=\"214\" cy=\"170\" r=\"5\" fill=\"#fff\" fill-opacity=\".35\" stroke=\"#fff\" stroke-opacity=\".7\"/><circle cx=\"300\" cy=\"280\" r=\"9\" fill=\"#fff\" fill-opacity=\".35\" stroke=\"#fff\" stroke-opacity=\".7\"/><circle cx=\"312\" cy=\"238\" r=\"6\" fill=\"#fff\" fill-opacity=\".35\" stroke=\"#fff\" stroke-opacity=\".7\"/><circle cx=\"150\" cy=\"120\" r=\"6\" fill=\"#fff\" fill-opacity=\".35\" stroke=\"#fff\" stroke-opacity=\".7\"/><circle cx=\"360\" cy=\"320\" r=\"10\" fill=\"#ef476f\"/><path d=\"M240 340l14-24 14 24Z\" fill=\"#ff8a3d\"/></svg>"},{"name":"Lapangan","tags":["Olahraga","Luar Ruangan"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><rect width=\"480\" height=\"360\" fill=\"#3f9d4a\"/><rect x=\"0\" width=\"60\" height=\"360\" fill=\"#46a852\"/><rect x=\"120\" width=\"60\" height=\"360\" fill=\"#46a852\"/><rect x=\"240\" width=\"60\" height=\"360\" fill=\"#46a852\"/><rect x=\"360\" width=\"60\" height=\"360\" fill=\"#46a852\"/><g stroke=\"#fff\" stroke-width=\"4\" fill=\"none\"><rect x=\"20\" y=\"20\" width=\"440\" height=\"320\"/><path d=\"M240 20V340\"/><circle cx=\"240\" cy=\"180\" r=\"50\"/><rect x=\"20\" y=\"110\" width=\"70\" height=\"140\"/><rect x=\"390\" y=\"110\" width=\"70\" height=\"140\"/></g><circle cx=\"240\" cy=\"180\" r=\"4\" fill=\"#fff\"/></svg>"},{"name":"Panggung","tags":["Dalam Ruangan","Musik"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><rect width=\"480\" height=\"360\" fill=\"#1d1230\"/><polygon points=\"240,0 130,300 350,300\" fill=\"#ffe98a\" fill-opacity=\".22\"/><ellipse cx=\"240\" cy=\"300\" rx=\"110\" ry=\"20\" fill=\"#ffe98a\" fill-opacity=\".3\"/><rect y=\"290\" width=\"480\" height=\"70\" fill=\"#8a5a30\"/><path d=\"M0 310H480M0 335H480\" stroke=\"#6f4622\" stroke-width=\"3\"/><path d=\"M0 0H120Q90 120 100 290H0Z\" fill=\"#b3202f\"/><path d=\"M480 0H360Q390 120 380 290H480Z\" fill=\"#b3202f\"/><path d=\"M30 0Q20 140 30 290M62 0Q52 140 62 290M420 0Q430 140 420 290M450 0Q460 140 450 290\" stroke=\"#8c1723\" stroke-width=\"5\" fill=\"none\"/></svg>"},{"name":"Kastil","tags":["Fantasi","Luar Ruangan"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><defs><linearGradient id=\"k\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9fd8ff\"/><stop offset=\"1\" stop-color=\"#f7e9ff\"/></linearGradient></defs><rect width=\"480\" height=\"360\" fill=\"url(#k)\"/><ellipse cx=\"80\" cy=\"70\" rx=\"44\" ry=\"15\" fill=\"#fff\"/><ellipse cx=\"400\" cy=\"100\" rx=\"50\" ry=\"16\" fill=\"#fff\"/><path d=\"M0 300Q120 230 240 290T480 270V360H0Z\" fill=\"#6cc070\"/><rect x=\"180\" y=\"150\" width=\"120\" height=\"150\" fill=\"#b9b3d6\"/><rect x=\"140\" y=\"110\" width=\"50\" height=\"190\" fill=\"#a49dc6\"/><rect x=\"290\" y=\"110\" width=\"50\" height=\"190\" fill=\"#a49dc6\"/><path d=\"M140 110l25-40 25 40Z M290 110l25-40 25 40Z\" fill=\"#ef476f\"/><path d=\"M165 70V44M315 70V44\" stroke=\"#555\" stroke-width=\"3\"/><path d=\"M165 44l22 8-22 8Z M315 44l22 8-22 8Z\" fill=\"#ffd23f\"/><path d=\"M215 300V250Q240 220 265 250V300Z\" fill=\"#6b4a2a\"/><rect x=\"152\" y=\"150\" width=\"26\" height=\"30\" rx=\"13\" fill=\"#6f65a8\"/><rect x=\"302\" y=\"150\" width=\"26\" height=\"30\" rx=\"13\" fill=\"#6f65a8\"/><path d=\"M180 150h10v-10h14v10h16v-10h14v10h16v-10h14v10h16v-10h10v10H180Z\" fill=\"#b9b3d6\"/></svg>"},{"name":"Garis-garis","tags":["Pola"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><rect width=\"480\" height=\"360\" fill=\"#ffe8f0\"/><rect x=\"0\" width=\"40\" height=\"360\" fill=\"#ffc2d6\"/><rect x=\"80\" width=\"40\" height=\"360\" fill=\"#ffc2d6\"/><rect x=\"160\" width=\"40\" height=\"360\" fill=\"#ffc2d6\"/><rect x=\"240\" width=\"40\" height=\"360\" fill=\"#ffc2d6\"/><rect x=\"320\" width=\"40\" height=\"360\" fill=\"#ffc2d6\"/><rect x=\"400\" width=\"40\" height=\"360\" fill=\"#ffc2d6\"/></svg>"},{"name":"Titik-titik","tags":["Pola"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><rect width=\"480\" height=\"360\" fill=\"#fff8e6\"/><circle cx=\"20\" cy=\"20\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"20\" cy=\"60\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"20\" cy=\"100\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"20\" cy=\"140\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"20\" cy=\"180\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"20\" cy=\"220\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"20\" cy=\"260\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"20\" cy=\"300\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"20\" cy=\"340\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"60\" cy=\"20\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"60\" cy=\"60\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"60\" cy=\"100\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"60\" cy=\"140\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"60\" cy=\"180\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"60\" cy=\"220\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"60\" cy=\"260\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"60\" cy=\"300\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"60\" cy=\"340\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"100\" cy=\"20\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"100\" cy=\"60\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"100\" cy=\"100\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"100\" cy=\"140\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"100\" cy=\"180\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"100\" cy=\"220\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"100\" cy=\"260\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"100\" cy=\"300\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"100\" cy=\"340\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"140\" cy=\"20\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"140\" cy=\"60\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"140\" cy=\"100\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"140\" cy=\"140\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"140\" cy=\"180\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"140\" cy=\"220\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"140\" cy=\"260\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"140\" cy=\"300\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"140\" cy=\"340\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"180\" cy=\"20\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"180\" cy=\"60\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"180\" cy=\"100\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"180\" cy=\"140\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"180\" cy=\"180\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"180\" cy=\"220\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"180\" cy=\"260\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"180\" cy=\"300\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"180\" cy=\"340\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"220\" cy=\"20\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"220\" cy=\"60\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"220\" cy=\"100\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"220\" cy=\"140\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"220\" cy=\"180\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"220\" cy=\"220\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"220\" cy=\"260\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"220\" cy=\"300\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"220\" cy=\"340\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"260\" cy=\"20\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"260\" cy=\"60\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"260\" cy=\"100\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"260\" cy=\"140\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"260\" cy=\"180\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"260\" cy=\"220\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"260\" cy=\"260\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"260\" cy=\"300\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"260\" cy=\"340\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"300\" cy=\"20\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"300\" cy=\"60\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"300\" cy=\"100\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"300\" cy=\"140\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"300\" cy=\"180\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"300\" cy=\"220\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"300\" cy=\"260\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"300\" cy=\"300\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"300\" cy=\"340\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"340\" cy=\"20\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"340\" cy=\"60\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"340\" cy=\"100\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"340\" cy=\"140\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"340\" cy=\"180\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"340\" cy=\"220\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"340\" cy=\"260\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"340\" cy=\"300\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"340\" cy=\"340\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"380\" cy=\"20\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"380\" cy=\"60\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"380\" cy=\"100\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"380\" cy=\"140\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"380\" cy=\"180\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"380\" cy=\"220\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"380\" cy=\"260\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"380\" cy=\"300\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"380\" cy=\"340\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"420\" cy=\"20\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"420\" cy=\"60\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"420\" cy=\"100\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"420\" cy=\"140\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"420\" cy=\"180\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"420\" cy=\"220\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"420\" cy=\"260\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"420\" cy=\"300\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"420\" cy=\"340\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"460\" cy=\"20\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"460\" cy=\"60\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"460\" cy=\"100\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"460\" cy=\"140\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"460\" cy=\"180\" r=\"7\" fill=\"#95e08e\"/><circle cx=\"460\" cy=\"220\" r=\"7\" fill=\"#ff8fab\"/><circle cx=\"460\" cy=\"260\" r=\"7\" fill=\"#ffd166\"/><circle cx=\"460\" cy=\"300\" r=\"7\" fill=\"#7fd0ff\"/><circle cx=\"460\" cy=\"340\" r=\"7\" fill=\"#95e08e\"/></svg>"},{"name":"Pelangi","tags":["Fantasi","Luar Ruangan"],"svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"960\" height=\"720\" viewBox=\"0 0 480 360\"><rect width=\"480\" height=\"360\" fill=\"#bfe6ff\"/><path d=\"M40 300A200 200 0 0 1 440 300\" stroke=\"#ef476f\" stroke-width=\"16\" fill=\"none\"/><path d=\"M54 300A186 186 0 0 1 426 300\" stroke=\"#ff8a3d\" stroke-width=\"16\" fill=\"none\"/><path d=\"M68 300A172 172 0 0 1 412 300\" stroke=\"#ffd23f\" stroke-width=\"16\" fill=\"none\"/><path d=\"M82 300A158 158 0 0 1 398 300\" stroke=\"#4caf50\" stroke-width=\"16\" fill=\"none\"/><path d=\"M96 300A144 144 0 0 1 384 300\" stroke=\"#4aa3ff\" stroke-width=\"16\" fill=\"none\"/><path d=\"M110 300A130 130 0 0 1 370 300\" stroke=\"#8a5cf5\" stroke-width=\"16\" fill=\"none\"/><ellipse cx=\"60\" cy=\"300\" rx=\"70\" ry=\"24\" fill=\"#fff\"/><ellipse cx=\"420\" cy=\"300\" rx=\"70\" ry=\"24\" fill=\"#fff\"/><path d=\"M0 310Q240 260 480 310V360H0Z\" fill=\"#6cc070\"/></svg>"}]};

(function initAssetsPanel() {

  const spriteListEl   = document.getElementById("sprite-list");
  const addSpriteBtn   = document.getElementById("add-sprite-btn");
  const addBackdropBtn = document.getElementById("add-backdrop-btn");
  const backdropPrev   = document.getElementById("backdrop-preview");
  const backdropNameEl = document.getElementById("backdrop-name");

  if (!spriteListEl || !addSpriteBtn) return;

  // ---------- DATA ----------
  const SPRITES = [
    {
      id: "cat", name: "Kucing", tags: ["Hewan"], isCat: true,
      costumes: [{ name: "costume1" }, { name: "costume2" }, { name: "costume3" }]
    },
    ...ASSET_LIBRARY.sprites
  ];

  // Huruf A-Z dan angka 0-9 dibuat otomatis
  function letterSvg(ch) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100">' +
      '<text x="50" y="77" text-anchor="middle" font-family="Arial Black, Impact, Arial, sans-serif" ' +
      'font-weight="900" font-size="84" fill="#ff9a00" stroke="#1b1b1b" stroke-width="5" ' +
      'paint-order="stroke" stroke-linejoin="round">' + ch + '</text></svg>';
  }
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("").forEach(ch => {
    const isNum = /[0-9]/.test(ch);
    SPRITES.push({
      id: "ch-" + ch,
      name: (isNum ? "Angka " : "Huruf ") + ch,
      tags: ["Huruf"],
      costumes: [{ name: "huruf-" + ch, svg: letterSvg(ch) }]
    });
  });

  const BUILTIN_BACKDROPS = [
    { name: "backdrop1", label: "Putih",  tags: ["Pola"],          css: "#ffffff" },
    { name: "backdrop2", label: "Alam",   tags: ["Luar Ruangan"],  css: "linear-gradient(#dff4ff 72%, #b8e986 72%)" },
    { name: "backdrop3", label: "Malam",  tags: ["Luar Ruangan"],  css: "linear-gradient(#0b1d4a, #26326e)" }
  ];
  const BACKDROPS = [
    ...BUILTIN_BACKDROPS,
    ...ASSET_LIBRARY.backdrops.map(b => ({ name: b.name, label: b.name, tags: b.tags, svg: b.svg }))
  ];

  const SPRITE_CATS   = ["Semua", "Hewan", "Orang", "Fantasi", "Musik", "Olahraga", "Makanan", "Alam", "Benda", "Huruf"];
  const BACKDROP_CATS = ["Semua", "Luar Ruangan", "Dalam Ruangan", "Luar Angkasa", "Bawah Air", "Fantasi", "Olahraga", "Musik", "Pola"];

  let currentSprite = SPRITES[0];

  // ---------- HELPER ----------
  function drawCatThumb(canvasEl, costume) {
    const c = canvasEl.getContext("2d");
    const old = state.sprite.costume;
    state.sprite.costume = costume;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvasEl.width, canvasEl.height);
    c.translate(canvasEl.width / 2, canvasEl.height / 2 + 4);
    c.scale(canvasEl.width / 100 * 1.7, canvasEl.width / 100 * 1.7);
    try { drawCat(c, true); } catch (e) {}
    state.sprite.costume = old;
  }

  function thumbFor(entry, size) {
    if (entry.isCat) {
      const cv = document.createElement("canvas");
      cv.width = size * 2; cv.height = size * 2;
      cv.style.width = size + "px"; cv.style.height = size + "px";
      drawCatThumb(cv, entry.costumes[0].name);
      return cv;
    }
    const img = document.createElement("img");
    img.src = svgDataUri(entry.costumes[0].svg);
    img.alt = entry.name;
    img.style.width = size + "px"; img.style.height = size + "px";
    return img;
  }

  function refreshAssetBlockOptions() {
    if (typeof blockDefinitions === "undefined") return;
    blockDefinitions.forEach(d => {
      if (d.type === "switch_costume") {
        d.options = COSTUME_DEFINITIONS.map(c => ({ label: c.name, value: c.name }));
      }
      if (d.type === "switch_backdrop" || d.type === "when_backdrop_switches") {
        d.options = BACKDROP_DEFINITIONS.map(b => ({ label: b.name, value: b.name }));
      }
    });
  }

  function redraw() { if (typeof renderStage === "function") renderStage(); }

  // ---------- PANEL SPRITE ----------
  function currentCostumeDef() {
    return COSTUME_DEFINITIONS.find(c => c.name === state.sprite.costume) || COSTUME_DEFINITIONS[0];
  }

  function renderSpriteList() {
    spriteListEl.innerHTML = "";

    if (!state.sprite.deleted) {
      const item = document.createElement("div");
      item.className = "sprite-item selected";

      const def = currentCostumeDef();
      if (currentSprite.isCat || !def || !def.svg) {
        const cv = document.createElement("canvas");
        cv.width = 88; cv.height = 88;
        item.appendChild(cv);
        drawCatThumb(cv, state.sprite.costume);
      } else {
        const img = document.createElement("img");
        img.src = svgDataUri(def.svg);
        item.appendChild(img);
      }

      const label = document.createElement("div");
      label.className = "sprite-label";
      label.textContent = state.sprite.name;
      item.appendChild(label);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "sprite-del";
      del.title = "Hapus sprite";
      del.textContent = "🗑";
      del.addEventListener("click", (e) => { e.stopPropagation(); deleteSprite(); });
      item.appendChild(del);

      spriteListEl.appendChild(item);
    } else {
      const empty = document.createElement("div");
      empty.className = "sprite-empty";
      empty.textContent = "Belum ada sprite. Klik tombol 🐱＋ untuk memilih.";
      spriteListEl.appendChild(empty);
    }

    const input = document.querySelector(".sprite-controls input[type='text']");
    if (input) input.value = state.sprite.deleted ? "" : state.sprite.name;
  }

  function renderBackdropPanel() {
    const cur = BACKDROPS.find(b => b.name === state.backdrop.current) || BACKDROPS[0];
    backdropPrev.style.background = cur.svg ? "" : cur.css;
    backdropPrev.innerHTML = "";
    if (cur.svg) {
      const img = document.createElement("img");
      img.src = svgDataUri(cur.svg);
      backdropPrev.appendChild(img);
    }
    backdropNameEl.textContent = cur.label;
  }

  // ---------- AKSI ----------
  function deleteSprite() {
    state.sprite.deleted = true;
    state.sprite.visible = false;
    state.sprite.sayText = "";
    renderSpriteList();
    redraw();
  }

  function addSprite(entry) {
    currentSprite = entry;

    COSTUME_DEFINITIONS.length = 0;
    entry.costumes.forEach(c => COSTUME_DEFINITIONS.push({
      name: c.name, color: "#FFAB19", detail: "none", svg: c.svg
    }));
    costumeList.length = 0;
    COSTUME_DEFINITIONS.forEach(c => costumeList.push(c.name));
    refreshAssetBlockOptions();

    state.sprite.deleted = false;
    state.sprite.visible = true;
    state.sprite.costume = costumeList[0];
    state.sprite.name = entry.name;
    state.sprite.x = 0;
    state.sprite.y = 0;
    state.sprite.direction = 90;
    state.sprite.size = 100;
    state.sprite.sayText = "";
    lastCostume = state.sprite.costume;

    renderSpriteList();
    redraw();
  }

  function chooseBackdrop(entry) {
    if (!BACKDROP_DEFINITIONS.some(b => b.name === entry.name)) {
      BACKDROP_DEFINITIONS.push({ name: entry.name, type: entry.svg ? "custom" : "plain", svg: entry.svg });
      backdropList.push(entry.name);
      refreshAssetBlockOptions();
    }
    state.backdrop.current = entry.name;
    lastBackdrop = entry.name;
    renderBackdropPanel();
    redraw();
  }

  // ---------- JENDELA PILIHAN (ala Scratch) ----------
  const picker = document.createElement("div");
  picker.className = "picker picker-hidden";
  picker.innerHTML =
    '<div class="picker-head">' +
      '<button type="button" class="picker-back">← Kembali</button>' +
      '<div class="picker-title"></div><div class="picker-spacer"></div>' +
    '</div>' +
    '<div class="picker-filter">' +
      '<div class="picker-search"><span>🔍</span><input type="text" placeholder="Cari"></div>' +
      '<div class="picker-cats"></div>' +
    '</div>' +
    '<div class="picker-grid"></div>';
  document.body.appendChild(picker);

  const pickTitle  = picker.querySelector(".picker-title");
  const pickSearch = picker.querySelector(".picker-search input");
  const pickCats   = picker.querySelector(".picker-cats");
  const pickGrid   = picker.querySelector(".picker-grid");
  let pickKind = "sprite", pickCat = "Semua";

  function renderPicker() {
    const q = pickSearch.value.trim().toLowerCase();
    const items = pickKind === "sprite" ? SPRITES : BACKDROPS;
    pickGrid.innerHTML = "";

    const shown = items.filter(it => {
      const label = (it.label || it.name).toLowerCase();
      const okCat = pickCat === "Semua" || (it.tags || []).includes(pickCat);
      return okCat && (!q || label.includes(q));
    });

    if (!shown.length) {
      pickGrid.innerHTML = '<div class="picker-none">Tidak ada hasil.</div>';
      return;
    }

    shown.forEach(it => {
      const card = document.createElement("div");
      card.className = "picker-card";

      const box = document.createElement("div");
      box.className = "picker-thumb";
      if (pickKind === "sprite") {
        box.appendChild(thumbFor(it, 100));
      } else if (it.svg) {
        const img = document.createElement("img");
        img.src = svgDataUri(it.svg);
        img.className = "bd";
        box.appendChild(img);
      } else {
        const d = document.createElement("div");
        d.className = "bd";
        d.style.background = it.css;
        box.appendChild(d);
      }
      card.appendChild(box);

      const name = document.createElement("div");
      name.className = "picker-name";
      name.textContent = it.label || it.name;
      card.appendChild(name);

      card.addEventListener("click", () => {
        if (pickKind === "sprite") addSprite(it); else chooseBackdrop(it);
        closePicker();
      });
      pickGrid.appendChild(card);
    });
  }

  function renderCats() {
    const cats = pickKind === "sprite" ? SPRITE_CATS : BACKDROP_CATS;
    pickCats.innerHTML = "";
    cats.forEach(c => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "picker-pill" + (c === pickCat ? " active" : "");
      b.textContent = c;
      b.addEventListener("click", () => { pickCat = c; renderCats(); renderPicker(); });
      pickCats.appendChild(b);
    });
  }

  function openPicker(kind) {
    pickKind = kind;
    pickCat = "Semua";
    pickSearch.value = "";
    pickTitle.textContent = kind === "sprite" ? "Pilih Sprite" : "Pilih Backdrop";
    renderCats();
    renderPicker();
    picker.classList.remove("picker-hidden");
    pickGrid.scrollTop = 0;
    pickSearch.focus();
  }

  function closePicker() { picker.classList.add("picker-hidden"); }

  picker.querySelector(".picker-back").addEventListener("click", closePicker);
  pickSearch.addEventListener("input", renderPicker);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !picker.classList.contains("picker-hidden")) closePicker();
  });

  addSpriteBtn.addEventListener("click", () => openPicker("sprite"));
  addBackdropBtn.addEventListener("click", () => openPicker("backdrop"));

  // ---------- SINKRON (blok switch costume/backdrop) ----------
  var lastCostume = state.sprite.costume;
  var lastBackdrop = state.backdrop.current;
  setInterval(() => {
    if (state.sprite.costume !== lastCostume) {
      lastCostume = state.sprite.costume;
      if (!state.sprite.deleted) renderSpriteList();
    }
    if (state.backdrop.current !== lastBackdrop) {
      lastBackdrop = state.backdrop.current;
      renderBackdropPanel();
    }
  }, 250);

  renderSpriteList();
  renderBackdropPanel();
})();


// ============================================================
// MISI LEVEL, CEK OTOMATIS, DAN KOIN
// ============================================================

(function initMission() {

  // ---------- PENGATURAN KOIN ----------
  const POINTS_BASE  = 30;   // koin dasar setiap level selesai
  const POINTS_BONUS = 10;   // bonus jika selesai di percobaan pertama

  // ---------- DATA MISI ----------
  // Tiap level: judul, tantangan, petunjuk, dan daftar syarat (goals) untuk cek otomatis.
  // Level tanpa goals sementara memakai tombol "Tandai selesai".
  const MOTION = ["move_steps","turn_right","turn_left","goto_random","goto_xy","glide_random","glide_xy",
    "point_direction","point_towards","change_x","set_x","change_y","set_y","if_edge","set_rotation_style"];
  const LOOKS = ["say_for_secs","say","think_for_secs","think","switch_costume","next_costume","change_size",
    "set_size","show","hide","change_graphic_effect","set_graphic_effect","clear_graphic_effects",
    "go_to_front","go_back_layers","switch_backdrop","next_backdrop"];
  const SOUND = ["start_sound","play_sound_until_done"];

  // ---- helper analisis blok ----
  function flatBlocks(blocks, out) {
    out = out || [];
    (blocks || []).forEach(b => { out.push(b); (b.branches || []).forEach(br => flatBlocks(br, out)); });
    return out;
  }
  function stacksInfo() {
    return state.stacks
      .filter(s => s && s.blocks && s.blocks.length)
      .map(s => {
        const all = flatBlocks(s.blocks);
        return { hat: s.blocks[0].type, blocks: all, types: all.map(b => b.type) };
      });
  }
  const hasAny = (info, list) => info.types.some(t => list.includes(t));
  const flagStacks = () => stacksInfo().filter(i => i.hat === "when_flag_clicked");
  const someFlag = (fn) => flagStacks().some(fn);
  function textSequence(info) {
    const seq = [];
    info.types.forEach(t => {
      const c = t.startsWith("say") ? "S" : t.startsWith("think") ? "T" : null;
      if (c && seq[seq.length - 1] !== c) seq.push(c);
    });
    return seq;
  }

  const MISSIONS = {
    sd: {
      1: { title: "Halo Coding!", challenge: "Buat karakter menyapa saat bendera hijau diklik.",
        hint: "Ambil \"when 🚩 clicked\" dari Events, lalu \"say\" dari Looks, dan sambungkan di bawahnya.",
        goals: [
          { text: "Pakai blok \"when 🚩 clicked\"", test: () => flagStacks().length > 0 },
          { text: "Sambungkan blok \"say\" di bawahnya", test: () => someFlag(i => hasAny(i, ["say","say_for_secs"])) }
        ] },
      2: { title: "Karakter Bergerak", challenge: "Gerakkan karakter 10 langkah dan ubah arahnya.",
        hint: "Pakai \"move 10 steps\" dari Motion, lalu tambahkan \"turn\" untuk mengubah arah.",
        goals: [
          { text: "Pakai blok \"when 🚩 clicked\"", test: () => flagStacks().length > 0 },
          { text: "Pakai \"move 10 steps\" (isi angkanya 10)", test: () => someFlag(i => i.blocks.some(b => b.type === "move_steps" && Number(getBlockInputValue(b)) === 10)) },
          { text: "Ubah arah dengan \"turn\" atau \"point in direction\"", test: () => someFlag(i => hasAny(i, ["turn_right","turn_left","point_direction"])) }
        ] },
      3: { title: "Cerita Interaktif", challenge: "Buat karakter berbicara dan berpikir bergantian.",
        hint: "Susun say → think → say (atau think → say → think) dalam satu rangkaian.",
        goals: [
          { text: "Pakai blok \"when 🚩 clicked\"", test: () => flagStacks().length > 0 },
          { text: "Ada blok \"say\"", test: () => someFlag(i => hasAny(i, ["say","say_for_secs"])) },
          { text: "Ada blok \"think\"", test: () => someFlag(i => hasAny(i, ["think","think_for_secs"])) },
          { text: "Susun bergantian (say, think, say atau sebaliknya)", test: () => someFlag(i => textSequence(i).length >= 3) }
        ] },
      4: { title: "Suara Seru", challenge: "Tambahkan suara ketika karakter melakukan aksi.",
        hint: "Pasang blok dari Sound (misalnya \"start sound\") di rangkaian yang sama dengan blok gerak atau say.",
        goals: [
          { text: "Pakai blok \"when 🚩 clicked\"", test: () => flagStacks().length > 0 },
          { text: "Ada blok aksi (Motion atau Looks)", test: () => someFlag(i => hasAny(i, MOTION) || hasAny(i, LOOKS)) },
          { text: "Ada blok Sound di rangkaian yang sama", test: () => someFlag(i => (hasAny(i, MOTION) || hasAny(i, LOOKS)) && hasAny(i, SOUND)) }
        ] },
      5: { title: "Game Mini", challenge: "Buat game sederhana yang bisa dimainkan.",
        hint: "Pakai \"when key pressed\" atau \"when this sprite clicked\", lalu tambahkan blok gerak dan blok Looks.",
        goals: [
          { text: "Pakai blok event pemain (\"when key pressed\" atau \"when this sprite clicked\")", test: () => stacksInfo().some(i => ["when_key_pressed","when_sprite_clicked"].includes(i.hat)) },
          { text: "Event itu menggerakkan karakter (blok Motion)", test: () => stacksInfo().some(i => ["when_key_pressed","when_sprite_clicked"].includes(i.hat) && hasAny(i, MOTION)) },
          { text: "Ada blok Looks (say, think, ganti costume, dll.)", test: () => stacksInfo().some(i => hasAny(i, LOOKS)) }
        ] }
    },
    smp: {
      1: { title: "Event & Input", challenge: "Buat karakter bergerak menggunakan tombol panah." },
      2: { title: "Variabel Skor", challenge: "Buat skor yang bertambah saat pemain mendapat koin." },
      3: { title: "Percabangan", challenge: "Jika skor mencapai 5, tampilkan pesan kemenangan." },
      4: { title: "Perulangan", challenge: "Buat objek bergerak berulang tanpa menulis blok berkali-kali." },
      5: { title: "Game dengan Skor", challenge: "Buat game dengan skor, kondisi menang, dan tombol mulai." }
    },
    smak: {
      1: { title: "Algoritma", challenge: "Susun alur program dari input sampai output." },
      2: { title: "Kondisi & Operator", challenge: "Buat program yang memberikan output sesuai kondisi." },
      3: { title: "Looping", challenge: "Buat proses yang berjalan berulang sampai kondisi terpenuhi." },
      4: { title: "Variabel & Data", challenge: "Gunakan variabel untuk menyimpan dan menghitung data." },
      5: { title: "Project Akhir", challenge: "Buat game atau simulasi dengan beberapa fitur coding." }
    }
  };
  const GRADE_NAME = { sd: "SD", smp: "SMP", smak: "SMA/SMK" };

  // ---------- SYARAT CEK OTOMATIS: TASK JALUR BELAJAR (Tahap 1 • Pembelajaran 1) ----------
  // Judul, deskripsi, dan petunjuk tiap task ada di jalur-belajar.js. Di sini hanya syarat bloknya.
  const BACKDROP_BLOCKS = ["switch_backdrop", "next_backdrop"];
  const TEXT_BLOCKS = ["say", "say_for_secs", "think", "think_for_secs"];
  const countText = (i) => i.types.filter(t => TEXT_BLOCKS.includes(t)).length;
  const G_FLAG = { text: "Pakai blok \"when 🚩 clicked\"", test: () => flagStacks().length > 0 };
  // ---- pembantu untuk syarat task Tahap 1 (p2–p5) dan Tahap 2 Game (g1) ----
  const inside = (b) => { const o = []; (b.branches || []).forEach(br => flatBlocks(br, o)); return o; };
  const inVals = (b) => (b && b.element ? getOwnInputs(b.element).map(x => x.value) : []);
  const num = (b) => Number(getBlockInputValue(b));
  const ddVal = (b) => { const d = b && b.element ? getOwnDropdown(b.element) : null; return d ? d.dataset.value : null; };
  function reporterTypes(b) {                       // semua reporter/kondisi yang dipasang di slot milik blok b (rekursif)
    const out = [];
    const walk = (el) => getOwnInputs(el).forEach(inp => { const r = inp._reporterData; if (r) { out.push(r.type); if (r.element) walk(r.element); } });
    if (b && b.element) walk(b.element);
    return out;
  }
  const LOOPS = ["repeat", "forever", "repeat_until"];
  const IFS = ["if", "if_else"];
  const CMP = ["op_gt", "op_lt", "op_eq"];
  const SENSE_COND = ["key_pressed", "touching", "touching_color", "color_touching_color", "mouse_down"];
  const COLOR_FX = ["change_graphic_effect", "set_graphic_effect"];
  const SIZE_FX = ["change_size", "set_size"];
  const SAY = ["say", "say_for_secs", "think", "think_for_secs"];
  const hatStacks = (hat) => stacksInfo().filter(i => i.hat === hat);
  const keyStacks = () => hatStacks("when_key_pressed");
  const clickStacks = () => hatStacks("when_sprite_clicked");
  const recvStacks = () => hatStacks("when_receive");
  const distinctKeys = (list) => new Set(list.map(i => ddVal(i.blocks[0]))).size;
  const loopsOf = (i) => i.blocks.filter(b => LOOPS.includes(b.type));
  const loopHas = (i, fn) => loopsOf(i).some(l => fn(inside(l)));
  const anyOf = (arr, list) => arr.some(b => list.includes(b.type));
  const sendsMsg = (i) => i.blocks.filter(b => b.type === "broadcast" || b.type === "broadcast_wait").map(ddVal);
  const receivedFromFlag = (fn) => {                // ada broadcast di bendera, dan rangkaian "when I receive" pesan yang sama memenuhi fn
    const sent = new Set(); flagStacks().forEach(i => sendsMsg(i).forEach(m => sent.add(m)));
    return recvStacks().some(r => sent.has(ddVal(r.blocks[0])) && fn(r));
  };
  const G_RUN_FLAG = G_FLAG;
  const EDITOR_GOALS = {
    "p1-t1": [G_FLAG,
      { text: "Sambungkan blok \"move 10 steps\" di bawahnya", test: () => someFlag(i => i.types.includes("move_steps")) }],
    "p1-t2": [G_FLAG,
      { text: "Pakai blok \"switch backdrop\" atau \"next backdrop\"", test: () => someFlag(i => hasAny(i, BACKDROP_BLOCKS)) }],
    "p1-t3": [G_FLAG,
      { text: "Pakai 2 blok bicara atau lebih (say / think)", test: () => someFlag(i => countText(i) >= 2) }],
    "p1-t4": [G_FLAG,
      { text: "Ada blok aksi (Motion atau Looks)", test: () => someFlag(i => hasAny(i, MOTION) || hasAny(i, LOOKS)) },
      { text: "Ada blok Sound di rangkaian yang sama", test: () => someFlag(i => (hasAny(i, MOTION) || hasAny(i, LOOKS)) && hasAny(i, SOUND)) }],
    "p1-t5": [G_FLAG,
      { text: "Ada blok gerak (Motion)", test: () => someFlag(i => hasAny(i, MOTION)) },
      { text: "Ada blok ganti latar", test: () => someFlag(i => hasAny(i, BACKDROP_BLOCKS)) },
      { text: "Ada blok bicara (say / think)", test: () => someFlag(i => countText(i) >= 1) },
      { text: "Ada blok suara (Sound)", test: () => someFlag(i => hasAny(i, SOUND)) },
      { text: "Semuanya digabung dalam satu rangkaian", test: () => someFlag(i => hasAny(i, MOTION) && hasAny(i, BACKDROP_BLOCKS) && countText(i) >= 1 && hasAny(i, SOUND)) }]
    ,
    // ---------- Tahap 1 • Pembelajaran 2: Seni dari Komputer ----------
    "p2-t1": [G_FLAG,
      { text: "Ada minimal 2 blok color effect", test: () => someFlag(i => i.blocks.filter(b => COLOR_FX.includes(b.type)).length >= 2) },
      { text: "Ada blok \"wait\" di rangkaian yang sama", test: () => someFlag(i => hasAny(i, COLOR_FX) && i.types.includes("wait_secs")) }],
    "p2-t2": [G_FLAG,
      { text: "Ada blok \"turn\" di dalam blok \"repeat\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["turn_right", "turn_left"]))) },
      { text: "Putarannya sampai 360 derajat (ulangan × sudut)", test: () => someFlag(i => loopsOf(i).some(l => l.type === "repeat" && num(l) * inside(l).filter(b => b.type === "turn_right" || b.type === "turn_left").reduce((a, b) => a + Math.abs(num(b) || 0), 0) >= 360)) }],
    "p2-t3": [G_FLAG,
      { text: "Ada blok \"repeat\"", test: () => someFlag(i => loopsOf(i).length > 0) },
      { text: "Di dalam repeat ada blok color effect", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, COLOR_FX))) },
      { text: "Di dalam repeat ada blok \"wait\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["wait_secs"]))) }],
    "p2-t4": [G_FLAG,
      { text: "Ada minimal 3 blok \"glide\"", test: () => someFlag(i => i.blocks.filter(b => b.type === "glide_xy").length >= 3) },
      { text: "Tujuan (x dan y) ketiganya berbeda", test: () => someFlag(i => new Set(i.blocks.filter(b => b.type === "glide_xy").map(b => inVals(b).slice(1, 3).join(","))).size >= 3) }],
    "p2-t5": [G_FLAG,
      { text: "Ada blok ganti latar", test: () => someFlag(i => hasAny(i, BACKDROP_BLOCKS)) },
      { text: "Ada repeat berisi blok Motion", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, MOTION))) },
      { text: "Di dalam repeat juga ada blok color effect atau size", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, COLOR_FX.concat(SIZE_FX)))) },
      { text: "Ada blok bicara (say / think)", test: () => someFlag(i => countText(i) >= 1) }],

    // ---------- Tahap 1 • Pembelajaran 3: Memahat Tanah Liat ----------
    "p3-t1": [G_FLAG,
      { text: "Pakai blok \"when key pressed\"", test: () => keyStacks().length > 0 },
      { text: "Tersambung ke blok Motion", test: () => keyStacks().some(i => hasAny(i, MOTION)) }],
    "p3-t2": [G_FLAG,
      { text: "Ada 4 blok \"when key pressed\"", test: () => keyStacks().length >= 4 },
      { text: "Tombolnya berbeda-beda", test: () => distinctKeys(keyStacks()) >= 4 },
      { text: "Masing-masing tersambung ke blok Motion", test: () => keyStacks().filter(i => hasAny(i, MOTION)).length >= 4 }],
    "p3-t3": [G_FLAG,
      { text: "Pakai blok \"when this sprite clicked\"", test: () => clickStacks().length > 0 },
      { text: "Tersambung ke minimal 2 blok Looks", test: () => clickStacks().some(i => i.blocks.filter(b => LOOKS.includes(b.type)).length >= 2) }],
    "p3-t4": [G_FLAG,
      { text: "Satu tombol membesarkan karakter (angka positif)", test: () => keyStacks().some(i => i.blocks.some(b => b.type === "change_size" && num(b) > 0)) },
      { text: "Tombol lain mengecilkan karakter (angka negatif)", test: () => keyStacks().some(i => i.blocks.some(b => b.type === "change_size" && num(b) < 0)) },
      { text: "Kedua tombolnya berbeda", test: () => { const k = keyStacks(); const up = new Set(k.filter(i => i.blocks.some(b => b.type === "change_size" && num(b) > 0)).map(i => ddVal(i.blocks[0]))); const dn = new Set(k.filter(i => i.blocks.some(b => b.type === "change_size" && num(b) < 0)).map(i => ddVal(i.blocks[0]))); return [...up].some(a => [...dn].some(b => a !== b)); } }],
    "p3-t5": [G_FLAG,
      { text: "Ada 2 tombol berbeda yang menggerakkan karakter", test: () => distinctKeys(keyStacks().filter(i => hasAny(i, MOTION))) >= 2 },
      { text: "Ada klik sprite yang mengubah tampilan (Looks)", test: () => clickStacks().some(i => hasAny(i, LOOKS)) },
      { text: "Ada blok Sound di salah satu rangkaian", test: () => keyStacks().concat(clickStacks()).some(i => hasAny(i, SOUND)) }],

    // ---------- Tahap 1 • Pembelajaran 4: Mendesain Rumah ----------
    "p4-t1": [G_FLAG,
      { text: "Ada blok \"set variable\" di bawah bendera", test: () => someFlag(i => i.types.includes("set_var")) },
      { text: "Nilainya ditampilkan (show variable, atau variabel di dalam say)", test: () => someFlag(i => i.types.includes("show_var") || i.blocks.some(b => SAY.includes(b.type) && reporterTypes(b).includes("var_reporter"))) }],
    "p4-t2": [G_FLAG,
      { text: "Ada blok \"set variable\"", test: () => someFlag(i => i.types.includes("set_var")) },
      { text: "Ada repeat berisi \"change variable\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["change_var"]))) },
      { text: "Hasilnya diucapkan dengan say (blok variabel di dalam say)", test: () => someFlag(i => i.blocks.some(b => SAY.includes(b.type) && reporterTypes(b).includes("var_reporter"))) }],
    "p4-t3": [G_FLAG,
      { text: "Ada blok \"if\" di dalam repeat", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, IFS))) },
      { text: "Syaratnya dari Sensing (misalnya key pressed?)", test: () => someFlag(i => loopsOf(i).some(l => inside(l).some(b => IFS.includes(b.type) && reporterTypes(b).some(t => SENSE_COND.includes(t))))) },
      { text: "Di dalam if ada blok Motion atau Looks", test: () => someFlag(i => loopsOf(i).some(l => inside(l).some(b => IFS.includes(b.type) && (anyOf(inside(b), MOTION) || anyOf(inside(b), LOOKS))))) }],
    "p4-t4": [G_FLAG,
      { text: "Ada blok \"if-else\"", test: () => stacksInfo().some(i => i.types.includes("if_else")) },
      { text: "Syaratnya perbandingan (>, <, atau =)", test: () => stacksInfo().some(i => i.blocks.some(b => b.type === "if_else" && reporterTypes(b).some(t => CMP.includes(t)))) },
      { text: "Kedua jalurnya berisi blok", test: () => stacksInfo().some(i => i.blocks.some(b => b.type === "if_else" && (b.branches || []).length >= 2 && b.branches[0].length > 0 && b.branches[1].length > 0)) },
      { text: "Salah satunya mengganti latar", test: () => stacksInfo().some(i => i.blocks.some(b => b.type === "if_else" && anyOf(inside(b), BACKDROP_BLOCKS))) }],
    "p4-t5": [G_FLAG,
      { text: "Ada blok \"set variable\"", test: () => someFlag(i => i.types.includes("set_var")) },
      { text: "Ada repeat berisi \"change variable\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["change_var"]))) },
      { text: "Ada if yang membandingkan variabel", test: () => someFlag(i => i.blocks.some(b => IFS.includes(b.type) && reporterTypes(b).some(t => CMP.includes(t)) && reporterTypes(b).includes("var_reporter"))) },
      { text: "Ada blok bicara (say / think)", test: () => someFlag(i => countText(i) >= 1) }],

    // ---------- Tahap 1 • Pembelajaran 5: Animasi ala Peppa Pig ----------
    "p5-t1": [G_FLAG,
      { text: "Ada blok \"broadcast\" di bawah bendera", test: () => someFlag(i => sendsMsg(i).length > 0) },
      { text: "Ada \"when I receive\" dengan pesan yang sama", test: () => receivedFromFlag(() => true) },
      { text: "Rangkaian itu berisi say atau think", test: () => receivedFromFlag(r => countText(r) >= 1) }],
    "p5-t2": [G_FLAG,
      { text: "Ada blok \"broadcast\" di bawah bendera", test: () => someFlag(i => sendsMsg(i).length > 0) },
      { text: "\"when I receive\" berisi ganti latar", test: () => receivedFromFlag(r => hasAny(r, BACKDROP_BLOCKS)) },
      { text: "Ada say for seconds atau wait", test: () => receivedFromFlag(r => r.types.includes("say_for_secs") || r.types.includes("wait_secs")) }],
    "p5-t3": [G_FLAG,
      { text: "Ada blok \"ask and wait\"", test: () => someFlag(i => i.types.includes("ask_wait")) },
      { text: "Ada say yang memakai \"join\"", test: () => someFlag(i => i.blocks.some(b => SAY.includes(b.type) && reporterTypes(b).includes("op_join"))) },
      { text: "Di dalam join ada blok \"answer\"", test: () => someFlag(i => i.blocks.some(b => SAY.includes(b.type) && reporterTypes(b).includes("op_join") && reporterTypes(b).includes("answer"))) }],
    "p5-t4": [G_FLAG,
      { text: "Ada blok \"broadcast\" di bawah bendera", test: () => someFlag(i => sendsMsg(i).length > 0) },
      { text: "\"when I receive\" berisi repeat dengan blok Motion", test: () => receivedFromFlag(r => loopHas(r, ins => anyOf(ins, MOTION))) },
      { text: "Ada blok Sound", test: () => receivedFromFlag(r => hasAny(r, SOUND)) }],
    "p5-t5": [G_FLAG,
      { text: "Ada 2 pesan berbeda yang diterima 2 rangkaian \"when I receive\"", test: () => new Set(recvStacks().map(r => ddVal(r.blocks[0]))).size >= 2 },
      { text: "Ada ganti latar", test: () => recvStacks().some(r => hasAny(r, BACKDROP_BLOCKS)) },
      { text: "Ada blok bicara (say / think)", test: () => recvStacks().some(r => countText(r) >= 1) },
      { text: "Ada blok Sound", test: () => recvStacks().some(r => hasAny(r, SOUND)) },
      { text: "Ada repeat", test: () => recvStacks().some(r => loopsOf(r).length > 0) }],

    // ---------- Tahap 2 • Game Development ----------
    "g1-t1": [G_FLAG,
      { text: "Ada blok \"repeat\" di bawah bendera", test: () => someFlag(i => loopsOf(i).length > 0) },
      { text: "Di dalam repeat ada \"next costume\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["next_costume"]))) },
      { text: "Di dalam repeat ada \"move\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["move_steps"]))) },
      { text: "Di dalam repeat ada \"wait\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["wait_secs"]))) }],
    "g1-t2": [G_FLAG,
      { text: "Ada 4 tombol berbeda yang menggerakkan karakter", test: () => distinctKeys(keyStacks().filter(i => hasAny(i, MOTION))) >= 4 },
      { text: "Ada tombol lompat (naik, wait, lalu turun)", test: () => keyStacks().some(i => { const t = i.blocks; const up = t.findIndex(b => b.type === "change_y" && num(b) > 0); if (up < 0) return false; const w = t.findIndex((b, k) => k > up && b.type === "wait_secs"); if (w < 0) return false; return t.some((b, k) => k > w && b.type === "change_y" && num(b) < 0); }) }],
    "g1-t3": [G_FLAG,
      { text: "Skor diisi 0 saat bendera diklik (set variable)", test: () => someFlag(i => i.types.includes("set_var")) },
      { text: "Skor ditampilkan (show variable)", test: () => someFlag(i => i.types.includes("show_var")) },
      { text: "Saat sprite diklik, skor bertambah (change variable)", test: () => clickStacks().some(i => i.types.includes("change_var")) },
      { text: "Sprite pindah ke posisi acak (go to random position)", test: () => clickStacks().some(i => i.types.includes("goto_random")) }],
    "g1-t4": [G_FLAG,
      { text: "Waktu diisi di awal (set variable)", test: () => someFlag(i => i.types.includes("set_var")) },
      { text: "Di dalam repeat ada \"wait\"", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["wait_secs"]))) },
      { text: "Di dalam repeat waktu berkurang (change variable angka negatif)", test: () => someFlag(i => loopHas(i, ins => ins.some(b => b.type === "change_var" && num(b) < 0))) },
      { text: "Setelah repeat ada say atau stop", test: () => someFlag(i => loopsOf(i).some(l => { const idx = i.blocks.indexOf(l); return anyOf(i.blocks.slice(idx + 1 + inside(l).length), SAY.concat(["stop"])); })) }],
    "g1-t5": [G_FLAG,
      { text: "Ada variabel skor dan waktu (2 blok set variable)", test: () => someFlag(i => i.blocks.filter(b => b.type === "set_var").length >= 2) },
      { text: "Waktu berkurang di dalam repeat dengan wait", test: () => someFlag(i => loopHas(i, ins => anyOf(ins, ["wait_secs"]) && ins.some(b => b.type === "change_var" && num(b) < 0))) },
      { text: "Klik sprite menambah skor dan pindah posisi acak", test: () => clickStacks().some(i => i.types.includes("change_var") && i.types.includes("goto_random")) },
      { text: "Ada if / if-else yang membandingkan skor, lalu say", test: () => someFlag(i => i.blocks.some(b => IFS.includes(b.type) && reporterTypes(b).some(t => CMP.includes(t)) && anyOf(inside(b), SAY))) }],
    "g1-t6": [G_FLAG,
      { text: "Ada blok ganti latar", test: () => someFlag(i => hasAny(i, BACKDROP_BLOCKS)) },
      { text: "Ada blok ganti kostum", test: () => someFlag(i => hasAny(i, ["switch_costume", "next_costume"])) },
      { text: "Ada blok ukuran (set size / change size)", test: () => someFlag(i => hasAny(i, SIZE_FX)) },
      { text: "Ada blok \"wait\"", test: () => someFlag(i => i.types.includes("wait_secs")) }]
  };

  // ---------- PARAMETER URL ----------
  // ?task=p1-t1        → task dari Jalur Belajar (baru)
  // ?grade=sd&level=1  → level lama (tetap berfungsi)
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get("task");
  const hasLP = typeof LP !== "undefined";
  const grade = params.get("grade");
  const level = parseInt(params.get("level"), 10);
  let mission = MISSIONS[grade] && MISSIONS[grade][level];
  let levelKey, tag, nameLine, doneTitle, nextLabel, nextHref, backHref, backLabel, hasNext, pointsBase, pointsBonus;

  if (taskId && hasLP) {
    const info = LP.find(taskId);
    if (!info || !EDITOR_GOALS[taskId]) return;
    if (!LP.isUnlocked(taskId)) {               // task belum terbuka → balik ke jalur belajar
      window.location.replace("/SD/belajar.html?task=" + taskId);   // halaman belajar menampilkan info "Masih terkunci"
      return;
    }
    const nxt = LP.next(taskId);
    mission = { title: info.task.title, challenge: info.task.desc, hint: info.task.hint, goals: EDITOR_GOALS[taskId] };
    levelKey = taskId;
    if (LP.mulaiTask) LP.mulaiTask(taskId);   // mulai hitung waktu pengerjaan
    tag = "🎯 TASK " + info.task.no + " • " + info.task.label;
    nameLine = "Task " + info.task.no + " — " + info.task.title;
    doneTitle = "Hore, berhasil!";
    hasNext = !!nxt;
    nextLabel = nxt && nxt.type === "project" ? "Lanjut ke Project Akhir 🏆" : "Task berikutnya →";
    nextHref = nxt ? LP.href(nxt.id, true) : null;
    backHref = "/SD/belajar.html?p=" + info.pemb.id;
    backLabel = "Kembali ke jalur belajar";
    pointsBase = LP.poinOf(info.task);
    pointsBonus = 0;                            // bonus task Jalur Belajar ditentukan server (lihat LP.complete)
  } else {
    if (!mission) return;                       // tanpa parameter = mode bebas
    levelKey = grade + "-" + level;
    tag = "🎯 MISI • " + GRADE_NAME[grade] + " Level " + level;
    nameLine = GRADE_NAME[grade] + " Level " + level + " — " + mission.title;
    doneTitle = "Level selesai!";
    hasNext = !!(MISSIONS[grade] && MISSIONS[grade][level + 1]);
    nextLabel = "Level berikutnya →";
    nextHref = "index.html?grade=" + grade + "&level=" + (level + 1);
    backHref = DASHBOARD_URL;
    backLabel = "Kembali ke dashboard";
    pointsBase = POINTS_BASE;
    pointsBonus = POINTS_BONUS;
  }

  // ---------- PENYIMPANAN (per username) ----------
  const user = localStorage.getItem("username") || localStorage.getItem("scratch_user") || "tamu";
  const progressKey = "codingCompleted_" + user;
  const pointsKey   = "codingPoints_" + user;

  function loadJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  const getCompleted = () => loadJSON(progressKey, {});
  const getPoints    = () => Number(localStorage.getItem(pointsKey)) || 0;

  // ---------- UI KARTU MISI ----------
  const panel = document.querySelector(".workspace-panel");
  if (!panel) return;

  const card = document.createElement("div");
  card.className = "mission-card";
  card.innerHTML =
    '<div class="mission-head">' +
      '<span class="mission-tag"></span>' +
      '<button type="button" class="mission-toggle" title="Ciutkan / buka">−</button>' +
    '</div>' +
    '<div class="mission-body">' +
      '<div class="mission-title"></div>' +
      '<div class="mission-challenge"></div>' +
      '<ul class="mission-goals"></ul>' +
      '<div class="mission-hint"></div>' +
      '<div class="mission-foot"><span class="mission-points"></span><button type="button" class="mission-manual" hidden>Tandai selesai</button></div>' +
    '</div>';
  panel.appendChild(card);

  const q = (s) => card.querySelector(s);
  q(".mission-tag").textContent = tag;
  q(".mission-title").textContent = mission.title;
  q(".mission-challenge").textContent = mission.challenge;
  q(".mission-hint").textContent = mission.hint ? "💡 " + mission.hint : "";
  q(".mission-toggle").addEventListener("click", () => {
    card.classList.toggle("collapsed");
    q(".mission-toggle").textContent = card.classList.contains("collapsed") ? "+" : "−";
  });

  const goals = (mission.goals || []).concat([{ text: "Klik bendera hijau 🚩 untuk menjalankan", test: () => ranOk }]);
  const goalsEl = q(".mission-goals");
  const goalLis = goals.map(g => {
    const li = document.createElement("li");
    li.innerHTML = '<span class="mission-check">☐</span><span></span>';
    li.lastChild.textContent = g.text;
    goalsEl.appendChild(li);
    return li;
  });

  const isLPTask = !!(hasLP && taskId && LP.find(taskId));
  const shownPoints = () => (isLPTask && LP.saldo) ? LP.saldo() : getPoints();   // sama dengan dashboard & halaman koin
  function refreshPoints() { q(".mission-points").textContent = "⭐ " + shownPoints() + " koin"; }
  refreshPoints();
  if (isLPTask && LP.loadFromServer) LP.loadFromServer().then((ok) => { if (ok) refreshPoints(); }).catch(() => {});

  if (taskId) {                                 // link kembali ke jalur belajar
    const back = document.createElement("a");
    back.className = "mission-back";
    back.href = backHref;
    back.textContent = "← Jalur belajar";
    q(".mission-foot").appendChild(back);
  }
  if (getCompleted()[levelKey]) {               // sudah pernah selesai
    const note = document.createElement("div");
    note.className = "mission-done-note";
    note.textContent = "✅ Sudah selesai! Mengulang tidak memberi koin tambahan.";
    q(".mission-body").insertBefore(note, q(".mission-hint"));
  }

  // ---------- STATUS ----------
  let ranOk = false;
  let failedAttempts = 0;
  let finished = false;

  function buildGoalsMet() {
    return (mission.goals || []).every(g => { try { return g.test(); } catch (e) { return false; } });
  }

  function updateChecklist() {
    goals.forEach((g, i) => {
      let ok = false;
      try { ok = !!g.test(); } catch (e) {}
      goalLis[i].classList.toggle("done", ok);
      goalLis[i].firstChild.textContent = ok ? "✅" : "☐";
    });
  }
  setInterval(updateChecklist, 500);
  updateChecklist();

  // Level tanpa cek otomatis: tombol manual
  if (!mission.goals) {
    goalsEl.style.display = "none";
    const note = document.createElement("div");
    note.className = "mission-note";
    note.textContent = "Cek otomatis untuk level ini belum tersedia. Selesaikan tantangannya, lalu tekan \"Tandai selesai\".";
    q(".mission-body").insertBefore(note, q(".mission-hint"));
    const btn = q(".mission-manual");
    btn.hidden = false;
    btn.addEventListener("click", () => completeMission(false));
  }

  // ---------- JALANKAN: hitung percobaan & cek selesai ----------
  // Jumlah percobaan gagal disimpan per task (supaya tetap terhitung setelah halaman dibuka lagi)
  function getAttempts() { return hasLP ? LP.attempts(levelKey) : failedAttempts; }
  function addAttempt()  { return hasLP ? LP.addAttempt(levelKey) : ++failedAttempts; }

  const originalRun = runProgram;
  runProgram = async function () {
    if (finished) return originalRun.apply(this, arguments);

    const metBefore = mission.goals ? buildGoalsMet() : false;
    const alreadyDone = !!getCompleted()[levelKey];
    let attemptNo = 0;
    if (mission.goals && !metBefore && !alreadyDone) attemptNo = addAttempt();

    const result = await originalRun.apply(this, arguments);

    if (mission.goals && metBefore) {
      ranOk = true;
      updateChecklist();
      completeMission(getAttempts() === 0);
    } else if (attemptNo) {
      showFailPopup(attemptNo);
    }
    return result;
  };

  // Popup "Belum berhasil!" — desain sama dengan popup berhasil
  function showFailPopup(n) {
    const old = document.querySelector(".mission-overlay");
    if (old) old.remove();
    const unmet = (mission.goals || []).filter(g => { try { return !g.test(); } catch (e) { return true; } }).slice(0, 3);
    const ov = document.createElement("div");
    ov.className = "mission-overlay";
    ov.innerHTML =
      '<div class="mission-popup fail">' +
        '<div class="mp-emoji">❌</div>' +
        '<h2>Belum berhasil!</h2>' +
        '<p class="mp-info">Ini percobaan ke-' + n + '. Coba periksa lagi blok yang digunakan.</p>' +
        (unmet.length ? '<ul class="mp-unmet"><li>' + unmet.map(g => g.text).join('</li><li>') + '</li></ul>' : '') +
        '<div class="mp-actions"><button type="button" class="mp-primary" data-act="stay">Coba lagi</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => {
      if (e.target === ov || (e.target.dataset && e.target.dataset.act === "stay")) ov.remove();
    });
  }

  // ---------- SELESAI ----------
  async function completeMission(firstTry) {
    if (finished) return;
    finished = true;

    const done = getCompleted();
    const already = !!done[levelKey];
    let earned = 0, bonus = 0;

    if (!already) {
      if (isLPTask) {
        // task Jalur Belajar: lewat LP.complete supaya koin, riwayat, dan database ikut tersimpan (sama seperti editor lain)
        const r = LP.complete(levelKey, !!(firstTry && mission.goals));
        if (r && r.blocked) {                   // gerbang materi: materi belum dibaca sampai selesai
          finished = false;
          alert("📖 Baca materinya sampai selesai dulu ya, baru task ini bisa diselesaikan.");
          return;
        }
        const s = await r.ready;                // koin & bonus dari jawaban server
        earned = s.earned; bonus = s.bonus;
      } else {
        earned = pointsBase;
        bonus = (firstTry && mission.goals) ? pointsBonus : 0;
        done[levelKey] = true;
        localStorage.setItem(progressKey, JSON.stringify(done));
        localStorage.setItem(pointsKey, String(getPoints() + earned + bonus));
      }
    }
    refreshPoints();
    showDonePopup(already, earned, bonus);
  }

  function showDonePopup(already, earned, bonus) {
    const old = document.querySelector(".mission-overlay");     // jangan menumpuk dengan popup lain
    if (old) old.remove();
    const ov = document.createElement("div");
    ov.className = "mission-overlay";

    let lines = "";
    if (already) {
      lines = '<p class="mp-info">Misi ini sudah selesai. Kamu boleh mencoba lagi, tetapi koin tidak bertambah.</p>';
    } else {
      lines = '<div class="mp-points"><b>+' + earned + '</b> koin</div>';
      if (bonus) lines += '<div class="mp-bonus">⚡ Bonus percobaan pertama +' + bonus + '</div>';
      lines += '<p class="mp-info">Koinmu sekarang: <b>⭐ ' + shownPoints() + '</b></p>';
    }

    ov.innerHTML =
      '<div class="mission-popup">' +
        '<div class="mp-emoji">' + (already ? "✅" : "🎉") + '</div>' +
        '<h2>' + (already ? "Sudah selesai!" : doneTitle) + '</h2>' +
        '<p class="mp-name">' + nameLine + '</p>' +
        lines +
        '<div class="mp-actions">' +
          (hasNext
            ? '<button type="button" class="mp-primary" data-act="next">' + nextLabel + '</button>'
            : '<div class="mp-all">🏆 Semua level tingkat ' + GRADE_NAME[grade] + ' selesai!</div>') +
          '<button type="button" class="mp-secondary" data-act="dash">' + backLabel + '</button>' +
          '<button type="button" class="mp-link" data-act="stay">Lanjut bereksperimen</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    ov.addEventListener("click", (e) => {
      const act = e.target && e.target.dataset && e.target.dataset.act;
      if (act === "next") window.location.href = nextHref;
      if (act === "dash") window.location.href = backHref;
      if (act === "stay") ov.remove();
    });
  }
})();
