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

