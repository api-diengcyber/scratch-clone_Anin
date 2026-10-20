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


