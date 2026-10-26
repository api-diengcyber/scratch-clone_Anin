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


