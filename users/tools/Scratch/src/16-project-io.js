// ============================================================
// FITUR PROYEK: EXPORT (SAVE) & IMPORT (LOAD), UI ALA SCRATCH 3.0
// ============================================================

(function initProjectIO() {

  // ---------- TOAST NOTIFIKASI ALA SCRATCH ----------
  function showScratchToast(msg, icon = "✅") {
    let toast = document.getElementById("scratch-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "scratch-toast";
      toast.className = "scratch-toast";
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span class="toast-icon">${icon}</span> <span class="toast-msg">${msg}</span>`;
    toast.classList.remove("show");
    void toast.offsetWidth; // trigger reflow
    toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3200);
  }
  window.showScratchToast = showScratchToast;

  // ---------- SERIALISASI PROJEK (EXPORT) ----------
  function serializeProject() {
    const titleInput = document.getElementById("project-title-input");
    const projectTitle = titleInput ? (titleInput.value.trim() || "Projek Scratch KKA") : "Projek Scratch KKA";

    function serializeBlock(block) {
      if (!block) return null;
      const bData = {
        type: block.type,
        customName: block.customName || null,
        customInputs: block.customInputs || [],
        customParts: block.customParts || [],
        runWithoutRefresh: !!block.runWithoutRefresh,
        inputs: [],
        dropdowns: [],
        branches: []
      };

      if (block.element) {
        // Ambil nilai dropdown
        const ownDropdowns = Array.from(block.element.querySelectorAll(".custom-dropdown"))
          .filter(dd => dd.closest(".scratch-block") === block.element);
        bData.dropdowns = ownDropdowns.map(dd => ({
          value: dd.dataset.value || dd.querySelector(".custom-dropdown-selected")?.textContent?.trim() || "",
          text: dd.querySelector(".custom-dropdown-selected")?.textContent?.trim() || ""
        }));

        // Ambil nilai input atau reporter bersarang
        const ownInputs = Array.from(block.element.querySelectorAll(".block-input"))
          .filter(inp => inp.closest(".scratch-block") === block.element);
        bData.inputs = ownInputs.map(inp => {
          if (inp._reporterData) {
            return {
              isReporter: true,
              reporter: serializeBlock(inp._reporterData)
            };
          } else {
            return {
              isReporter: false,
              value: inp.value
            };
          }
        });
      }

      // Ambil percabangan (C-blocks seperti repeat, forever, if)
      if (Array.isArray(block.branches)) {
        bData.branches = block.branches.map(branch => {
          if (!Array.isArray(branch)) return [];
          return branch.map(child => serializeBlock(child)).filter(Boolean);
        });
      }

      return bData;
    }

    const serializedStacks = (state.stacks || []).map(stack => {
      const container = stack.containerElem;
      let x = 20, y = 20;
      if (container) {
        x = parseFloat(container.style.left) || 20;
        y = parseFloat(container.style.top) || 20;
      }
      return {
        x,
        y,
        blocks: (stack.blocks || []).map(b => serializeBlock(b)).filter(Boolean)
      };
    });

    return {
      kka_scratch_format: "1.0",
      app: "Ruang KKA Scratch Studio",
      title: projectTitle,
      savedAt: new Date().toISOString(),
      sprite: {
        name: state.sprite?.name || "Kucing",
        x: state.sprite?.x ?? 0,
        y: state.sprite?.y ?? 0,
        direction: state.sprite?.direction ?? 90,
        size: state.sprite?.size ?? 100,
        visible: state.sprite?.visible !== false,
        costume: state.sprite?.costume || "costume1",
        rotationStyle: state.sprite?.rotationStyle || "all-around",
        graphicEffects: Object.assign({}, state.sprite?.graphicEffects),
        layer: state.sprite?.layer ?? 0
      },
      backdrop: {
        current: state.backdrop?.current || "backdrop1"
      },
      variables: Object.assign({}, state.variables),
      variableMeta: Object.assign({}, state.variableMeta),
      lists: Object.assign({}, state.lists),
      listMeta: Object.assign({}, state.listMeta),
      myBlocks: Object.assign({}, state.myBlocks),
      broadcastMessages: Array.from(state.broadcastMessages || []),
      soundState: Object.assign({}, state.soundState),
      stacks: serializedStacks
    };
  }
  window.serializeProject = serializeProject;

  // ---------- DESERIALISASI PROJEK (IMPORT) ----------
  function deserializeProject(projectData) {
    if (!projectData || !Array.isArray(projectData.stacks)) {
      throw new Error("Berkas proyek tidak memiliki struktur stacks yang sesuai.");
    }

    // 1. Simpan salinan cadangan sebelum ditimpa (bisa dipulihkan)
    try {
      window._lastSavedBackup = serializeProject();
    } catch (e) {}

    // 2. Reset keadaan proyek saat ini
    resetProjectState();

    // 3. Pulihkan judul proyek
    if (projectData.title) {
      const titleInput = document.getElementById("project-title-input");
      if (titleInput) {
        titleInput.value = projectData.title;
        localStorage.setItem("kka_scratch_project_title", projectData.title);
      }
    }

    // 4. Pulihkan data Sprite
    if (projectData.sprite) {
      Object.assign(state.sprite, projectData.sprite);
    }

    // 5. Pulihkan Backdrop
    if (projectData.backdrop) {
      state.backdrop.current = projectData.backdrop.current || "backdrop1";
    }

    // 6. Pulihkan Variabel, List, Suara
    if (projectData.variables) {
      state.variables = Object.assign({}, projectData.variables);
    }
    if (projectData.variableMeta) {
      state.variableMeta = Object.assign({}, projectData.variableMeta);
    }
    if (projectData.lists) {
      state.lists = Object.assign({}, projectData.lists);
    }
    if (projectData.listMeta) {
      state.listMeta = Object.assign({}, projectData.listMeta);
    }
    if (projectData.myBlocks) {
      state.myBlocks = Object.assign({}, projectData.myBlocks);
    }
    if (Array.isArray(projectData.broadcastMessages)) {
      state.broadcastMessages = [...projectData.broadcastMessages];
    }
    if (projectData.soundState) {
      state.soundState = Object.assign({}, projectData.soundState);
    }

    // 7. Rekonstruksi Stacks dan Blok di Workspace
    const targetCanvas = workspaceCanvas || scriptArea;

    function reconstructBlock(bData) {
      if (!bData || !bData.type) return null;

      // Cari definisi blok
      let def = (typeof blockDefinitions !== "undefined" && Array.isArray(blockDefinitions))
        ? blockDefinitions.find(d => d.type === bData.type)
        : null;

      if (!def) {
        if (bData.type.startsWith("call_myblock_") || bData.type === "define_myblock") {
          def = {
            cat: "myblocks",
            type: bData.type,
            customName: bData.customName,
            customInputs: bData.customInputs,
            customParts: bData.customParts,
            runWithoutRefresh: bData.runWithoutRefresh
          };
        } else if (bData.type === "var_reporter") {
          def = {
            cat: "variables",
            type: "var_reporter",
            text: bData.customName || "variabel",
            isReporter: true,
            customName: bData.customName
          };
        } else {
          def = {
            cat: "motion",
            type: bData.type,
            text: bData.type
          };
        }
      }

      // Buat UI Blok
      const wrapper = createBlockUI(def, false);
      const blockElem = wrapper.querySelector(".scratch-block");

      const blockObj = {
        type: bData.type,
        element: blockElem,
        customName: bData.customName || null,
        customInputs: bData.customInputs || [],
        customParts: bData.customParts || [],
        runWithoutRefresh: !!bData.runWithoutRefresh,
        branches: isControlCBlock(bData.type)
          ? Array.from({ length: getControlBranchCount(bData.type) }, () => [])
          : []
      };

      // Pulihkan dropdown
      if (Array.isArray(bData.dropdowns) && bData.dropdowns.length > 0) {
        const ownDropdowns = Array.from(blockElem.querySelectorAll(".custom-dropdown"))
          .filter(dd => dd.closest(".scratch-block") === blockElem);
        ownDropdowns.forEach((dd, idx) => {
          const saved = bData.dropdowns[idx];
          if (saved) {
            dd.dataset.value = saved.value;
            const label = dd.querySelector(".custom-dropdown-selected");
            if (label) label.textContent = saved.text || saved.value;
          }
        });
      }

      // Pulihkan input dan reporter bersarang
      if (Array.isArray(bData.inputs) && bData.inputs.length > 0) {
        const ownInputs = Array.from(blockElem.querySelectorAll(".block-input"))
          .filter(inp => inp.closest(".scratch-block") === blockElem);
        ownInputs.forEach((inp, idx) => {
          const saved = bData.inputs[idx];
          if (saved) {
            if (saved.isReporter && saved.reporter) {
              const nested = reconstructBlock(saved.reporter);
              if (nested) {
                attachReporterToInput(inp, nested.element, nested.blockData);
              }
            } else {
              inp.value = saved.value ?? "";
            }
          }
        });
      }

      // Pulihkan cabang C-block
      if (Array.isArray(bData.branches) && bData.branches.length > 0 && isControlCBlock(bData.type)) {
        const slots = Array.from(blockElem.querySelectorAll(":scope > .control-slot"));
        bData.branches.forEach((branchBlocks, bIdx) => {
          const slot = slots[bIdx];
          if (!slot) return;
          (branchBlocks || []).forEach(childBData => {
            const childObj = reconstructBlock(childBData);
            if (childObj) {
              slot.appendChild(childObj.element);
              blockObj.branches[bIdx].push(childObj.blockData);
            }
          });
        });
        if (typeof updateControlBlockLayout === "function") {
          updateControlBlockLayout(blockElem);
        }
      }

      return {
        element: blockElem,
        blockData: blockObj
      };
    }

    projectData.stacks.forEach(sData => {
      if (!sData || !Array.isArray(sData.blocks) || sData.blocks.length === 0) return;

      const container = document.createElement("div");
      container.className = "block-stack-container";
      container.style.position = "absolute";
      container.style.left = `${Math.max(4, sData.x || 20)}px`;
      container.style.top = `${Math.max(4, sData.y || 20)}px`;
      container.draggable = false;

      const restoredStack = {
        containerElem: container,
        blocks: []
      };

      sData.blocks.forEach(bData => {
        const res = reconstructBlock(bData);
        if (res) {
          container.appendChild(res.element);
          restoredStack.blocks.push(res.blockData);
          protectWorkspaceControls(res.element, container);
        }
      });

      if (restoredStack.blocks.length > 0) {
        targetCanvas.appendChild(container);
        state.stacks.push(restoredStack);
        setupWorkspacePointerDrag(container);
      }
    });

    // 8. Segarkan Stage dan Monitor
    if (typeof renderStage === "function") renderStage();
    if (typeof updateSpriteInfo === "function") updateSpriteInfo();
    if (typeof renderReporterMonitors === "function") renderReporterMonitors();
  }
  window.deserializeProject = deserializeProject;

  // ---------- EXPORT / CONVERT TO STANDALONE HTML PLAYER ----------
  function generateHTMLPlayer(projectData) {
    const title = projectData.title || "Proyek Scratch";
    const projectJson = JSON.stringify(projectData).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - Ruang KKA Scratch Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f172a;
      color: #ffffff;
      font-family: "Helvetica Neue", Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .player-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      width: 480px;
      max-width: 100%;
    }
    .player-header {
      background: #059669;
      color: #ffffff;
      padding: 12px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .player-title {
      font-size: 15px;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .player-stage-wrap {
      position: relative;
      width: 480px;
      height: 360px;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    canvas#stageCanvas {
      width: 480px;
      height: 360px;
      display: block;
    }
    .player-controls {
      background: #1e293b;
      padding: 12px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #334155;
    }
    .ctrl-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn-action {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 1px solid #475569;
      background: #334155;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-action:hover {
      transform: scale(1.08);
      filter: brightness(1.15);
    }
    .btn-action:active { transform: scale(0.95); }
    .status-text {
      font-size: 12px;
      color: #94a3b8;
      font-weight: 600;
    }
    .player-footer {
      padding: 10px 18px;
      background: #0f172a;
      border-top: 1px solid #1e293b;
      font-size: 11.5px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn-open-editor {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    .btn-open-editor:hover { background: rgba(255, 255, 255, 0.2); }
  </style>
</head>
<body>

  <div class="player-card">
    <div class="player-header">
      <div class="player-title">
        <span>🐱</span>
        <span id="pTitle">${title}</span>
      </div>
      <span style="font-size: 11px; opacity: 0.85; font-weight: 700;">Ruang KKA Player</span>
    </div>

    <div class="player-stage-wrap">
      <canvas id="stageCanvas" width="480" height="360"></canvas>
    </div>

    <div class="player-controls">
      <div class="ctrl-left">
        <button id="flagBtn" class="btn-action" title="Jalankan (Bendera Hijau)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 3v18M4 4h12l-2 5 2 5H4" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="#10b981"/>
          </svg>
        </button>
        <button id="stopBtn" class="btn-action" title="Hentikan">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#ef4444">
            <rect x="4" y="4" width="16" height="16" rx="3" stroke="#ef4444" stroke-width="2"/>
          </svg>
        </button>
        <span id="runStatus" class="status-text">Siap dimainkan</span>
      </div>
      <div>
        <button id="restartBtn" class="btn-action" title="Ulangi dari Awal" style="border-radius: 8px; width: auto; padding: 0 10px; font-size: 11.5px; font-weight: 700; color: #cbd5e1;">
          ↺ Reset
        </button>
      </div>
    </div>

    <div class="player-footer">
      <span>Dibuat dengan <strong>Scratch Studio Ruang KKA</strong></span>
      <button type="button" class="btn-open-editor" id="btnDownloadJson">Unduh .json</button>
    </div>
  </div>

  <script>
    const PROJECT = ${projectJson};

    const canvas = document.getElementById("stageCanvas");
    const ctx = canvas.getContext("2d");
    const flagBtn = document.getElementById("flagBtn");
    const stopBtn = document.getElementById("stopBtn");
    const restartBtn = document.getElementById("restartBtn");
    const runStatus = document.getElementById("runStatus");
    const btnDownloadJson = document.getElementById("btnDownloadJson");

    let isRunning = false;
    let audioCtx = null;
    let state = {
      sprite: Object.assign({ x: 0, y: 0, direction: 90, size: 100, visible: true, costume: "costume1", sayText: "", bubbleType: "say" }, PROJECT.sprite || {}),
      backdrop: Object.assign({ current: "backdrop1" }, PROJECT.backdrop || {}),
      variables: Object.assign({}, PROJECT.variables || {}),
      lists: Object.assign({}, PROJECT.lists || {})
    };

    function initAudio() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
    }

    function playBeep(freq = 440, duration = 0.2) {
      try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.stop(audioCtx.currentTime + duration);
      } catch (e) {}
    }

    function drawStage() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Gambar Latar
      if (state.backdrop.current === "backdrop_grid") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 480, 360);
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        for (let x = 0; x < 480; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 360); ctx.stroke(); }
        for (let y = 0; y < 360; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(480, y); ctx.stroke(); }
        ctx.strokeStyle = "#cbd5e1";
        ctx.beginPath(); ctx.moveTo(240, 0); ctx.lineTo(240, 360); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 180); ctx.lineTo(480, 180); ctx.stroke();
      } else if (state.backdrop.current === "backdrop_blue_sky") {
        ctx.fillStyle = "#dff4ff"; ctx.fillRect(0, 0, 480, 360);
        ctx.fillStyle = "#b8e986"; ctx.fillRect(0, 260, 480, 100);
        ctx.fillStyle = "#ffd93d"; ctx.beginPath(); ctx.arc(420, 60, 28, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 480, 360);
      }

      // 2. Gambar Sprite
      if (state.sprite.visible !== false) {
        ctx.save();
        const screenX = 240 + state.sprite.x;
        const screenY = 180 - state.sprite.y;
        ctx.translate(screenX, screenY);
        const rad = (state.sprite.direction - 90) * Math.PI / 180;
        ctx.rotate(rad);
        const scale = (state.sprite.size || 100) / 100;
        ctx.scale(scale, scale);

        // Badan kucing Scratch
        let catColor = "#FFAB19";
        if (state.sprite.costume === "costume2") catColor = "#FF4C4C";
        if (state.sprite.costume === "costume3") catColor = "#4C97FF";

        ctx.fillStyle = catColor;
        ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
        // Telinga
        ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(-24, -32); ctx.lineTo(-4, -22); ctx.fill();
        ctx.beginPath(); ctx.moveTo(14, -14); ctx.lineTo(24, -32); ctx.lineTo(4, -22); ctx.fill();
        // Mata & Hidung
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(-8, -4, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(8, -4, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#1e293b";
        ctx.beginPath(); ctx.arc(-7, -4, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(7, -4, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 3, 2.5, 0, Math.PI * 2); ctx.fill();
        // Kumis
        ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(-24, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(-24, 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(24, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10, 6); ctx.lineTo(24, 8); ctx.stroke();
        ctx.restore();

        // Gelembung Bicara
        if (state.sprite.sayText) {
          ctx.save();
          ctx.font = "bold 13px sans-serif";
          const tw = ctx.measureText(state.sprite.sayText).width;
          const bw = Math.max(tw + 20, 60);
          const bh = 28;
          const bx = screenX - bw / 2;
          const by = screenY - 56;
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#334155";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 8);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#0f172a";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(state.sprite.sayText, bx + bw / 2, by + bh / 2);
          ctx.restore();
        }
      }
    }

    // Evaluasi Nilai Input
    function evalValue(inp) {
      if (!inp) return "";
      if (inp.isReporter && inp.reporter) {
        return evalBlock(inp.reporter);
      }
      return inp.value !== undefined ? inp.value : "";
    }

    function evalBlock(b) {
      if (!b) return "";
      const val0 = evalValue(b.inputs && b.inputs[0]);
      const val1 = evalValue(b.inputs && b.inputs[1]);
      switch (b.type) {
        case "operator_add": return (parseFloat(val0) || 0) + (parseFloat(val1) || 0);
        case "operator_subtract": return (parseFloat(val0) || 0) - (parseFloat(val1) || 0);
        case "operator_multiply": return (parseFloat(val0) || 0) * (parseFloat(val1) || 0);
        case "operator_divide": return (parseFloat(val1) !== 0) ? (parseFloat(val0) || 0) / parseFloat(val1) : 0;
        case "operator_random": {
          const min = parseFloat(val0) || 1, max = parseFloat(val1) || 10;
          return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        case "operator_join": return String(val0) + String(val1);
        case "operator_letter_of": return String(val1).charAt((parseInt(val0, 10) || 1) - 1) || "";
        case "operator_length": return String(val0).length;
        case "operator_contains": return String(val0).includes(String(val1));
        case "operator_gt": return (parseFloat(val0) || 0) > (parseFloat(val1) || 0);
        case "operator_lt": return (parseFloat(val0) || 0) < (parseFloat(val1) || 0);
        case "operator_equals": return String(val0).toLowerCase() === String(val1).toLowerCase();
        case "operator_and": return Boolean(val0) && Boolean(val1);
        case "operator_or": return Boolean(val0) || Boolean(val1);
        case "operator_not": return !val0;
        case "x_position": return Math.round(state.sprite.x);
        case "y_position": return Math.round(state.sprite.y);
        case "direction": return Math.round(state.sprite.direction);
        case "var_reporter": return state.variables[b.customName || val0] ?? 0;
        default: return "";
      }
    }

    const wait = (ms) => new Promise(res => setTimeout(res, ms));

    async function executeBlock(b) {
      if (!isRunning || !b) return;
      const val0 = evalValue(b.inputs && b.inputs[0]);
      const val1 = evalValue(b.inputs && b.inputs[1]);
      const dd0 = (b.dropdowns && b.dropdowns[0] && b.dropdowns[0].value) || "";

      switch (b.type) {
        case "move_steps": {
          const steps = parseFloat(val0) || 0;
          const rad = state.sprite.direction * Math.PI / 180;
          state.sprite.x += Math.sin(rad) * steps;
          state.sprite.y += Math.cos(rad) * steps;
          break;
        }
        case "turn_right": {
          state.sprite.direction = (state.sprite.direction + (parseFloat(val0) || 15)) % 360;
          break;
        }
        case "turn_left": {
          state.sprite.direction = (state.sprite.direction - (parseFloat(val0) || 15)) % 360;
          break;
        }
        case "goto_xy": {
          state.sprite.x = parseFloat(val0) || 0;
          state.sprite.y = parseFloat(val1) || 0;
          break;
        }
        case "set_x": state.sprite.x = parseFloat(val0) || 0; break;
        case "change_x": state.sprite.x += parseFloat(val0) || 0; break;
        case "set_y": state.sprite.y = parseFloat(val0) || 0; break;
        case "change_y": state.sprite.y += parseFloat(val0) || 0; break;
        case "point_direction": state.sprite.direction = parseFloat(val0) || 90; break;
        case "say_for_secs": {
          state.sprite.sayText = String(val0);
          drawStage();
          await wait((parseFloat(val1) || 2) * 1000);
          state.sprite.sayText = "";
          break;
        }
        case "say": state.sprite.sayText = String(val0); break;
        case "switch_costume": state.sprite.costume = dd0 || val0 || "costume1"; break;
        case "next_costume": {
          const costumes = ["costume1", "costume2", "costume3"];
          const idx = costumes.indexOf(state.sprite.costume);
          state.sprite.costume = costumes[(idx + 1) % costumes.length];
          break;
        }
        case "switch_backdrop": state.backdrop.current = dd0 || val0 || "backdrop1"; break;
        case "change_size": state.sprite.size = Math.max(10, (state.sprite.size || 100) + (parseFloat(val0) || 10)); break;
        case "set_size": state.sprite.size = Math.max(10, parseFloat(val0) || 100); break;
        case "show": state.sprite.visible = true; break;
        case "hide": state.sprite.visible = false; break;
        case "play_sound": playBeep(520, 0.25); break;
        case "wait_seconds": await wait((parseFloat(val0) || 1) * 1000); break;
        case "repeat": {
          const times = Math.max(0, parseInt(val0, 10) || 1);
          const innerBlocks = (b.branches && b.branches[0]) || [];
          for (let r = 0; r < times; r++) {
            if (!isRunning) break;
            for (const child of innerBlocks) {
              await executeBlock(child);
            }
            await wait(16);
          }
          break;
        }
        case "forever": {
          const innerBlocks = (b.branches && b.branches[0]) || [];
          while (isRunning) {
            for (const child of innerBlocks) {
              await executeBlock(child);
            }
            await wait(16);
          }
          break;
        }
        case "if": {
          const cond = Boolean(evalValue(b.inputs && b.inputs[0]));
          if (cond) {
            const innerBlocks = (b.branches && b.branches[0]) || [];
            for (const child of innerBlocks) await executeBlock(child);
          }
          break;
        }
        case "if_else": {
          const cond = Boolean(evalValue(b.inputs && b.inputs[0]));
          const ifBlocks = (b.branches && b.branches[0]) || [];
          const elseBlocks = (b.branches && b.branches[1]) || [];
          const target = cond ? ifBlocks : elseBlocks;
          for (const child of target) await executeBlock(child);
          break;
        }
        case "set_variable": {
          const vName = dd0 || b.customName || val0;
          state.variables[vName] = val1 !== undefined ? val1 : val0;
          break;
        }
        case "change_variable": {
          const vName = dd0 || b.customName || val0;
          state.variables[vName] = (parseFloat(state.variables[vName]) || 0) + (parseFloat(val1) || 1);
          break;
        }
        case "stop_all": stopExecution(); break;
      }
      drawStage();
    }

    async function runProgram() {
      if (isRunning) return;
      initAudio();
      isRunning = true;
      runStatus.textContent = "🟢 Berjalan...";
      drawStage();

      const stacks = (PROJECT.stacks || []).filter(s => Array.isArray(s.blocks) && s.blocks.length > 0);
      try {
        for (const stack of stacks) {
          if (!isRunning) break;
          const first = stack.blocks[0];
          const startIndex = (first && first.type && first.type.startsWith("when_")) ? 1 : 0;
          for (let i = startIndex; i < stack.blocks.length; i++) {
            if (!isRunning) break;
            await executeBlock(stack.blocks[i]);
            await wait(50);
          }
        }
      } catch (err) {
        console.error("Kesalahan eksekusi:", err);
      } finally {
        if (isRunning) {
          runStatus.textContent = "✓ Selesai";
          isRunning = false;
        }
      }
    }

    function stopExecution() {
      isRunning = false;
      state.sprite.sayText = "";
      runStatus.textContent = "🛑 Berhenti";
      drawStage();
    }

    function resetProject() {
      stopExecution();
      state = {
        sprite: Object.assign({ x: 0, y: 0, direction: 90, size: 100, visible: true, costume: "costume1", sayText: "", bubbleType: "say" }, PROJECT.sprite || {}),
        backdrop: Object.assign({ current: "backdrop1" }, PROJECT.backdrop || {}),
        variables: Object.assign({}, PROJECT.variables || {}),
        lists: Object.assign({}, PROJECT.lists || {})
      };
      runStatus.textContent = "Siap dimainkan";
      drawStage();
    }

    flagBtn.addEventListener("click", runProgram);
    stopBtn.addEventListener("click", stopExecution);
    restartBtn.addEventListener("click", resetProject);

    btnDownloadJson.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(PROJECT, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (PROJECT.title || "proyek").replace(/\\s+/g, "-") + ".kka.json";
      a.click();
      URL.revokeObjectURL(url);
    });

    // Inisialisasi awal
    drawStage();
  </script>
</body>
</html>`;
  }
  window.generateHTMLPlayer = generateHTMLPlayer;

  // Ekspor proyek langsung menjadi file .html player standalone
  function exportProjectToHTML(customData) {
    try {
      const data = customData || serializeProject();
      const htmlContent = generateHTMLPlayer(data);
      const cleanTitle = (data.title || "proyek-scratch").replace(/[^\w\s-]/gi, "").trim().replace(/\s+/g, "-");
      const filename = `${cleanTitle || "proyek-scratch"}.html`;

      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showScratchToast(`HTML Player berhasil diekspor: <strong>${filename}</strong>`, "🌐");
    } catch (err) {
      console.error("Gagal export HTML player:", err);
      alert("Terjadi kesalahan saat mengekspor ke HTML: " + err.message);
    }
  }
  window.exportProjectToHTML = exportProjectToHTML;

  // Konversi file .kka.json dari komputer menjadi .html player
  function convertFileToHTML(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !Array.isArray(parsed.stacks)) {
          throw new Error("Format file Scratch tidak valid.");
        }
        exportProjectToHTML(parsed);
      } catch (err) {
        console.error("Gagal konversi berkas ke HTML:", err);
        alert("Gagal mengonversi file ke HTML: " + err.message);
      }
    };
    reader.readAsText(file);
  }
  window.convertFileToHTML = convertFileToHTML;

  // ---------- EXPORT BERKAS (.json / .kka) ----------
  function exportProjectToFile() {
    try {
      const data = serializeProject();
      const jsonStr = JSON.stringify(data, null, 2);
      const cleanTitle = (data.title || "proyek-scratch").replace(/[^\w\s-]/gi, "").trim().replace(/\s+/g, "-");
      const filename = `${cleanTitle || "proyek-scratch"}.kka.json`;

      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showScratchToast(`Proyek disimpan ke komputer: <strong>${filename}</strong>`, "💾");
    } catch (err) {
      console.error("Gagal export proyek:", err);
      alert("Terjadi kesalahan saat menyimpan proyek: " + err.message);
    }
  }
  window.exportProjectToFile = exportProjectToFile;

  // ---------- IMPORT BERKAS DARI KOMPUTER ----------
  function importProjectFromFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const content = e.target.result;
        const parsed = JSON.parse(content);
        deserializeProject(parsed);
        showScratchToast(`Proyek <strong>${parsed.title || file.name}</strong> berhasil dimuat!`, "📂");
      } catch (err) {
        console.error("Gagal membaca berkas projek:", err);
        alert("Gagal memuat berkas proyek Scratch: " + err.message);
      }
    };
    reader.onerror = function() {
      alert("Gagal membaca berkas dari komputermu.");
    };
    reader.readAsText(file);
  }
  window.importProjectFromFile = importProjectFromFile;

  // ---------- PROYEK BARU ----------
  function createNewProject() {
    const hasBlocks = state.stacks && state.stacks.length > 0;
    if (hasBlocks) {
      const ok = confirm("Ganti isi proyek saat ini?\nSemua blok yang belum disimpan ke komputer akan dibersihkan.");
      if (!ok) return;
    }
    resetProjectState();
    const titleInput = document.getElementById("project-title-input");
    if (titleInput) {
      titleInput.value = "Projek Scratch KKA";
      localStorage.setItem("kka_scratch_project_title", "Projek Scratch KKA");
    }
    showScratchToast("Proyek baru siap! Area kerja bersih.", "✨");
  }
  window.createNewProject = createNewProject;

  // ---------- MODE TURBO ----------
  function toggleTurboMode() {
    state.turboMode = !state.turboMode;
    const turboBadge = document.getElementById("turbo-badge");
    const turboMenuText = document.getElementById("menu-turbo-text");

    if (turboBadge) {
      turboBadge.style.display = state.turboMode ? "inline-flex" : "none";
    }
    if (turboMenuText) {
      turboMenuText.textContent = state.turboMode ? "Matikan Mode Turbo" : "Nyalakan Mode Turbo";
    }

    if (state.turboMode) {
      showScratchToast("Mode Turbo DIAKTIFKAN! Eksekusi super cepat.", "⚡");
    } else {
      showScratchToast("Mode Turbo dinonaktifkan.", "🐢");
    }
  }
  window.toggleTurboMode = toggleTurboMode;

  // ---------- INLINE TAB KOSTUM ALA SCRATCH 3.0 (PAINT EDITOR) ----------
  function initCostumesTab() {
    const tabCostumes = document.getElementById("tab-costumes");
    const tabCode = document.getElementById("tab-code");
    const tabSounds = document.getElementById("tab-sounds");
    const codeArea = document.getElementById("script-area");
    const soundsPanel = document.getElementById("sounds-panel");
    const costumesPanel = document.getElementById("costumes-panel");
    const categoriesSidebar = document.querySelector(".sidebar-categories");
    const palettePanel = document.getElementById("palette-scroll");

    if (!tabCostumes || !costumesPanel) return;

    // Paint Editor State
    let currentTool = "select";
    let fillColor = "#855cd6";
    let outlineColor = "#000000";
    let strokeWidth = 4;
    let zoomLevel = 1.0;
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let historyStack = [];
    let redoStack = [];
    let clipboardData = null;

    // DOM Elements
    const listEl = document.getElementById("costumes-list");
    const mainCanvas = document.getElementById("paint-main-canvas");
    const overlayCanvas = document.getElementById("paint-overlay-canvas");
    const canvasStage = document.getElementById("paint-canvas-stage");
    const selectionBox = document.getElementById("paint-selection-box");
    const costumeNameInput = document.getElementById("costume-name-input");
    const btnUndo = document.getElementById("paint-btn-undo");
    const btnRedo = document.getElementById("paint-btn-redo");
    const btnCopy = document.getElementById("paint-btn-copy");
    const btnPaste = document.getElementById("paint-btn-paste");
    const btnDelete = document.getElementById("paint-btn-delete");
    const btnFlipH = document.getElementById("paint-btn-fliph");
    const btnFlipV = document.getElementById("paint-btn-flipv");
    const fillBox = document.getElementById("paint-fill-box");
    const fillSwatch = document.getElementById("paint-fill-swatch");
    const fillColorInput = document.getElementById("paint-fill-color-input");
    const outlineBox = document.getElementById("paint-outline-box");
    const outlineSwatch = document.getElementById("paint-outline-swatch");
    const outlineColorInput = document.getElementById("paint-outline-color-input");
    const strokeWidthInput = document.getElementById("paint-stroke-width");
    const btnConvert = document.getElementById("paint-btn-convert");
    const zoomInBtn = document.getElementById("paint-zoom-in");
    const zoomOutBtn = document.getElementById("paint-zoom-out");
    const zoomResetBtn = document.getElementById("paint-zoom-reset");
    const addCostumeBtn = document.getElementById("add-costume-btn");
    const costumePopover = document.getElementById("costume-add-popover");
    const btnFromLib = document.getElementById("btn-costume-from-lib");
    const btnPaint = document.getElementById("btn-costume-paint");
    const btnDuplicate = document.getElementById("btn-costume-duplicate");
    const btnUpload = document.getElementById("btn-costume-upload");
    const fileInput = document.getElementById("costume-file-input");

    const mainCtx = mainCanvas ? mainCanvas.getContext("2d") : null;
    const overlayCtx = overlayCanvas ? overlayCanvas.getContext("2d") : null;

    function getActiveCostumeDef() {
      return COSTUME_DEFINITIONS.find(c => c.name === state.sprite.costume) || COSTUME_DEFINITIONS[0];
    }

    function pushHistory() {
      if (!mainCanvas) return;
      try {
        const data = mainCanvas.toDataURL();
        historyStack.push(data);
        if (historyStack.length > 25) historyStack.shift();
        redoStack = [];
        updateHistoryButtons();
      } catch (e) {}
    }

    function updateHistoryButtons() {
      if (btnUndo) btnUndo.disabled = historyStack.length <= 1;
      if (btnRedo) btnRedo.disabled = redoStack.length === 0;
    }

    function saveCurrentCanvasToCostume() {
      const def = getActiveCostumeDef();
      if (!def || !mainCanvas) return;
      if (!def.canvas) {
        def.canvas = document.createElement("canvas");
        def.canvas.width = mainCanvas.width;
        def.canvas.height = mainCanvas.height;
      }
      const ctx = def.canvas.getContext("2d");
      ctx.clearRect(0, 0, def.canvas.width, def.canvas.height);
      ctx.drawImage(mainCanvas, 0, 0);

      // Sinkronisasi ke Stage & Thumbnail
      if (typeof renderStage === "function") renderStage();
      renderCostumesList();
    }

    function renderCostumesList() {
      if (!listEl) return;
      listEl.innerHTML = "";

      COSTUME_DEFINITIONS.forEach((c, idx) => {
        const isActive = (c.name === state.sprite.costume);
        const item = document.createElement("div");
        item.className = "costume-list-item" + (isActive ? " active" : "");

        const widthStr = c.width || (idx === 1 ? 96 : 95);
        const heightStr = c.height || 101;

        item.innerHTML = `
          <div class="costume-item-header">
            <span class="costume-num">${idx + 1}</span>
          </div>
          <div class="costume-thumb-card">
            <canvas class="costume-thumb" width="66" height="66"></canvas>
            ${COSTUME_DEFINITIONS.length > 1 ? `
              <button type="button" class="costume-trash-btn" title="Hapus Kostum">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ""}
          </div>
          <div class="costume-label">${c.name}</div>
          <div class="costume-dimens">${widthStr}x${heightStr}</div>
        `;

        const cv = item.querySelector("canvas");
        if (cv) {
          const ctx = cv.getContext("2d");
          ctx.clearRect(0, 0, cv.width, cv.height);
          if (c.canvas) {
            ctx.drawImage(c.canvas, 0, 0, cv.width, cv.height);
          } else if (c.svg && typeof getArtImage === "function") {
            const img = getArtImage(c.svg);
            if (img && img.complete && img.naturalWidth) {
              ctx.drawImage(img, 6, 6, cv.width - 12, cv.height - 12);
            } else {
              img.onload = () => {
                ctx.clearRect(0, 0, cv.width, cv.height);
                ctx.drawImage(img, 6, 6, cv.width - 12, cv.height - 12);
              };
            }
          } else if (typeof drawCatThumb === "function") {
            drawCatThumb(cv, c.name);
          }
        }

        // Event Hapus Kostum
        const trashBtn = item.querySelector(".costume-trash-btn");
        if (trashBtn) {
          trashBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (COSTUME_DEFINITIONS.length <= 1) return;
            const delIdx = COSTUME_DEFINITIONS.indexOf(c);
            if (delIdx !== -1) {
              COSTUME_DEFINITIONS.splice(delIdx, 1);
              if (state.sprite.costume === c.name) {
                state.sprite.costume = COSTUME_DEFINITIONS[Math.max(0, delIdx - 1)].name;
              }
              if (typeof refreshAssetBlockOptions === "function") refreshAssetBlockOptions();
              if (typeof renderStage === "function") renderStage();
              renderCostumesList();
              loadCostumeToEditor();
              showScratchToast(`Kostum "${c.name}" telah dihapus.`, "🗑️");
            }
          });
        }

        // Event Pilih Kostum
        item.addEventListener("click", () => {
          if (state.sprite.costume !== c.name) {
            state.sprite.costume = c.name;
            if (typeof renderStage === "function") renderStage();
            renderCostumesList();
            loadCostumeToEditor();
          }
        });

        listEl.appendChild(item);
      });
    }

    function loadCostumeToEditor() {
      const def = getActiveCostumeDef();
      if (!def || !mainCanvas || !mainCtx) return;

      if (costumeNameInput) {
        costumeNameInput.value = def.name;
      }

      mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
      if (overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      if (def.canvas) {
        mainCtx.drawImage(def.canvas, 0, 0);
        historyStack = [mainCanvas.toDataURL()];
        redoStack = [];
        updateHistoryButtons();
      } else if (def.svg && typeof getArtImage === "function") {
        const img = getArtImage(def.svg);
        const renderImg = () => {
          mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
          const targetW = 140;
          const targetH = 148;
          const posX = (mainCanvas.width - targetW) / 2;
          const posY = (mainCanvas.height - targetH) / 2;
          mainCtx.drawImage(img, posX, posY, targetW, targetH);
          historyStack = [mainCanvas.toDataURL()];
          redoStack = [];
          updateHistoryButtons();
        };
        if (img && img.complete && img.naturalWidth) {
          renderImg();
        } else if (img) {
          img.onload = renderImg;
        }
      } else {
        historyStack = [mainCanvas.toDataURL()];
        redoStack = [];
        updateHistoryButtons();
      }

      updateSelectionBox();
    }

    function updateSelectionBox() {
      if (!selectionBox) return;
      if (currentTool === "select") {
        selectionBox.style.display = "block";
        selectionBox.style.left = "140px";
        selectionBox.style.top = "80px";
        selectionBox.style.width = "200px";
        selectionBox.style.height = "200px";
      } else {
        selectionBox.style.display = "none";
      }
    }

    // Canvas Position Calculation with Zoom
    function getCanvasPos(e) {
      const rect = mainCanvas.getBoundingClientRect();
      const scaleX = mainCanvas.width / rect.width;
      const scaleY = mainCanvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    // Pointer Events on Canvas for Interactive Drawing
    if (mainCanvas && overlayCanvas) {
      const handlePointerDown = (e) => {
        if (e.button !== 0) return;
        const pos = getCanvasPos(e);
        startX = pos.x;
        startY = pos.y;
        lastX = pos.x;
        lastY = pos.y;
        isDrawing = true;

        if (currentTool === "brush") {
          mainCtx.save();
          mainCtx.beginPath();
          mainCtx.strokeStyle = fillColor;
          mainCtx.lineWidth = strokeWidth;
          mainCtx.lineCap = "round";
          mainCtx.lineJoin = "round";
          mainCtx.moveTo(startX, startY);
          mainCtx.lineTo(startX, startY);
          mainCtx.stroke();
        } else if (currentTool === "eraser") {
          mainCtx.save();
          mainCtx.globalCompositeOperation = "destination-out";
          mainCtx.beginPath();
          mainCtx.strokeStyle = "rgba(0,0,0,1)";
          mainCtx.lineWidth = Math.max(strokeWidth * 2.5, 12);
          mainCtx.lineCap = "round";
          mainCtx.lineJoin = "round";
          mainCtx.moveTo(startX, startY);
          mainCtx.lineTo(startX, startY);
          mainCtx.stroke();
        } else if (currentTool === "fill") {
          // Flood fill area canvas with fillColor
          mainCtx.save();
          mainCtx.fillStyle = fillColor;
          mainCtx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
          mainCtx.restore();
          isDrawing = false;
          pushHistory();
          saveCurrentCanvasToCostume();
        } else if (currentTool === "text") {
          isDrawing = false;
          const userText = prompt("Tuliskan teks untuk ditambahkan ke kostum:", "Dieng Cyber");
          if (userText && userText.trim()) {
            mainCtx.save();
            mainCtx.font = `bold ${Math.max(strokeWidth * 5, 26)}px 'Plus Jakarta Sans', Arial, sans-serif`;
            mainCtx.fillStyle = fillColor;
            mainCtx.textBaseline = "middle";
            mainCtx.fillText(userText.trim(), startX, startY);
            mainCtx.restore();
            pushHistory();
            saveCurrentCanvasToCostume();
          }
        }
      };

      const handlePointerMove = (e) => {
        if (!isDrawing) return;
        const pos = getCanvasPos(e);
        const curX = pos.x;
        const curY = pos.y;

        if (currentTool === "brush") {
          mainCtx.lineTo(curX, curY);
          mainCtx.stroke();
          lastX = curX;
          lastY = curY;
        } else if (currentTool === "eraser") {
          mainCtx.lineTo(curX, curY);
          mainCtx.stroke();
          lastX = curX;
          lastY = curY;
        } else if (currentTool === "line") {
          overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          overlayCtx.beginPath();
          overlayCtx.strokeStyle = outlineColor;
          overlayCtx.lineWidth = strokeWidth;
          overlayCtx.lineCap = "round";
          overlayCtx.moveTo(startX, startY);
          overlayCtx.lineTo(curX, curY);
          overlayCtx.stroke();
        } else if (currentTool === "rectangle") {
          overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          const rx = Math.min(startX, curX);
          const ry = Math.min(startY, curY);
          const rw = Math.abs(curX - startX);
          const rh = Math.abs(curY - startY);
          overlayCtx.fillStyle = fillColor;
          overlayCtx.fillRect(rx, ry, rw, rh);
          if (strokeWidth > 0) {
            overlayCtx.strokeStyle = outlineColor;
            overlayCtx.lineWidth = strokeWidth;
            overlayCtx.strokeRect(rx, ry, rw, rh);
          }
        } else if (currentTool === "circle") {
          overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          const cx = (startX + curX) / 2;
          const cy = (startY + curY) / 2;
          const rx = Math.abs(curX - startX) / 2;
          const ry = Math.abs(curY - startY) / 2;
          overlayCtx.beginPath();
          overlayCtx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
          overlayCtx.fillStyle = fillColor;
          overlayCtx.fill();
          if (strokeWidth > 0) {
            overlayCtx.strokeStyle = outlineColor;
            overlayCtx.lineWidth = strokeWidth;
            overlayCtx.stroke();
          }
        }
      };

      const handlePointerUp = () => {
        if (!isDrawing) return;
        isDrawing = false;

        if (currentTool === "brush" || currentTool === "eraser") {
          mainCtx.restore();
        } else if (currentTool === "line" || currentTool === "rectangle" || currentTool === "circle") {
          mainCtx.drawImage(overlayCanvas, 0, 0);
          overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        pushHistory();
        saveCurrentCanvasToCostume();
      };

      mainCanvas.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }

    // Tool Buttons Switching
    const toolBtns = document.querySelectorAll(".paint-tool-btn");
    toolBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        toolBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentTool = btn.dataset.tool || "select";
        updateSelectionBox();

        // Cursor feedback
        if (canvasStage) {
          if (currentTool === "select") canvasStage.style.cursor = "default";
          else if (currentTool === "text") canvasStage.style.cursor = "text";
          else canvasStage.style.cursor = "crosshair";
        }
      });
    });

    // Rename Costume
    if (costumeNameInput) {
      costumeNameInput.addEventListener("change", () => {
        const newName = costumeNameInput.value.trim();
        if (!newName) {
          costumeNameInput.value = state.sprite.costume;
          return;
        }
        const def = getActiveCostumeDef();
        if (def) {
          def.name = newName;
          state.sprite.costume = newName;
          if (typeof refreshAssetBlockOptions === "function") refreshAssetBlockOptions();
          renderCostumesList();
          showScratchToast(`Nama kostum diubah menjadi "${newName}".`, "✏️");
        }
      });
    }

    // Undo & Redo Handlers
    if (btnUndo) {
      btnUndo.addEventListener("click", () => {
        if (historyStack.length <= 1) return;
        const currentSnap = historyStack.pop();
        redoStack.push(currentSnap);
        const prevSnap = historyStack[historyStack.length - 1];
        const img = new Image();
        img.onload = () => {
          mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
          mainCtx.drawImage(img, 0, 0);
          saveCurrentCanvasToCostume();
          updateHistoryButtons();
        };
        img.src = prevSnap;
      });
    }

    if (btnRedo) {
      btnRedo.addEventListener("click", () => {
        if (!redoStack.length) return;
        const nextSnap = redoStack.pop();
        historyStack.push(nextSnap);
        const img = new Image();
        img.onload = () => {
          mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
          mainCtx.drawImage(img, 0, 0);
          saveCurrentCanvasToCostume();
          updateHistoryButtons();
        };
        img.src = nextSnap;
      });
    }

    // Flip Horizontal & Flip Vertical
    if (btnFlipH) {
      btnFlipH.addEventListener("click", () => {
        if (!mainCanvas || !mainCtx) return;
        const temp = document.createElement("canvas");
        temp.width = mainCanvas.width;
        temp.height = mainCanvas.height;
        temp.getContext("2d").drawImage(mainCanvas, 0, 0);

        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        mainCtx.save();
        mainCtx.translate(mainCanvas.width, 0);
        mainCtx.scale(-1, 1);
        mainCtx.drawImage(temp, 0, 0);
        mainCtx.restore();

        pushHistory();
        saveCurrentCanvasToCostume();
        showScratchToast("Kostum dibalik secara horizontal (Flip Horizontal)", "↔️");
      });
    }

    if (btnFlipV) {
      btnFlipV.addEventListener("click", () => {
        if (!mainCanvas || !mainCtx) return;
        const temp = document.createElement("canvas");
        temp.width = mainCanvas.width;
        temp.height = mainCanvas.height;
        temp.getContext("2d").drawImage(mainCanvas, 0, 0);

        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
        mainCtx.save();
        mainCtx.translate(0, mainCanvas.height);
        mainCtx.scale(1, -1);
        mainCtx.drawImage(temp, 0, 0);
        mainCtx.restore();

        pushHistory();
        saveCurrentCanvasToCostume();
        showScratchToast("Kostum dibalik secara vertikal (Flip Vertical)", "↕️");
      });
    }

    // Delete (Clear Canvas)
    if (btnDelete) {
      btnDelete.addEventListener("click", () => {
        if (!mainCanvas || !mainCtx) return;
        if (confirm("Bersihkan seluruh isi gambar pada kostum ini?")) {
          mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
          pushHistory();
          saveCurrentCanvasToCostume();
          showScratchToast("Isi gambar kostum telah dibersihkan.", "🧹");
        }
      });
    }

    // Copy & Paste
    if (btnCopy) {
      btnCopy.addEventListener("click", () => {
        if (!mainCanvas) return;
        clipboardData = mainCanvas.toDataURL();
        showScratchToast("Gambar kostum disalin ke clipboard.", "📋");
      });
    }

    if (btnPaste) {
      btnPaste.addEventListener("click", () => {
        if (!clipboardData || !mainCanvas || !mainCtx) return;
        const img = new Image();
        img.onload = () => {
          mainCtx.drawImage(img, 10, 10);
          pushHistory();
          saveCurrentCanvasToCostume();
          showScratchToast("Gambar kostum berhasil ditempel.", "📥");
        };
        img.src = clipboardData;
      });
    }

    // Fill Color Picker
    if (fillBox && fillColorInput) {
      fillBox.addEventListener("click", () => fillColorInput.click());
      fillColorInput.addEventListener("input", (e) => {
        fillColor = e.target.value;
        if (fillSwatch) fillSwatch.style.backgroundColor = fillColor;
      });
    }

    // Outline Color Picker & Stroke Width
    if (outlineBox && outlineColorInput) {
      outlineBox.addEventListener("click", () => outlineColorInput.click());
      outlineColorInput.addEventListener("input", (e) => {
        outlineColor = e.target.value;
        if (outlineSwatch) outlineSwatch.style.backgroundColor = outlineColor;
      });
    }

    if (strokeWidthInput) {
      strokeWidthInput.addEventListener("input", (e) => {
        strokeWidth = Math.max(1, parseInt(e.target.value, 10) || 4);
      });
    }

    // Zoom Controls
    function applyZoom() {
      if (canvasStage) {
        canvasStage.style.transform = `scale(${zoomLevel})`;
      }
    }
    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", () => {
        zoomLevel = Math.min(3.0, +(zoomLevel + 0.2).toFixed(1));
        applyZoom();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", () => {
        zoomLevel = Math.max(0.5, +(zoomLevel - 0.2).toFixed(1));
        applyZoom();
      });
    }
    if (zoomResetBtn) {
      zoomResetBtn.addEventListener("click", () => {
        zoomLevel = 1.0;
        applyZoom();
      });
    }

    // Convert to Bitmap / Vector
    if (btnConvert) {
      btnConvert.addEventListener("click", () => {
        const isVector = btnConvert.textContent.includes("Vector");
        btnConvert.innerHTML = `<span>${isVector ? "Convert to Bitmap" : "Convert to Vector"}</span>`;
        showScratchToast(`Mode beralih ke format ${isVector ? "Bitmap" : "Vector"}.`, "🎨");
      });
    }

    // FAB & Popover: Tambah Kostum Baru
    if (addCostumeBtn && costumePopover) {
      addCostumeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        costumePopover.classList.toggle("open");
      });

      document.addEventListener("click", (e) => {
        if (!costumePopover.contains(e.target) && e.target !== addCostumeBtn) {
          costumePopover.classList.remove("open");
        }
      });
    }

    // Popover: Pilih Kostum dari Pustaka
    if (btnFromLib) {
      btnFromLib.addEventListener("click", () => {
        if (costumePopover) costumePopover.classList.remove("open");
        const addSpriteBtn = document.getElementById("add-sprite-btn");
        if (addSpriteBtn) addSpriteBtn.click();
      });
    }

    // Popover: Lukis Baru (Kostum Kosong)
    if (btnPaint) {
      btnPaint.addEventListener("click", () => {
        if (costumePopover) costumePopover.classList.remove("open");
        const newIdx = COSTUME_DEFINITIONS.length + 1;
        const newName = `costume${newIdx}`;
        const newCostume = {
          name: newName,
          color: "#855cd6",
          width: 95,
          height: 101,
          canvas: document.createElement("canvas")
        };
        newCostume.canvas.width = 480;
        newCostume.canvas.height = 360;

        COSTUME_DEFINITIONS.push(newCostume);
        state.sprite.costume = newName;
        if (typeof refreshAssetBlockOptions === "function") refreshAssetBlockOptions();
        if (typeof renderStage === "function") renderStage();
        renderCostumesList();
        loadCostumeToEditor();
        showScratchToast(`Kostum baru "${newName}" siap dilukis!`, "✨");
      });
    }

    // Popover: Duplikasi Kostum Aktif
    if (btnDuplicate) {
      btnDuplicate.addEventListener("click", () => {
        if (costumePopover) costumePopover.classList.remove("open");
        const activeDef = getActiveCostumeDef();
        if (!activeDef) return;

        const dupName = `${activeDef.name}_copy`;
        const dupCostume = {
          name: dupName,
          color: activeDef.color || "#FFAB19",
          width: activeDef.width || 95,
          height: activeDef.height || 101,
          svg: activeDef.svg
        };

        if (mainCanvas) {
          dupCostume.canvas = document.createElement("canvas");
          dupCostume.canvas.width = mainCanvas.width;
          dupCostume.canvas.height = mainCanvas.height;
          dupCostume.canvas.getContext("2d").drawImage(mainCanvas, 0, 0);
        }

        COSTUME_DEFINITIONS.push(dupCostume);
        state.sprite.costume = dupName;
        if (typeof refreshAssetBlockOptions === "function") refreshAssetBlockOptions();
        if (typeof renderStage === "function") renderStage();
        renderCostumesList();
        loadCostumeToEditor();
        showScratchToast(`Kostum berhasil diduplikat sebagai "${dupName}".`, "📋");
      });
    }

    // Popover: Unggah Berkas Gambar
    if (btnUpload && fileInput) {
      btnUpload.addEventListener("click", () => {
        if (costumePopover) costumePopover.classList.remove("open");
        fileInput.click();
      });

      fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          const img = new Image();
          img.onload = () => {
            const rawName = file.name.replace(/\.[^/.]+$/, "").replace(/\s+/g, "_");
            const newName = rawName || `costume${COSTUME_DEFINITIONS.length + 1}`;
            const cv = document.createElement("canvas");
            cv.width = 480;
            cv.height = 360;
            const ctx = cv.getContext("2d");
            const posX = (480 - Math.min(img.width, 240)) / 2;
            const posY = (360 - Math.min(img.height, 240)) / 2;
            ctx.drawImage(img, posX, posY, Math.min(img.width, 240), Math.min(img.height, 240));

            const newCostume = {
              name: newName,
              color: "#FFAB19",
              width: img.width || 100,
              height: img.height || 100,
              canvas: cv
            };

            COSTUME_DEFINITIONS.push(newCostume);
            state.sprite.costume = newName;
            if (typeof refreshAssetBlockOptions === "function") refreshAssetBlockOptions();
            if (typeof renderStage === "function") renderStage();
            renderCostumesList();
            loadCostumeToEditor();
            showScratchToast(`Kostum "${newName}" berhasil diunggah!`, "🖼️");
          };
          img.src = loadEvent.target.result;
        };
        reader.readAsDataURL(file);
        fileInput.value = "";
      });
    }

    // Switch Editor Tab (Code, Costumes, Sounds)
    window.switchEditorTab = function(tab) {
      const isCode = tab === "code";
      const isCostumes = tab === "costumes";
      const isSounds = tab === "sounds";

      if (tabCode) {
        tabCode.classList.toggle("active", isCode);
        tabCode.setAttribute("aria-selected", String(isCode));
      }
      if (tabCostumes) {
        tabCostumes.classList.toggle("active", isCostumes);
        tabCostumes.setAttribute("aria-selected", String(isCostumes));
      }
      if (tabSounds) {
        tabSounds.classList.toggle("active", isSounds);
        tabSounds.setAttribute("aria-selected", String(isSounds));
      }

      const codeTabContent = document.getElementById("code-tab-content");
      if (codeTabContent) {
        codeTabContent.style.display = isCode ? "flex" : "none";
      } else {
        if (codeArea) codeArea.style.display = isCode ? "" : "none";
        if (categoriesSidebar) categoriesSidebar.style.display = isCode ? "" : "none";
        if (palettePanel) palettePanel.style.display = isCode ? "" : "none";
      }
      if (costumesPanel) costumesPanel.style.display = isCostumes ? "flex" : "none";
      if (soundsPanel) {
        soundsPanel.hidden = !isSounds;
        soundsPanel.style.display = isSounds ? "flex" : "none";
      }

      if (isCostumes) {
        renderCostumesList();
        loadCostumeToEditor();
      }
      if (isSounds && typeof renderSoundsTab === "function") {
        renderSoundsTab();
      } else if (!isSounds && typeof stopPreview === "function") {
        stopPreview();
      }
    };

    tabCode.addEventListener("click", () => switchEditorTab("code"));
    tabCostumes.addEventListener("click", () => switchEditorTab("costumes"));
    tabSounds.addEventListener("click", () => switchEditorTab("sounds"));
  }

  // ---------- SISTEM MULTI-BAHASA (I18N), THEME & COLOR MODE ----------
  const I18N_DATA = {
    id: {
      settings: "Pengaturan",
      language: "Bahasa (Language)",
      color_mode: "Mode Warna Blok",
      color_original: "Original (Bawaan)",
      color_contrast: "Kontras Tinggi (High Contrast)",
      theme: "Tema Tampilan",
      theme_purple: "Scratch Purple",
      theme_emerald: "Ruang KKA Emerald",
      theme_dark: "Mode Gelap (Dark)",
      file: "Berkas",
      new_project: "Baru",
      load_project: "Muat dari komputermu",
      save_project: "Simpan ke komputermu",
      export_html: "Ekspor ke HTML Player",
      convert_html: "Konversi File ke HTML...",
      edit: "Edit",
      restore: "Pulihkan Area Kerja",
      turbo_on: "Nyalakan Mode Turbo",
      turbo_off: "Matikan Mode Turbo",
      tutorials: "Tutorial",
      debug: "Debug & Misi",
      code: "Kode",
      costumes: "Kostum",
      sounds: "Suara",
      workspace_hint: "Seret & tempatkan blok di tab Kode",
      join: "Gabung Scratch",
      sign_in: "Masuk",
      cat_motion: "Gerakan",
      cat_looks: "Tampilan",
      cat_sound: "Suara",
      cat_events: "Kejadian",
      cat_control: "Kontrol",
      cat_sensing: "Sensor",
      cat_operators: "Operator",
      cat_variables: "Variabel",
      cat_myblocks: "Balok Saya",
      already_home: "Kamu sedang berada di Scratch Studio Ruang KKA! 🐱",
      toast_save: "Proyek disimpan ke komputer",
      toast_load: "Proyek berhasil dimuat!",
      toast_turbo: "Mode Turbo"
    },
    en: {
      settings: "Settings",
      language: "Language",
      color_mode: "Color Mode",
      color_original: "Original",
      color_contrast: "High Contrast",
      theme: "Theme",
      theme_purple: "Scratch Purple",
      theme_emerald: "Ruang KKA Emerald",
      theme_dark: "Dark Mode",
      file: "File",
      new_project: "New",
      load_project: "Load from your computer",
      save_project: "Save to your computer",
      export_html: "Export to HTML Player",
      convert_html: "Convert File to HTML...",
      edit: "Edit",
      restore: "Restore",
      turbo_on: "Turn on Turbo Mode",
      turbo_off: "Turn off Turbo Mode",
      tutorials: "Tutorials",
      debug: "Debug",
      code: "Code",
      costumes: "Costumes",
      sounds: "Sounds",
      workspace_hint: "Drag and drop blocks to code",
      join: "Join Scratch",
      sign_in: "Sign in",
      cat_motion: "Motion",
      cat_looks: "Looks",
      cat_sound: "Sound",
      cat_events: "Events",
      cat_control: "Control",
      cat_sensing: "Sensing",
      cat_operators: "Operators",
      cat_variables: "Variables",
      cat_myblocks: "My Blocks",
      already_home: "You are currently in Ruang KKA Scratch Studio! 🐱",
      toast_save: "Project saved to your computer",
      toast_load: "Project loaded successfully!",
      toast_turbo: "Turbo Mode"
    },
    ms: {
      settings: "Tetapan",
      language: "Bahasa",
      color_mode: "Mod Warna",
      color_original: "Asal",
      color_contrast: "Kontras Tinggi",
      theme: "Tema",
      theme_purple: "Scratch Ungu",
      theme_emerald: "Ruang KKA Zamrud",
      theme_dark: "Mod Gelap",
      file: "Fail",
      new_project: "Baharu",
      load_project: "Muat naik dari komputer",
      save_project: "Simpan ke komputer",
      edit: "Sunting",
      restore: "Pulihkan",
      turbo_on: "Hidupkan Mod Turbo",
      turbo_off: "Matikan Mod Turbo",
      tutorials: "Tutorial",
      debug: "Nyahpepijat",
      code: "Kod",
      costumes: "Kostum",
      sounds: "Bunyi",
      workspace_hint: "Seret dan lepas blok untuk mengekod",
      join: "Sertai Scratch",
      sign_in: "Log masuk",
      cat_motion: "Gerakan",
      cat_looks: "Rupa",
      cat_sound: "Bunyi",
      cat_events: "Peristiwa",
      cat_control: "Kawalan",
      cat_sensing: "Deria",
      cat_operators: "Pengendali",
      cat_variables: "Pemboleh ubah",
      cat_myblocks: "Blok Saya",
      already_home: "Anda sedang berada di Scratch Studio Ruang KKA! 🐱",
      toast_save: "Projek disimpan ke komputer",
      toast_load: "Projek berjaya dimuatkan!",
      toast_turbo: "Mod Turbo"
    },
    es: {
      settings: "Ajustes",
      language: "Idioma",
      color_mode: "Modo de Color",
      color_original: "Original",
      color_contrast: "Alto Contraste",
      theme: "Tema",
      theme_purple: "Scratch Morado",
      theme_emerald: "Ruang KKA Esmeralda",
      theme_dark: "Modo Oscuro",
      file: "Archivo",
      new_project: "Nuevo",
      load_project: "Cargar desde tu ordenador",
      save_project: "Guardar en tu ordenador",
      edit: "Editar",
      restore: "Restaurar",
      turbo_on: "Activar modo turbo",
      turbo_off: "Desactivar modo turbo",
      tutorials: "Tutoriales",
      debug: "Depurar",
      code: "Código",
      costumes: "Disfraces",
      sounds: "Sonidos",
      workspace_hint: "Arrastra y suelta bloques para programar",
      join: "Únete a Scratch",
      sign_in: "Iniciar sesión",
      cat_motion: "Movimiento",
      cat_looks: "Apariencia",
      cat_sound: "Sonido",
      cat_events: "Eventos",
      cat_control: "Control",
      cat_sensing: "Sensores",
      cat_operators: "Operadores",
      cat_variables: "Variables",
      cat_myblocks: "Mis bloques",
      already_home: "¡Estás en Ruang KKA Scratch Studio! 🐱",
      toast_save: "Proyecto guardado",
      toast_load: "¡Proyecto cargado con éxito!",
      toast_turbo: "Modo Turbo"
    },
    fr: {
      settings: "Paramètres",
      language: "Langue",
      color_mode: "Mode de couleur",
      color_original: "Original",
      color_contrast: "Contraste élevé",
      theme: "Thème",
      theme_purple: "Scratch Violet",
      theme_emerald: "Ruang KKA Émeraude",
      theme_dark: "Mode Sombre",
      file: "Fichier",
      new_project: "Nouveau",
      load_project: "Importer depuis votre ordinateur",
      save_project: "Sauvegarder sur votre ordinateur",
      edit: "Éditer",
      restore: "Restaurer",
      turbo_on: "Activer le mode turbo",
      turbo_off: "Désactiver le mode turbo",
      tutorials: "Tutoriels",
      debug: "Déboguer",
      code: "Code",
      costumes: "Costumes",
      sounds: "Sons",
      workspace_hint: "Glissez et déposez des blocs pour coder",
      join: "Rejoindre Scratch",
      sign_in: "Se connecter",
      cat_motion: "Mouvement",
      cat_looks: "Apparence",
      cat_sound: "Sons",
      cat_events: "Événements",
      cat_control: "Contrôle",
      cat_sensing: "Capteurs",
      cat_operators: "Opérateurs",
      cat_variables: "Variables",
      cat_myblocks: "Mes Blocs",
      already_home: "Vous êtes déjà dans le studio Ruang KKA Scratch ! 🐱",
      toast_save: "Projet enregistré",
      toast_load: "Projet chargé avec succès !",
      toast_turbo: "Mode Turbo"
    },
    de: {
      settings: "Einstellungen",
      language: "Sprache",
      color_mode: "Farbmodus",
      color_original: "Original",
      color_contrast: "Hoher Kontrast",
      theme: "Design",
      theme_purple: "Scratch Lila",
      theme_emerald: "Ruang KKA Smaragd",
      theme_dark: "Dunkelmodus",
      file: "Datei",
      new_project: "Neu",
      load_project: "Hochladen von deinem Computer",
      save_project: "Auf deinem Computer speichern",
      edit: "Bearbeiten",
      restore: "Wiederherstellen",
      turbo_on: "Turbo-Modus einschalten",
      turbo_off: "Turbo-Modus ausschalten",
      tutorials: "Tutorials",
      debug: "Fehler suchen",
      code: "Skripte",
      costumes: "Kostüme",
      sounds: "Klänge",
      workspace_hint: "Blöcke zum Programmieren ziehen",
      join: "Scratch beitreten",
      sign_in: "Anmelden",
      cat_motion: "Bewegung",
      cat_looks: "Aussehen",
      cat_sound: "Klang",
      cat_events: "Ereignisse",
      cat_control: "Steuerung",
      cat_sensing: "Fühlen",
      cat_operators: "Operatoren",
      cat_variables: "Variablen",
      cat_myblocks: "Meine Blöcke",
      already_home: "Du bist bereits im Ruang KKA Scratch Studio! 🐱",
      toast_save: "Projekt gespeichert",
      toast_load: "Projekt erfolgreich geladen!",
      toast_turbo: "Turbo-Modus"
    },
    ja: {
      settings: "設定",
      language: "言語",
      color_mode: "カラーモード",
      color_original: "オリジナル",
      color_contrast: "ハイコントラスト",
      theme: "テーマ",
      theme_purple: "Scratchパープル",
      theme_emerald: "Ruang KKAエメラルド",
      theme_dark: "ダークモード",
      file: "ファイル",
      new_project: "新規",
      load_project: "手元のコンピューターから読み込む",
      save_project: "手元のコンピューターに保存する",
      edit: "編集",
      restore: "復元",
      turbo_on: "ターボモードにする",
      turbo_off: "ターボモードをオフにする",
      tutorials: "チュートリアル",
      debug: "デバッグ",
      code: "コード",
      costumes: "コスチューム",
      sounds: "音",
      workspace_hint: "ブロックを配置してプログラミング",
      join: "Scratchに参加しよう",
      sign_in: "サインイン",
      cat_motion: "動き",
      cat_looks: "見た目",
      cat_sound: "音",
      cat_events: "イベント",
      cat_control: "制御",
      cat_sensing: "調べる",
      cat_operators: "演算",
      cat_variables: "変数",
      cat_myblocks: "定義",
      already_home: "Ruang KKA Scratchスタジオにいます！🐱",
      toast_save: "プロジェクトを保存しました",
      toast_load: "プロジェクトを読み込みました！",
      toast_turbo: "ターボモード"
    },
    ko: {
      settings: "설정",
      language: "언어",
      color_mode: "색상 모드",
      color_original: "기본값",
      color_contrast: "고대비",
      theme: "테마",
      theme_purple: "스크래치 퍼플",
      theme_emerald: "Ruang KKA 에메랄드",
      theme_dark: "다크 모드",
      file: "파일",
      new_project: "새로 만들기",
      load_project: "내 컴퓨터에서 로드",
      save_project: "내 컴퓨터에 저장",
      edit: "편집",
      restore: "실행 취소/복원",
      turbo_on: "터보 모드 켜기",
      turbo_off: "터보 모드 끄기",
      tutorials: "튜토리얼",
      debug: "디버그",
      code: "코드",
      costumes: "모양",
      sounds: "소리",
      workspace_hint: "블록을 끌어다 놓아 코딩하세요",
      join: "Scratch 가입",
      sign_in: "로그인",
      cat_motion: "동작",
      cat_looks: "형태",
      cat_sound: "소리",
      cat_events: "이벤트",
      cat_control: "제어",
      cat_sensing: "감지",
      cat_operators: "연산",
      cat_variables: "변수",
      cat_myblocks: "내 블록",
      already_home: "현재 Ruang KKA Scratch 스튜디오에 있습니다! 🐱",
      toast_save: "프로젝트가 저장되었습니다",
      toast_load: "프로젝트를 불러왔습니다!",
      toast_turbo: "터보 모드"
    },
    zh: {
      settings: "设置",
      language: "语言",
      color_mode: "色彩模式",
      color_original: "原始",
      color_contrast: "高对比度",
      theme: "主题",
      theme_purple: "Scratch经典紫",
      theme_emerald: "Ruang KKA翡翠绿",
      theme_dark: "深色模式",
      file: "文件",
      new_project: "新建",
      load_project: "从电脑中加载",
      save_project: "保存到电脑",
      edit: "编辑",
      restore: "恢复",
      turbo_on: "开启加速模式",
      turbo_off: "关闭加速模式",
      tutorials: "教程",
      debug: "调试",
      code: "代码",
      costumes: "造型",
      sounds: "声音",
      workspace_hint: "拖拽积木进行编程",
      join: "加入Scratch",
      sign_in: "登录",
      cat_motion: "运动",
      cat_looks: "外观",
      cat_sound: "声音",
      cat_events: "事件",
      cat_control: "控制",
      cat_sensing: "侦测",
      cat_operators: "运算",
      cat_variables: "变量",
      cat_myblocks: "自制积木",
      already_home: "您已在Ruang KKA Scratch编程工作室！🐱",
      toast_save: "项目已保存到电脑",
      toast_load: "项目加载成功！",
      toast_turbo: "加速模式"
    },
    zht: {
      settings: "設定",
      language: "語言",
      color_mode: "顏色模式",
      color_original: "原始",
      color_contrast: "高對比",
      theme: "主題",
      theme_purple: "Scratch紫",
      theme_emerald: "Ruang KKA翡翠綠",
      theme_dark: "深色模式",
      file: "檔案",
      new_project: "新建",
      load_project: "從電腦上傳",
      save_project: "下載到電腦",
      edit: "編輯",
      restore: "復原",
      turbo_on: "開啟加速模式",
      turbo_off: "關閉加速模式",
      tutorials: "教學",
      debug: "除錯",
      code: "程式碼",
      costumes: "造型",
      sounds: "音效",
      workspace_hint: "拖曳積木編寫程式",
      join: "加入Scratch",
      sign_in: "登入",
      cat_motion: "動作",
      cat_looks: "外觀",
      cat_sound: "音效",
      cat_events: "事件",
      cat_control: "控制",
      cat_sensing: "偵測",
      cat_operators: "運算",
      cat_variables: "變數",
      cat_myblocks: "更多積木",
      already_home: "您正在Ruang KKA Scratch工作坊！🐱",
      toast_save: "專案已儲存",
      toast_load: "專案載入成功！",
      toast_turbo: "加速模式"
    },
    ar: {
      settings: "الإعدادات",
      language: "اللغة",
      color_mode: "وضع الألوان",
      color_original: "الأصلي",
      color_contrast: "تباين عالي",
      theme: "المظهر",
      theme_purple: "سكراتش البنفسجي",
      theme_emerald: "رقة الزمرد Ruang KKA",
      theme_dark: "الوضع الداكن",
      file: "ملف",
      new_project: "جديد",
      load_project: "التحميل من حاسوبك",
      save_project: "الحفظ إلى حاسوبك",
      edit: "تحرير",
      restore: "استعادة",
      turbo_on: "تشغيل الوضع السريع",
      turbo_off: "إيقاف الوضع السريع",
      tutorials: "دروس",
      debug: "تصحيح",
      code: "المقاطع البرمجية",
      costumes: "المظاهر",
      sounds: "الأصوات",
      workspace_hint: "اسحب اللبنات هنا للبرمجة",
      join: "انضم إلى سكراتش",
      sign_in: "تسجيل الدخول",
      cat_motion: "الحركة",
      cat_looks: "الهيئة",
      cat_sound: "الصوت",
      cat_events: "الأحداث",
      cat_control: "التحكم",
      cat_sensing: "الاستشعار",
      cat_operators: "العمليات",
      cat_variables: "المتغيرات",
      cat_myblocks: "لبناتي",
      already_home: "أنت الآن في استوديو سكراتش Ruang KKA! 🐱",
      toast_save: "تم حفظ المشروع",
      toast_load: "تم تحميل المشروع بنجاح!",
      toast_turbo: "الوضع السريع"
    },
    ru: {
      settings: "Настройки",
      language: "Язык",
      color_mode: "Цветовой режим",
      color_original: "Оригинальный",
      color_contrast: "Высокий контраст",
      theme: "Тема",
      theme_purple: "Scratch Фиолетовый",
      theme_emerald: "Ruang KKA Изумрудный",
      theme_dark: "Тёмная тема",
      file: "Файл",
      new_project: "Новый",
      load_project: "Загрузить с компьютера",
      save_project: "Сохранить на компьютер",
      edit: "Редактировать",
      restore: "Восстановить",
      turbo_on: "Включить турбо-режим",
      turbo_off: "Выключить турбо-режим",
      tutorials: "Руководства",
      debug: "Отладка",
      code: "Код",
      costumes: "Костюмы",
      sounds: "Звуки",
      workspace_hint: "Перетаскивайте блоки для кодинга",
      join: "Присоединиться к Scratch",
      sign_in: "Войти",
      cat_motion: "Движение",
      cat_looks: "Внешний вид",
      cat_sound: "Звук",
      cat_events: "События",
      cat_control: "Управление",
      cat_sensing: "Сенсоры",
      cat_operators: "Операторы",
      cat_variables: "Переменные",
      cat_myblocks: "Другие блоки",
      already_home: "Вы находитесь в Scratch Studio Ruang KKA! 🐱",
      toast_save: "Проект сохранён",
      toast_load: "Проект загружен!",
      toast_turbo: "Турбо-режим"
    },
    pt: {
      settings: "Configurações",
      language: "Idioma",
      color_mode: "Modo de Cor",
      color_original: "Original",
      color_contrast: "Alto Contraste",
      theme: "Tema",
      theme_purple: "Scratch Roxo",
      theme_emerald: "Ruang KKA Esmeralda",
      theme_dark: "Modo Escuro",
      file: "Arquivo",
      new_project: "Novo",
      load_project: "Carregar do computador",
      save_project: "Baixar para o computador",
      edit: "Editar",
      restore: "Restaurar",
      turbo_on: "Ligar Modo Turbo",
      turbo_off: "Desligar Modo Turbo",
      tutorials: "Tutoriais",
      debug: "Depurar",
      code: "Código",
      costumes: "Fantasias",
      sounds: "Sons",
      workspace_hint: "Arraste e solte blocos para programar",
      join: "Participe do Scratch",
      sign_in: "Entrar",
      cat_motion: "Movimento",
      cat_looks: "Aparência",
      cat_sound: "Som",
      cat_events: "Eventos",
      cat_control: "Controle",
      cat_sensing: "Sensores",
      cat_operators: "Operadores",
      cat_variables: "Variáveis",
      cat_myblocks: "Meus Blocos",
      already_home: "Você está no Scratch Studio Ruang KKA! 🐱",
      toast_save: "Projeto salvo",
      toast_load: "Projeto carregado com sucesso!",
      toast_turbo: "Modo Turbo"
    },
    it: {
      settings: "Impostazioni",
      language: "Lingua",
      color_mode: "Modalità colore",
      color_original: "Originale",
      color_contrast: "Alto contrasto",
      theme: "Tema",
      theme_purple: "Scratch Viola",
      theme_emerald: "Ruang KKA Smeraldo",
      theme_dark: "Modalità Scura",
      file: "File",
      new_project: "Nuovo",
      load_project: "Carica dal tuo computer",
      save_project: "Salva sul tuo computer",
      edit: "Modifica",
      restore: "Ripristina",
      turbo_on: "Attiva modalità turbo",
      turbo_off: "Disattiva modalità turbo",
      tutorials: "Tutorial",
      debug: "Debug",
      code: "Codice",
      costumes: "Costumi",
      sounds: "Suoni",
      workspace_hint: "Trascina e rilascia i blocchi per programmare",
      join: "Unisciti a Scratch",
      sign_in: "Accedi",
      cat_motion: "Movimento",
      cat_looks: "Aspetto",
      cat_sound: "Suono",
      cat_events: "Situazioni",
      cat_control: "Controllo",
      cat_sensing: "Sensori",
      cat_operators: "Operatori",
      cat_variables: "Variabili",
      cat_myblocks: "I Miei Blocchi",
      already_home: "Sei nello Scratch Studio Ruang KKA! 🐱",
      toast_save: "Progetto salvato",
      toast_load: "Progetto caricato con successo!",
      toast_turbo: "Modalità Turbo"
    },
    nl: {
      settings: "Instellingen",
      language: "Taal",
      color_mode: "Kleurmodus",
      color_original: "Origineel",
      color_contrast: "Hoog contrast",
      theme: "Thema",
      theme_purple: "Scratch Paars",
      theme_emerald: "Ruang KKA Smaragd",
      theme_dark: "Donkere modus",
      file: "Bestand",
      new_project: "Nieuw",
      load_project: "Uploaden vanaf je computer",
      save_project: "Opslaan op je computer",
      edit: "Bewerken",
      restore: "Herstellen",
      turbo_on: "Turbomodus aanzetten",
      turbo_off: "Turbomodus uitzetten",
      tutorials: "Lessen",
      debug: "Debuggen",
      code: "Code",
      costumes: "Uiterlijken",
      sounds: "Geluiden",
      workspace_hint: "Sleep blokken om te programmeren",
      join: "Word Scratch-lid",
      sign_in: "Inloggen",
      cat_motion: "Beweging",
      cat_looks: "Uiterlijk",
      cat_sound: "Geluid",
      cat_events: "Gebeurtenissen",
      cat_control: "Besturen",
      cat_sensing: "Waarnemen",
      cat_operators: "Functies",
      cat_variables: "Variabelen",
      cat_myblocks: "Mijn blokken",
      already_home: "Je bent al in Ruang KKA Scratch Studio! 🐱",
      toast_save: "Project opgeslagen",
      toast_load: "Project succesvol geladen!",
      toast_turbo: "Turbomodus"
    },
    tr: {
      settings: "Ayarlar",
      language: "Dil",
      color_mode: "Renk Modu",
      color_original: "Orijinal",
      color_contrast: "Yüksek Kontrast",
      theme: "Tema",
      theme_purple: "Scratch Mor",
      theme_emerald: "Ruang KKA Zümrüt",
      theme_dark: "Koyu Mod",
      file: "Dosya",
      new_project: "Yeni",
      load_project: "Bilgisayarından yükle",
      save_project: "Bilgisayarına kaydet",
      edit: "Düzenle",
      restore: "Geri yükle",
      turbo_on: "Turbo Modunu Aç",
      turbo_off: "Turbo Modunu Kapat",
      tutorials: "Eğiticiler",
      debug: "Hata Ayıkla",
      code: "Kod",
      costumes: "Kostümler",
      sounds: "Sesler",
      workspace_hint: "Kodlamak için blokları sürükleyip bırakın",
      join: "Scratch'e Katıl",
      sign_in: "Giriş Yap",
      cat_motion: "Hareket",
      cat_looks: "Görünüm",
      cat_sound: "Ses",
      cat_events: "Olaylar",
      cat_control: "Kontrol",
      cat_sensing: "Algılama",
      cat_operators: "Operatörler",
      cat_variables: "Değişkenler",
      cat_myblocks: "Özel Bloklar",
      already_home: "Ruang KKA Scratch Stüdyosundasınız! 🐱",
      toast_save: "Proje kaydedildi",
      toast_load: "Proje başarıyla yüklendi!",
      toast_turbo: "Turbo Modu"
    },
    pl: {
      settings: "Ustawienia",
      language: "Język",
      color_mode: "Tryb kolorów",
      color_original: "Oryginalny",
      color_contrast: "Wysoki kontrast",
      theme: "Motyw",
      theme_purple: "Scratch Fioletowy",
      theme_emerald: "Ruang KKA Szmaragd",
      theme_dark: "Tryb ciemny",
      file: "Plik",
      new_project: "Nowy",
      load_project: "Wczytaj ze swojego komputera",
      save_project: "Zapisz na swoim komputerze",
      edit: "Edycja",
      restore: "Przywróć",
      turbo_on: "Włącz tryb turbo",
      turbo_off: "Wyłącz tryb turbo",
      tutorials: "Samouczki",
      debug: "Debuguj",
      code: "Kod",
      costumes: "Kostiumy",
      sounds: "Dźwięki",
      workspace_hint: "Przeciągnij bloki, aby kodować",
      join: "Dołącz do Scratch",
      sign_in: "Zaloguj się",
      cat_motion: "Ruch",
      cat_looks: "Wygląd",
      cat_sound: "Dźwięk",
      cat_events: "Zdarzenia",
      cat_control: "Kontrola",
      cat_sensing: "Czujniki",
      cat_operators: "Wyrażenia",
      cat_variables: "Zmienne",
      cat_myblocks: "Moje bloki",
      already_home: "Jesteś w Scratch Studio Ruang KKA! 🐱",
      toast_save: "Projekt zapisany",
      toast_load: "Projekt wczytany pomyślnie!",
      toast_turbo: "Tryb Turbo"
    },
    vi: {
      settings: "Cài đặt",
      language: "Ngôn ngữ",
      color_mode: "Chế độ màu",
      color_original: "Gốc",
      color_contrast: "Tương phản cao",
      theme: "Giao diện",
      theme_purple: "Scratch Tím",
      theme_emerald: "Ruang KKA Ngọc lục bảo",
      theme_dark: "Chế độ tối",
      file: "Tập tin",
      new_project: "Mới",
      load_project: "Mở từ máy tính",
      save_project: "Lưu về máy tính",
      edit: "Chỉnh sửa",
      restore: "Khôi phục",
      turbo_on: "Bật chế độ Turbo",
      turbo_off: "Tắt chế độ Turbo",
      tutorials: "Hướng dẫn",
      debug: "Gỡ lỗi",
      code: "Mã",
      costumes: "Trang phục",
      sounds: "Âm thanh",
      workspace_hint: "Kéo thả khối để lập trình",
      join: "Tham gia Scratch",
      sign_in: "Đăng nhập",
      cat_motion: "Chuyển động",
      cat_looks: "Hiển thị",
      cat_sound: "Âm thanh",
      cat_events: "Sự kiện",
      cat_control: "Điều khiển",
      cat_sensing: "Cảm biến",
      cat_operators: "Các phép toán",
      cat_variables: "Các biến số",
      cat_myblocks: "Khối của tôi",
      already_home: "Bạn đang ở trong Ruang KKA Scratch Studio! 🐱",
      toast_save: "Đã lưu dự án",
      toast_load: "Đã tải dự án thành công!",
      toast_turbo: "Chế độ Turbo"
    },
    hi: {
      settings: "सेटिंग्स",
      language: "भाषा",
      color_mode: "रंग मोड",
      color_original: "मूल",
      color_contrast: "उच्च कंट्रास्ट",
      theme: "थीम",
      theme_purple: "स्क्रैच बैंगनी",
      theme_emerald: "Ruang KKA पन्ना",
      theme_dark: "डार्क मोड",
      file: "फ़ाइल",
      new_project: "नया",
      load_project: "कंप्यूटर से लोड करें",
      save_project: "कंप्यूटर में सहेजें",
      edit: "संपादन",
      restore: "पुनर्स्थापित करें",
      turbo_on: "टर्बो मोड चालू करें",
      turbo_off: "टर्बो मोड बंद करें",
      tutorials: "ट्यूटोरियल",
      debug: "डिबग",
      code: "कोड",
      costumes: "वेशभूषा",
      sounds: "ध्वनियाँ",
      workspace_hint: "कोडिंग के लिए ब्लॉक खींचें",
      join: "स्क्रैच से जुड़ें",
      sign_in: "साइन इन करें",
      cat_motion: "गति",
      cat_looks: "दिखावट",
      cat_sound: "ध्वनि",
      cat_events: "घटनाएं",
      cat_control: "नियंत्रण",
      cat_sensing: "सेंसर",
      cat_operators: "ऑपरेटर्स",
      cat_variables: "चर",
      cat_myblocks: "मेरे ब्लॉक",
      already_home: "आप Ruang KKA स्क्रैच स्टूडियो में हैं! 🐱",
      toast_save: "प्रोजेक्ट सहेजा गया",
      toast_load: "प्रोजेक्ट लोड हो गया!",
      toast_turbo: "टर्बो मोड"
    },
    th: {
      settings: "การตั้งค่า",
      language: "ภาษา",
      color_mode: "โหมดสี",
      color_original: "ดั้งเดิม",
      color_contrast: "คอนทราสต์สูง",
      theme: "ธีม",
      theme_purple: "Scratch สีม่วง",
      theme_emerald: "Ruang KKA มรกต",
      theme_dark: "โหมดมืด",
      file: "ไฟล์",
      new_project: "ใหม่",
      load_project: "โหลดจากคอมพิวเตอร์",
      save_project: "บันทึกลงคอมพิวเตอร์",
      edit: "แก้ไข",
      restore: "กู้คืน",
      turbo_on: "เปิดโหมดเทอร์โบ",
      turbo_off: "ปิดโหมดเทอร์โบ",
      tutorials: "บทเรียน",
      debug: "ดีบัก",
      code: "โค้ด",
      costumes: "คอสตูม",
      sounds: "เสียง",
      workspace_hint: "ลากบล็อกเพื่อเขียนโปรแกรม",
      join: "เข้าร่วม Scratch",
      sign_in: "เข้าสู่ระบบ",
      cat_motion: "การเคลื่อนที่",
      cat_looks: "รูปลักษณ์",
      cat_sound: "เสียง",
      cat_events: "เหตุการณ์",
      cat_control: "ควบคุม",
      cat_sensing: "ตรวจจับ",
      cat_operators: "ตัวดำเนินการ",
      cat_variables: "ตัวแปร",
      cat_myblocks: "บล็อกของฉัน",
      already_home: "คุณอยู่ในสตูดิโอ Ruang KKA Scratch แล้ว! 🐱",
      toast_save: "บันทึกโปรเจกต์แล้ว",
      toast_load: "โหลดโปรเจกต์สำเร็จ!",
      toast_turbo: "โหมดเทอร์โบ"
    }
  };

  let currentLang = localStorage.getItem("scratch_ui_lang") || "id";
  let currentColorMode = localStorage.getItem("scratch_color_mode") || "original";
  let currentTheme = localStorage.getItem("scratch_theme") || "emerald";

  function getI18nText(key) {
    const dict = I18N_DATA[currentLang] || I18N_DATA.id;
    return dict[key] || I18N_DATA.en[key] || key;
  }
  window.getI18nText = getI18nText;

  function applyLanguage(lang) {
    if (!I18N_DATA[lang]) lang = "en";
    currentLang = lang;
    localStorage.setItem("scratch_ui_lang", lang);

    const dict = I18N_DATA[lang] || I18N_DATA.en;

    // 1. Update elemen ber-data-i18n
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });

    // 2. Update teks kategori di sidebar
    document.querySelectorAll("[data-i18n-cat]").forEach(el => {
      const cat = el.getAttribute("data-i18n-cat");
      const key = "cat_" + cat;
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });

    // 3. Update tombol turbo text sesuai status
    const turboTextEl = document.getElementById("menu-turbo-text");
    if (turboTextEl) {
      turboTextEl.textContent = state.turboMode ? dict.turbo_off : dict.turbo_on;
    }

    // 4. Update status tombol aktif di dropdown bahasa
    document.querySelectorAll(".lang-opt-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
    });

    showScratchToast(`${dict.language}: <strong>${lang.toUpperCase()}</strong>`, "🌐");
  }
  window.applyLanguage = applyLanguage;

  function applyColorMode(mode) {
    currentColorMode = mode;
    localStorage.setItem("scratch_color_mode", mode);
    document.documentElement.setAttribute("data-color-mode", mode);

    document.querySelectorAll("[data-color-mode]").forEach(el => {
      const m = el.getAttribute("data-color-mode");
      el.classList.toggle("active-check", m === mode);
    });

    showScratchToast(`${getI18nText("color_mode")}: <strong>${mode === "high-contrast" ? getI18nText("color_contrast") : getI18nText("color_original")}</strong>`, "🎨");
  }
  window.applyColorMode = applyColorMode;

  function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem("scratch_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);

    document.querySelectorAll("[data-theme-name]").forEach(el => {
      const t = el.getAttribute("data-theme-name");
      el.classList.toggle("active-check", t === theme);
    });

    showScratchToast(`${getI18nText("theme")}: <strong>${theme.toUpperCase()}</strong>`, "✨");
  }
  window.applyTheme = applyTheme;

  // ---------- INISIALISASI UI & EVENT LISTENERS ----------
  function initProjectUI() {
    // 0. Terapkan preferensi awal
    applyLanguage(currentLang);
    applyColorMode(currentColorMode);
    applyTheme(currentTheme);

    // 1. Logo Brand Ruang KKA (Klik Tetap di Halaman Scratch)
    const brandLogoBtn = document.getElementById("brand-logo-btn");
    if (brandLogoBtn) {
      brandLogoBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showScratchToast(getI18nText("already_home"), "🐱");
      });
    }

    // 2. Dropdown Settings (Bahasa, Color Mode, Theme)
    const menuSettingsBtn = document.getElementById("menu-settings-btn");
    const menuSettingsDropdown = document.getElementById("menu-settings-dropdown");
    if (menuSettingsBtn && menuSettingsDropdown) {
      menuSettingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = menuSettingsDropdown.classList.contains("show");
        document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
        if (!isOpen) menuSettingsDropdown.classList.add("show");
      });
    }

    // Filter pencarian bahasa di menu settings
    const langSearchInput = document.getElementById("lang-search-input");
    if (langSearchInput) {
      langSearchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        document.querySelectorAll("#settings-lang-list .lang-opt-btn").forEach(btn => {
          const text = btn.textContent.toLowerCase();
          btn.style.display = text.includes(query) ? "" : "none";
        });
      });
    }

    // Tombol pilihan bahasa
    document.querySelectorAll(".lang-opt-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const lang = btn.getAttribute("data-lang");
        applyLanguage(lang);
      });
    });

    // Pilihan Color Mode
    document.querySelectorAll("[data-color-mode]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const mode = btn.getAttribute("data-color-mode");
        applyColorMode(mode);
      });
    });

    // Pilihan Theme
    document.querySelectorAll("[data-theme-name]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const theme = btn.getAttribute("data-theme-name");
        applyTheme(theme);
      });
    });

    // 3. Judul Projek
    const titleInput = document.getElementById("project-title-input");
    if (titleInput) {
      const savedTitle = localStorage.getItem("kka_scratch_project_title");
      if (savedTitle) titleInput.value = savedTitle;
      titleInput.addEventListener("input", (e) => {
        localStorage.setItem("kka_scratch_project_title", e.target.value);
      });
    }

    // 4. Dropdown Berkas
    const menuFileBtn = document.getElementById("menu-file-btn");
    const menuFileDropdown = document.getElementById("menu-file-dropdown");
    if (menuFileBtn && menuFileDropdown) {
      menuFileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = menuFileDropdown.classList.contains("show");
        document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
        if (!isOpen) menuFileDropdown.classList.add("show");
      });
    }

    // 5. Dropdown Edit
    const menuEditBtn = document.getElementById("menu-edit-btn");
    const menuEditDropdown = document.getElementById("menu-edit-dropdown");
    if (menuEditBtn && menuEditDropdown) {
      menuEditBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = menuEditDropdown.classList.contains("show");
        document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
        if (!isOpen) menuEditDropdown.classList.add("show");
      });
    }

    // Tutup dropdown saat klik di luar
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".nav-dropdown-wrap")) {
        document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
      }
    });

    // 6. Menu Actions
    const itemNew = document.getElementById("menu-item-new");
    if (itemNew) itemNew.addEventListener("click", () => {
      document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
      createNewProject();
    });

    const itemSave = document.getElementById("menu-item-save");
    if (itemSave) itemSave.addEventListener("click", () => {
      document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
      exportProjectToFile();
    });

    // Ekspor langsung ke Standalone HTML Player
    const itemExportHTML = document.getElementById("menu-item-export-html");
    if (itemExportHTML) itemExportHTML.addEventListener("click", () => {
      document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
      exportProjectToHTML();
    });

    // Konversi file .kka.json / .json yang sudah diunduh ke HTML
    const convertFileInput = document.getElementById("convert-file-input");
    const itemConvertHTML = document.getElementById("menu-item-convert-html");
    if (itemConvertHTML && convertFileInput) {
      itemConvertHTML.addEventListener("click", () => {
        document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
        convertFileInput.value = "";
        convertFileInput.click();
      });
      convertFileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) convertFileToHTML(file);
      });
    }

    const fileInput = document.getElementById("project-file-input");
    const itemLoad = document.getElementById("menu-item-load");
    if (itemLoad && fileInput) {
      itemLoad.addEventListener("click", () => {
        document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
        fileInput.value = "";
        fileInput.click();
      });
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) importProjectFromFile(file);
      });
    }

    const itemTurbo = document.getElementById("menu-item-turbo");
    if (itemTurbo) itemTurbo.addEventListener("click", () => {
      document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
      toggleTurboMode();
    });

    const itemRestore = document.getElementById("menu-item-restore");
    if (itemRestore) itemRestore.addEventListener("click", () => {
      document.querySelectorAll(".nav-dropdown-menu").forEach(m => m.classList.remove("show"));
      if (window._lastSavedBackup) {
        deserializeProject(window._lastSavedBackup);
        showScratchToast(getI18nText("restore"), "↩️");
      } else {
        alert("Belum ada riwayat cadangan area kerja yang dapat dipulihkan.");
      }
    });

    // 7. Tombol Tutorials & Scratch 3.0 Tutorial Card (Getting Started)
    const tutorialCard = document.getElementById("scratch-tutorial-card");
    const btnTutorials = document.getElementById("btn-tutorials");
    const btnCloseTutorial = document.getElementById("tutorial-btn-close");
    const btnMinTutorial = document.getElementById("tutorial-btn-minimize");
    const btnPrevStep = document.getElementById("tutorial-prev-btn");
    const btnNextStep = document.getElementById("tutorial-next-btn");
    let currentStep = 1;
    const totalSteps = 5;

    function showTutorialStep(step) {
      currentStep = Math.max(1, Math.min(totalSteps, step));
      document.querySelectorAll(".tutorial-step-slide").forEach(slide => {
        slide.classList.toggle("active", parseInt(slide.dataset.step) === currentStep);
      });
      document.querySelectorAll("#tutorial-dots .t-dot").forEach((dot, idx) => {
        dot.classList.toggle("active", idx + 1 === currentStep);
      });
      if (btnPrevStep) btnPrevStep.disabled = currentStep === 1;
      if (btnNextStep) {
        btnNextStep.textContent = (currentStep === totalSteps) ? "Selesai ✓" : "Lanjut ▶";
      }
    }

    function openTutorialCard() {
      if (!tutorialCard) return;
      tutorialCard.style.display = "flex";
      tutorialCard.classList.remove("minimized");
      showTutorialStep(1);
    }

    if (btnTutorials) {
      btnTutorials.addEventListener("click", () => {
        if (!tutorialCard) return;
        if (tutorialCard.style.display === "none") {
          openTutorialCard();
        } else {
          tutorialCard.style.display = "none";
        }
      });
    }

    if (btnCloseTutorial && tutorialCard) {
      btnCloseTutorial.addEventListener("click", () => {
        tutorialCard.style.display = "none";
      });
    }

    if (btnMinTutorial && tutorialCard) {
      btnMinTutorial.addEventListener("click", () => {
        tutorialCard.classList.toggle("minimized");
        btnMinTutorial.textContent = tutorialCard.classList.contains("minimized") ? "+" : "−";
      });
    }

    if (btnPrevStep) {
      btnPrevStep.addEventListener("click", () => {
        showTutorialStep(currentStep - 1);
      });
    }
    if (btnNextStep) {
      btnNextStep.addEventListener("click", () => {
        if (currentStep < totalSteps) {
          showTutorialStep(currentStep + 1);
        } else {
          tutorialCard.style.display = "none";
          showScratchToast("Tutorial selesai! Selamat berkreasi 🎉", "🐱");
        }
      });
    }

    // Auto-open tutorial jika URL mengandung '?tutorial=getStarted'
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("tutorial") === "getStarted" || urlParams.has("tutorial")) {
      setTimeout(openTutorialCard, 450);
    }

    const addExtBtn = document.getElementById("add-extension-btn");
    if (addExtBtn) {
      addExtBtn.addEventListener("click", () => {
        showScratchToast("Fitur Ekstensi Scratch segera hadir!", "🧩");
      });
    }

    // 8. Stage Size Toggles (Small, Normal, Fullscreen)
    const stagePanel = document.querySelector(".stage-panel");
    const btnSmall = document.getElementById("stage-size-small");
    const btnNormal = document.getElementById("stage-size-normal");
    const btnFull = document.getElementById("stage-size-full");

    if (btnSmall && stagePanel) {
      btnSmall.addEventListener("click", () => {
        stagePanel.classList.add("stage-small");
        stagePanel.classList.remove("stage-normal");
        btnSmall.classList.add("active");
        btnNormal.classList.remove("active");
        if (typeof renderStage === "function") renderStage();
      });
    }
    if (btnNormal && stagePanel) {
      btnNormal.addEventListener("click", () => {
        stagePanel.classList.remove("stage-small");
        stagePanel.classList.add("stage-normal");
        btnNormal.classList.add("active");
        btnSmall.classList.remove("active");
        if (typeof renderStage === "function") renderStage();
      });
    }
    if (btnFull) {
      btnFull.addEventListener("click", () => {
        const stageWrapper = document.querySelector(".stage-wrapper");
        if (!stageWrapper) return;
        if (!document.fullscreenElement) {
          stageWrapper.requestFullscreen().catch(err => {
            alert("Layar penuh tidak didukung di peramban ini.");
          });
        } else {
          document.exitFullscreen();
        }
      });
    }

    // 9. Tab Kostum
    initCostumesTab();
  }

  // Jalankan saat DOM siap
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProjectUI);
  } else {
    initProjectUI();
  }

})();
