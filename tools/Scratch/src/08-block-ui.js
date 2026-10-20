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


