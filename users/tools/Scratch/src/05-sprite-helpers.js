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


