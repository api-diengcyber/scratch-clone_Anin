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


