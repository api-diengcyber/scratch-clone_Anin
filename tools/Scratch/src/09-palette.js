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


