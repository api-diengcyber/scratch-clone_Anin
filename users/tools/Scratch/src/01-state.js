window.__keys = window.__keys || new Set();
window.mouseDown = false;
document.addEventListener("keydown", e => window.__keys.add(e.key === " " ? "space" : e.key));
document.addEventListener("keyup", e => window.__keys.delete(e.key === " " ? "space" : e.key));
document.addEventListener("pointerdown", () => window.mouseDown = true);
document.addEventListener("pointerup", () => window.mouseDown = false);


function getScratchCatSvg(costumeName) {
  const isWalk = costumeName === "costume2";
  if (isWalk) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="101" viewBox="0 0 96 101">
      <g id="costume2">
        <path d="M22 62 C15 50, 5 45, 2 52 C-1 59, 10 70, 18 72 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M28 72 L16 88 C14 91, 10 92, 7 89 C4 86, 6 82, 10 80 L22 68 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5" stroke-linejoin="round"/>
        <ellipse cx="9" cy="87" rx="7" ry="4" fill="#FFFFFF" stroke="#231F20" stroke-width="1.2" transform="rotate(-15 9 87)"/>
        <path d="M30 45 C24 55, 25 72, 38 76 C52 80, 58 65, 56 50 C55 42, 42 40, 30 45 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
        <path d="M36 52 C32 60, 34 71, 44 73 C49 74, 52 68, 51 58 C50 51, 42 49, 36 52 Z" fill="#FFF2CA"/>
        <path d="M46 70 L62 86 C65 89, 70 88, 72 85 C74 82, 72 78, 67 76 L52 65 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5" stroke-linejoin="round"/>
        <ellipse cx="68" cy="84" rx="7" ry="4" fill="#FFFFFF" stroke="#231F20" stroke-width="1.2" transform="rotate(20 68 84)"/>
        <path d="M34 50 L20 60 C18 62, 16 65, 18 68 C20 70, 23 70, 26 67 L38 56 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
        <path d="M50 50 L64 58 C67 60, 70 59, 72 56 C73 53, 71 50, 67 48 L52 44 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
        <path d="M46 8 C32 8, 22 18, 22 30 C22 43, 34 52, 48 52 C62 52, 72 42, 72 29 C72 16, 60 8, 46 8 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
        <path d="M28 14 L20 1 C19 -1, 16 0, 16 2 L19 22 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
        <path d="M23 14 L19 5 L20 18 Z" fill="#FFFFFF"/>
        <path d="M60 14 L68 1 C69 -1, 72 0, 72 2 L69 22 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
        <path d="M63 14 L67 5 L66 18 Z" fill="#FFFFFF"/>
        <ellipse cx="44" cy="38" rx="14" ry="10" fill="#FFF2CA" stroke="#231F20" stroke-width="1.2"/>
        <ellipse cx="56" cy="38" rx="12" ry="9" fill="#FFF2CA" stroke="#231F20" stroke-width="1.2"/>
        <ellipse cx="38" cy="24" rx="7" ry="10" fill="#FFFFFF" stroke="#231F20" stroke-width="1.5"/>
        <ellipse cx="40" cy="24" rx="3.5" ry="6" fill="#231F20"/>
        <ellipse cx="41" cy="22" rx="1.5" ry="2.5" fill="#FFFFFF"/>
        <ellipse cx="58" cy="24" rx="7" ry="10" fill="#FFFFFF" stroke="#231F20" stroke-width="1.5"/>
        <ellipse cx="56" cy="24" rx="3.5" ry="6" fill="#231F20"/>
        <ellipse cx="55" cy="22" rx="1.5" ry="2.5" fill="#FFFFFF"/>
        <polygon points="48,32 52,32 50,35" fill="#231F20"/>
        <path d="M46 36 Q50 39 54 36" fill="none" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="20" y1="32" x2="32" y2="34" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="18" y1="38" x2="31" y2="38" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="22" y1="44" x2="33" y2="42" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="64" y1="34" x2="76" y2="32" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="65" y1="38" x2="78" y2="38" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="63" y1="42" x2="74" y2="44" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
      </g>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="95" height="101" viewBox="0 0 95 101">
    <g id="costume1">
      <path d="M22 62 C14 52, 4 48, 2 55 C0 62, 10 72, 18 73 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M28 70 L26 88 C26 92, 22 94, 18 92 C14 90, 15 85, 18 82 L24 68 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5" stroke-linejoin="round"/>
      <ellipse cx="20" cy="89" rx="8" ry="4" fill="#FFFFFF" stroke="#231F20" stroke-width="1.2"/>
      <path d="M46 70 L50 88 C51 92, 55 94, 59 92 C63 90, 62 85, 59 82 L52 68 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5" stroke-linejoin="round"/>
      <ellipse cx="57" cy="89" rx="8" ry="4" fill="#FFFFFF" stroke="#231F20" stroke-width="1.2"/>
      <path d="M30 45 C24 55, 25 72, 38 76 C52 79, 58 66, 56 50 C55 42, 42 40, 30 45 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
      <path d="M36 52 C32 60, 34 71, 44 73 C49 74, 52 68, 51 58 C50 51, 42 49, 36 52 Z" fill="#FFF2CA"/>
      <path d="M32 50 L22 62 C20 65, 18 68, 21 70 C24 72, 27 70, 29 66 L38 55 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
      <path d="M48 50 L56 62 C58 65, 61 67, 64 65 C67 63, 67 60, 64 56 L54 48 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
      <path d="M46 8 C32 8, 22 18, 22 30 C22 43, 34 52, 48 52 C62 52, 72 42, 72 29 C72 16, 60 8, 46 8 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
      <path d="M28 14 L20 1 C19 -1, 16 0, 16 2 L19 22 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
      <path d="M23 14 L19 5 L20 18 Z" fill="#FFFFFF"/>
      <path d="M60 14 L68 1 C69 -1, 72 0, 72 2 L69 22 Z" fill="#FFAB19" stroke="#231F20" stroke-width="1.5"/>
      <path d="M63 14 L67 5 L66 18 Z" fill="#FFFFFF"/>
      <ellipse cx="44" cy="38" rx="14" ry="10" fill="#FFF2CA" stroke="#231F20" stroke-width="1.2"/>
      <ellipse cx="56" cy="38" rx="12" ry="9" fill="#FFF2CA" stroke="#231F20" stroke-width="1.2"/>
      <ellipse cx="38" cy="24" rx="7" ry="10" fill="#FFFFFF" stroke="#231F20" stroke-width="1.5"/>
      <ellipse cx="40" cy="24" rx="3.5" ry="6" fill="#231F20"/>
      <ellipse cx="41" cy="22" rx="1.5" ry="2.5" fill="#FFFFFF"/>
      <ellipse cx="58" cy="24" rx="7" ry="10" fill="#FFFFFF" stroke="#231F20" stroke-width="1.5"/>
      <ellipse cx="56" cy="24" rx="3.5" ry="6" fill="#231F20"/>
      <ellipse cx="55" cy="22" rx="1.5" ry="2.5" fill="#FFFFFF"/>
      <polygon points="48,32 52,32 50,35" fill="#231F20"/>
      <path d="M46 36 Q50 39 54 36" fill="none" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="20" y1="32" x2="32" y2="34" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="18" y1="38" x2="31" y2="38" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="22" y1="44" x2="33" y2="42" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="64" y1="34" x2="76" y2="32" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="65" y1="38" x2="78" y2="38" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="63" y1="42" x2="74" y2="44" stroke="#231F20" stroke-width="1.5" stroke-linecap="round"/>
    </g>
  </svg>`;
}

const COSTUME_DEFINITIONS = [
  {
    name: "costume1",
    color: "#FFAB19",
    detail: "none",
    width: 95,
    height: 101,
    svg: getScratchCatSvg("costume1")
  },
  {
    name: "costume2",
    color: "#FFAB19",
    detail: "walk",
    width: 96,
    height: 101,
    svg: getScratchCatSvg("costume2")
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


