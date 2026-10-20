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
