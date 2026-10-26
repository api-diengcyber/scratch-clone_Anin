// ============================================================
// EVENTS SYSTEM
// ============================================================

function isEventHat(type) {
  return [
    "when_flag_clicked",
    "when_key_pressed",
    "when_sprite_clicked",
    "when_backdrop_switches",
    "when_loudness_gt",
    "when_receive"
  ].includes(type);
}


function getFirstBlock(stack) {
  if (
    !stack ||
    !stack.blocks ||
    !stack.blocks.length
  ) {
    return null;
  }

  return stack.blocks[0];
}


function getBlockDropdownValue(block) {

  if (!block || !block.element) {
    return null;
  }

  const dropdown = getOwnDropdown(block.element);

  return dropdown
    ? dropdown.dataset.value
    : null;
}


function getBlockInputValue(block) {

  if (!block || !block.element) {
    return null;
  }

  const input = getOwnInputs(block.element)[0];

  return input
    ? input.value
    : null;
}



function valueOf(v) {
  const raw = String(v ?? "").trim();
  if (Object.prototype.hasOwnProperty.call(state.variables, raw)) return state.variables[raw];
  if (raw.toLowerCase() === "true") return true;
  if (raw.toLowerCase() === "false") return false;
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) ? n : raw;
}

function truthyScratch(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "" || s === "false" || s === "0" || s === "nan") return false;
  return true;
}

function updateVariableMonitor(name) {
  const display = document.getElementById(`var-val-${name}`);
  if (display) display.innerText = state.variables[name];
}

function setVariableVisible(name, visible) {
  if (!state.variableMeta[name]) state.variableMeta[name] = { visible:true, scope:"all" };
  state.variableMeta[name].visible = visible;
  renderStageVariableMonitors();
}

let loudnessAnalyser = null;
let loudnessData = null;
let loudnessStream = null;
async function ensureLoudnessMeter() {
  if (loudnessAnalyser) return true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    loudnessStream = await navigator.mediaDevices.getUserMedia({audio:true});
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const source = ac.createMediaStreamSource(loudnessStream);
    loudnessAnalyser = ac.createAnalyser();
    loudnessAnalyser.fftSize = 1024;
    source.connect(loudnessAnalyser);
    loudnessData = new Uint8Array(loudnessAnalyser.fftSize);
    return true;
  } catch (e) { return false; }
}
function getCurrentLoudness() {
  if (!loudnessAnalyser || !loudnessData) return 0;
  loudnessAnalyser.getByteTimeDomainData(loudnessData);
  let sum = 0;
  for (const v of loudnessData) { const x = (v - 128) / 128; sum += x*x; }
  const rms = Math.sqrt(sum / loudnessData.length);
  return Math.max(0, Math.min(100, Math.round(rms * 180)));
}

function getSensingValue(type, option) {
  if (type === "mouse_x") return getMousePosition().x;
  if (type === "mouse_y") return getMousePosition().y;
  if (type === "timer") return (performance.now() - state.timerStartedAt) / 1000;
  if (type === "days_since_2000") return (Date.now() - Date.UTC(2000,0,1)) / 86400000;
  if (type === "online") return navigator.onLine;
  if (type === "username") return state.currentUser || "";
  if (type === "loudness") return getCurrentLoudness();
  if (type === "answer") return state.answer;
  if (type === "current") {
    const d = new Date();
    return {year:d.getFullYear(),month:d.getMonth()+1,date:d.getDate(),day:d.getDay()+1,hour:d.getHours(),minute:d.getMinutes(),second:d.getSeconds()}[option];
  }
  if (type === "mouse_down") return !!window.mouseDown;
  if (type === "key_pressed") return !!window.__keys?.has(option);
  if (type === "distance_to") {
    const p = option === "mouse" ? getMousePosition() : {x:state.sprite.x,y:state.sprite.y};
    return Math.hypot(p.x-state.sprite.x,p.y-state.sprite.y);
  }
  if (type === "touching") {
    if (option === "edge") return Math.abs(state.sprite.x) >= 220 || Math.abs(state.sprite.y) >= 160;
    if (option === "mouse") return Math.hypot(getMousePosition().x-state.sprite.x,getMousePosition().y-state.sprite.y) < 30;
    return false;
  }
  return "";
}

function evaluateBlockReporter(blockObj) {
  if (!blockObj?.element) return "";
  const inputs = getOwnInputs(blockObj.element).map(i => i.value);
  const dropdown = getOwnDropdown(blockObj.element);
  const option = dropdown?.dataset.value;
  const a = valueOf(inputs[0]), b = valueOf(inputs[1]);
  switch(blockObj.type) {
    case "reporter_x": return state.sprite.x;
    case "reporter_y": return state.sprite.y;
    case "reporter_direction": return state.sprite.direction;
    case "reporter_size": return state.sprite.size;
    case "backdrop_of": {
      if (option === "number") return BACKDROP_DEFINITIONS.findIndex(b=>b.name===state.backdrop.current)+1;
      if (option === "volume") return state.soundState.volume;
      if (option === "my variable") return state.variables["my variable"] ?? "";
      return state.backdrop.current;
    }
    case "reporter_volume": return state.soundState.volume;
    case "reporter_costume": return option === "number" ? COSTUME_DEFINITIONS.findIndex(c=>c.name===state.sprite.costume)+1 : state.sprite.costume;
    case "reporter_backdrop": return option === "number" ? BACKDROP_DEFINITIONS.findIndex(b=>b.name===state.backdrop.current)+1 : state.backdrop.current;
    case "var_reporter": return state.variables[blockObj.customName || option] ?? "";
    case "list_reporter": return (state.lists[blockObj.customName || option] || []).join(" ");
    case "list_length": return (state.lists[option] || []).length;
    case "list_item": {
      const idx = Math.floor(Number(a)); const list = state.lists[option] || []; return idx >= 1 && idx <= list.length ? list[idx-1] : "";
    }
    case "list_contains": return (state.lists[option] || []).some(v => String(v).toLowerCase() === String(a).toLowerCase());
    case "touching_color": return false;
    case "color_touching_color": return false;
    case "op_add": return Number(a)+Number(b);
    case "op_subtract": return Number(a)-Number(b);
    case "op_multiply": return Number(a)*Number(b);
    case "op_divide": return Number(b) === 0 ? "Infinity" : Number(a)/Number(b);
    case "op_random": { const lo=Number(a), hi=Number(b); return Number.isInteger(lo)&&Number.isInteger(hi) ? Math.floor(Math.random()*(hi-lo+1))+Math.min(lo,hi) : Math.random()*(hi-lo)+lo; }
    case "op_gt": return a > b;
    case "op_lt": return a < b;
    case "op_eq": return String(a).toLowerCase() === String(b).toLowerCase();
    case "op_and": return truthyScratch(a)&&truthyScratch(b);
    case "op_or": return truthyScratch(a)||truthyScratch(b);
    case "op_not": return !truthyScratch(a);
    case "op_join": return String(a)+String(b);
    case "op_letter": return String(b)[Math.max(0,Number(a)-1)] ?? "";
    case "op_length": return String(a).length;
    case "op_contains": return String(a).toLowerCase().includes(String(b).toLowerCase());
    case "op_mod": return Number(a)%Number(b);
    case "op_round": return Math.round(Number(a));
    case "op_math": {
      const n=Number(b);
      if (!Number.isFinite(n)) return 0;
      const rad=n*Math.PI/180;
      switch(option){
        case "abs": return Math.abs(n);
        case "floor": return Math.floor(n);
        case "ceil": return Math.ceil(n);
        case "sqrt": return Math.sqrt(n);
        case "sin": return Math.sin(rad);
        case "cos": return Math.cos(rad);
        case "tan": return Math.tan(rad);
        case "asin": return Math.asin(n)*180/Math.PI;
        case "acos": return Math.acos(n)*180/Math.PI;
        case "atan": return Math.atan(n)*180/Math.PI;
        case "ln": return Math.log(n);
        case "log": return Math.log10 ? Math.log10(n) : Math.log(n)/Math.LN10;
        case "e": return Math.exp(n);
        case "10pow": return Math.pow(10,n);
        default: return n;
      }
    }
    default: return getSensingValue(blockObj.type, option);
  }
}

// Execute exactly one block. Event hats are handled by the event system.
async function executeSingleEventBlock(blockObj) {
  if (!blockObj || !blockObj.element) {
    return;
  }

const inputs = getOwnInputs(blockObj.element);


const val0 =
  inputs[0]
    ? inputs[0].value
    : null;

const val1 =
  inputs[1]
    ? inputs[1].value
    : null;

const val2 =
  inputs[2]
    ? inputs[2].value
    : null;


const dropdown = getOwnDropdown(blockObj.element);


const selectedOption =
  dropdown
    ? dropdown.dataset.value
    : null;


switch (
  blockObj.type
) {

  // ==================================================
  // MOTION
  // ==================================================

  case "move_steps": {

    const steps =
      parseFloat(val0);

    const safeSteps =
      Number.isFinite(steps)
        ? steps
        : 0;

    const rad =
      state.sprite.direction *
      Math.PI /
      180;

    state.sprite.x +=
      Math.sin(rad) *
      safeSteps;

    state.sprite.y +=
      Math.cos(rad) *
      safeSteps;

    break;
  }


  case "turn_right": {

    const amount =
      parseFloat(val0);

    state.sprite.direction =
      normalizeDirection(
        state.sprite.direction +
        (
          Number.isFinite(amount)
            ? amount
            : 0
        )
      );

    break;
  }


  case "turn_left": {

    const amount =
      parseFloat(val0);

    state.sprite.direction =
      normalizeDirection(
        state.sprite.direction -
        (
          Number.isFinite(amount)
            ? amount
            : 0
        )
      );

    break;
  }


  case "goto_random": {

    const target =
      selectedOption === "mouse"
        ? getMousePosition()
        : getRandomPosition();

    state.sprite.x =
      target.x;

    state.sprite.y =
      target.y;

    break;
  }


  case "goto_xy": {

    const xValue =
      parseFloat(val0);

    const yValue =
      parseFloat(val1);

    state.sprite.x =
      Number.isFinite(xValue)
        ? xValue
        : 0;

    state.sprite.y =
      Number.isFinite(yValue)
        ? yValue
        : 0;

    break;
  }


  case "glide_random": {

    const seconds =
      parseFloat(val0);

    const duration =
      (
        Number.isFinite(seconds)
          ? Math.max(
              0.01,
              seconds
            )
          : 1
      ) *
      1000;

    const startX =
      state.sprite.x;

    const startY =
      state.sprite.y;

    const target =
      selectedOption === "mouse"
        ? getMousePosition()
        : getRandomPosition();

    const startTime =
      performance.now();

    await new Promise(
      (resolve) => {

        function animate(now) {

          if (
            !state.isRunning
          ) {

            resolve();

            return;
          }

          const progress =
            Math.min(
              (
                now -
                startTime
              ) /
              duration,
              1
            );

          state.sprite.x =
            startX +
            (
              target.x -
              startX
            ) *
            progress;

          state.sprite.y =
            startY +
            (
              target.y -
              startY
            ) *
            progress;

          renderStage();

          if (
            progress <
            1
          ) {

            requestAnimationFrame(
              animate
            );

          } else {

            resolve();
          }
        }

        requestAnimationFrame(
          animate
        );
      }
    );

    break;
  }


  case "glide_xy": {

    const seconds =
      parseFloat(val0);

    const duration =
      (
        Number.isFinite(seconds)
          ? Math.max(
              0.01,
              seconds
            )
          : 1
      ) *
      1000;

    const targetXValue =
      parseFloat(val1);

    const targetYValue =
      parseFloat(val2);

    const targetX =
      Number.isFinite(targetXValue)
        ? targetXValue
        : 0;

    const targetY =
      Number.isFinite(targetYValue)
        ? targetYValue
        : 0;

    const startX =
      state.sprite.x;

    const startY =
      state.sprite.y;

    const startTime =
      performance.now();

    await new Promise(
      (resolve) => {

        function animate(now) {

          if (
            !state.isRunning
          ) {

            resolve();

            return;
          }

          const progress =
            Math.min(
              (
                now -
                startTime
              ) /
              duration,
              1
            );

          state.sprite.x =
            startX +
            (
              targetX -
              startX
            ) *
            progress;

          state.sprite.y =
            startY +
            (
              targetY -
              startY
            ) *
            progress;

          renderStage();

          if (
            progress <
            1
          ) {

            requestAnimationFrame(
              animate
            );

          } else {

            resolve();
          }
        }

        requestAnimationFrame(
          animate
        );
      }
    );

    break;
  }


  case "point_direction": {

    const direction =
      parseFloat(val0);

    state.sprite.direction =
      normalizeDirection(
        Number.isFinite(direction)
          ? direction
          : 90
      );

    break;
  }


  case "point_towards": {

    const target =
      selectedOption === "mouse"
        ? getMousePosition()
        : getRandomPosition();

    const dx =
      target.x -
      state.sprite.x;

    const dy =
      target.y -
      state.sprite.y;

    if (
      dx !== 0 ||
      dy !== 0
    ) {

      state.sprite.direction =
        normalizeDirection(
          Math.atan2(
            dx,
            dy
          ) *
          180 /
          Math.PI
        );
    }

    break;
  }


  case "change_x": {

    const amount =
      parseFloat(val0);

    state.sprite.x +=
      Number.isFinite(amount)
        ? amount
        : 0;

    break;
  }


  case "set_x": {

    const xValue =
      parseFloat(val0);

    state.sprite.x =
      Number.isFinite(xValue)
        ? xValue
        : 0;

    break;
  }


  case "change_y": {

    const amount =
      parseFloat(val0);

    state.sprite.y +=
      Number.isFinite(amount)
        ? amount
        : 0;

    break;
  }


  case "set_y": {

    const yValue =
      parseFloat(val0);

    state.sprite.y =
      Number.isFinite(yValue)
        ? yValue
        : 0;

    break;
  }


  case "if_edge": {

    if (!canvas) {
      break;
    }

    const maxX =
      canvas.width / 2 - 25;

    const maxY =
      canvas.height / 2 - 25;

    if (
      state.sprite.x >
      maxX
    ) {

      state.sprite.x =
        maxX;

      state.sprite.direction =
        360 -
        state.sprite.direction;
    }

    if (
      state.sprite.x <
      -maxX
    ) {

      state.sprite.x =
        -maxX;

      state.sprite.direction =
        360 -
        state.sprite.direction;
    }

    if (
      state.sprite.y >
      maxY
    ) {

      state.sprite.y =
        maxY;

      state.sprite.direction =
        180 -
        state.sprite.direction;
    }

    if (
      state.sprite.y <
      -maxY
    ) {

      state.sprite.y =
        -maxY;

      state.sprite.direction =
        180 -
        state.sprite.direction;
    }

    state.sprite.direction =
      normalizeDirection(
        state.sprite.direction
      );

    break;
  }


  case "set_rotation_style": {

    if (
      selectedOption
    ) {

      state.sprite.rotationStyle =
        selectedOption;
    }

    break;
  }


  // ==================================================
  // LOOKS
  // ==================================================

  case "say_for_secs": {

    setBubble(
      val0 || "",
      "say"
    );

    const saySeconds =
      parseFloat(val1);

    const safeSaySeconds =
      Number.isFinite(saySeconds)
        ? Math.max(
            0,
            saySeconds
          )
        : 2;

    await waitWhileRunning(
      safeSaySeconds
    );

    if (
      state.isRunning
    ) {

      state.sprite.sayText =
        "";

      renderStage();
    }

    break;
  }


  case "say": {

    setBubble(
      val0 || "",
      "say"
    );

    break;
  }


  case "think_for_secs": {

    setBubble(
      val0 || "",
      "think"
    );

    const thinkSeconds =
      parseFloat(val1);

    const safeThinkSeconds =
      Number.isFinite(thinkSeconds)
        ? Math.max(
            0,
            thinkSeconds
          )
        : 2;

    await waitWhileRunning(
      safeThinkSeconds
    );

    if (
      state.isRunning
    ) {

      state.sprite.sayText =
        "";

      state.sprite.bubbleType =
        "say";

      renderStage();
    }

    break;
  }


  case "think": {

    setBubble(
      val0 || "",
      "think"
    );

    break;
  }


  case "switch_costume": {

    if (
      selectedOption
    ) {

      state.sprite.costume =
        selectedOption;
    }

    break;
  }


  case "next_costume": {

    nextCostume();

    break;
  }


  case "change_size": {

    const amount =
      parseFloat(val0);

    if (
      Number.isFinite(amount)
    ) {

      state.sprite.size +=
        amount;
    }

    state.sprite.size =
      clamp(
        state.sprite.size,
        1,
        1000
      );

    break;
  }


  case "set_size": {

    const newSize =
      parseFloat(val0);

    if (
      Number.isFinite(newSize)
    ) {

      state.sprite.size =
        clamp(
          newSize,
          1,
          1000
        );
    }

    break;
  }


  case "show": {

    // Sprite yang sudah dihapus tidak boleh muncul lagi lewat blok
    state.sprite.visible =
      !state.sprite.deleted;

    break;
  }


  case "hide": {

    state.sprite.visible =
      false;

    break;
  }


  case "change_graphic_effect": {

    changeGraphicEffect(
      selectedOption,
      parseFloat(val0)
    );

    break;
  }


  case "set_graphic_effect": {

    setGraphicEffect(
      selectedOption,
      parseFloat(val0)
    );

    break;
  }


  case "clear_graphic_effects": {

    clearGraphicEffects();

    break;
  }


  case "go_to_front": {

    state.sprite.layer =
      999999;

    break;
  }


  case "go_back_layers": {

    const layers =
      parseFloat(val0);

    if (
      Number.isFinite(layers)
    ) {

      state.sprite.layer -=
        layers;
    }

    break;
  }


  case "switch_backdrop": {

    if (
      selectedOption
    ) {

      state.backdrop.current =
        selectedOption;
    }

    break;
  }


  case "next_backdrop": {

    nextBackdrop();

    break;
  }


  // ==================================================
  // SOUND
  // ==================================================

  case "play_sound_until_done": {

    await playSoundByName(
      selectedOption,
      true
    );

    break;
  }


  case "start_sound": {

    playSoundByName(
      selectedOption,
      false
    );

    break;
  }


  case "stop_all_sounds": {

    stopAllSounds();

    break;
  }


  case "change_sound_effect": {

    const amount =
      parseFloat(val0);

    if (
      selectedOption ===
      "pitch"
    ) {

      state.soundState.pitch +=
        Number.isFinite(amount)
          ? amount
          : 0;
    }

    if (
      selectedOption ===
      "pan"
    ) {

      state.soundState.pan +=
        Number.isFinite(amount)
          ? amount
          : 0;
    }

    break;
  }


  case "set_sound_effect": {

    const amount =
      parseFloat(val0);

    if (
      selectedOption ===
      "pitch"
    ) {

      state.soundState.pitch =
        Number.isFinite(amount)
          ? amount
          : 0;
    }

    if (
      selectedOption ===
      "pan"
    ) {

      state.soundState.pan =
        Number.isFinite(amount)
          ? amount
          : 0;
    }

    break;
  }


  case "clear_sound_effects": {

    state.soundState.pitch =
      0;

    state.soundState.pan =
      0;

    break;
  }


  case "change_volume": {

    const amount =
      parseFloat(val0);

    if (
      Number.isFinite(amount)
    ) {

      state.soundState.volume =
        clamp(
          state.soundState.volume +
          amount,
          0,
          100
        );
    }

    break;
  }


  case "set_volume": {

    const volume =
      parseFloat(val0);

    if (
      Number.isFinite(volume)
    ) {

      state.soundState.volume =
        clamp(
          volume,
          0,
          100
        );
    }

    break;
  }


  // ==================================================
  // CONTROL
  // ==================================================

  case "wait_secs": {

    const seconds =
      parseFloat(val0);

    const waitTime =
      Number.isFinite(seconds)
        ? Math.max(
            0,
            seconds
          )
        : 1;

    await waitWhileRunning(
      waitTime
    );

    break;
  }


  // ==================================================
  // VARIABLES
  // ==================================================

  case "change_var": {
    const amount = parseFloat(val0);
    const name = selectedOption || "my variable";
    if (Number.isFinite(amount)) {
      state.variables[name] = Number(state.variables[name] || 0) + amount;
      updateVariableMonitor(name);
    }
    break;
  }


  // ==================================================
  // CONTROL
  // ==================================================

  case "repeat": {
    const n = Math.max(0, Math.floor(Number(val0) || 0));
    const children = getControlBranchBlocks(blockObj, 0);

    if (children.length) {
      for (let k = 0; k < n && state.isRunning; k++) {
        for (const child of children) {
          if (!state.isRunning) break;
          await executeSingleEventBlock(child);
        }
      }
    } else {
      // Backward-compatible flat-workspace fallback.
      const stack = state.stacks.find(st => st.blocks.includes(blockObj));
      const i = stack ? stack.blocks.indexOf(blockObj) : -1;
      const next = stack?.blocks[i + 1];
      if (next && n > 0) {
        for (let k = 0; k < n && state.isRunning; k++) {
          await executeSingleEventBlock(next);
        }
      }
    }
    break;
  }

  case "forever": {
    const children = getControlBranchBlocks(blockObj, 0);

    if (children.length) {
      let guard = 0;
      while (state.isRunning && guard++ < 10000) {
        for (const child of children) {
          if (!state.isRunning) break;
          await executeSingleEventBlock(child);
        }
        await new Promise(r => setTimeout(r, 0));
      }
    } else {
      // Backward-compatible flat-workspace fallback.
      const stack = state.stacks.find(st => st.blocks.includes(blockObj));
      const i = stack ? stack.blocks.indexOf(blockObj) : -1;
      const next = stack?.blocks[i + 1];
      let guard = 0;
      while (state.isRunning && next && guard++ < 10000) {
        await executeSingleEventBlock(next);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    break;
  }

  case "if": {
    if (truthyScratch(valueOf(val0))) {
      const children = getControlBranchBlocks(blockObj, 0);
      if (children.length) {
        for (const child of children) {
          if (!state.isRunning) break;
          await executeSingleEventBlock(child);
        }
      } else {
        const stack = state.stacks.find(st => st.blocks.includes(blockObj));
        const i = stack ? stack.blocks.indexOf(blockObj) : -1;
        if (stack?.blocks[i + 1]) {
          await executeSingleEventBlock(stack.blocks[i + 1]);
        }
      }
    }
    break;
  }

  case "if_else": {
    const branch = truthyScratch(valueOf(val0)) ? 0 : 1;
    const children = getControlBranchBlocks(blockObj, branch);

    if (children.length) {
      for (const child of children) {
        if (!state.isRunning) break;
        await executeSingleEventBlock(child);
      }
    } else {
      // Backward-compatible flat-workspace fallback for the first branch.
      const stack = state.stacks.find(st => st.blocks.includes(blockObj));
      const i = stack ? stack.blocks.indexOf(blockObj) : -1;
      const next = stack?.blocks[i + 1];
      if (branch === 0 && next) {
        await executeSingleEventBlock(next);
      }
    }
    break;
  }

  case "wait_until": {
    const started=performance.now();
    const liveCond = () => { const i = getOwnInputs(blockObj.element)[0]; return i ? i.value : val0; };
    while(state.isRunning && !truthyScratch(valueOf(liveCond())) && performance.now()-started<60000)
      await new Promise(r=>setTimeout(r,50));
    break;
  }

  case "repeat_until": {
    const children = getControlBranchBlocks(blockObj, 0);

    if (children.length) {
      let guard = 0;
      while (
        state.isRunning &&
        !truthyScratch(valueOf(getOwnInputs(blockObj.element)[0]?.value ?? val0)) &&
        guard++ < 10000
      ) {
        for (const child of children) {
          if (!state.isRunning) break;
          await executeSingleEventBlock(child);
        }
        await new Promise(r=>setTimeout(r,0));
      }
    } else {
      // Backward-compatible flat-workspace fallback.
      const stack = state.stacks.find(st => st.blocks.includes(blockObj));
      const i = stack ? stack.blocks.indexOf(blockObj) : -1;
      const next = stack?.blocks[i + 1];
      let guard = 0;
      while (
        state.isRunning &&
        !truthyScratch(valueOf(getOwnInputs(blockObj.element)[0]?.value ?? val0)) &&
        next &&
        guard++ < 10000
      ) {
        await executeSingleEventBlock(next);
        await new Promise(r=>setTimeout(r,0));
      }
    }
    break;
  }

  case "stop": {
    state.isRunning=false;
    break;
  }

  case "create_clone": {
    // This app currently has one editable sprite; clone support is represented
    // by a snapshot and a clone event hook for future multi-sprite work.
    state.lastClone = {...state.sprite};
    break;
  }

  case "delete_clone": {
    state.sprite.visible=false;
    break;
  }

  // ==================================================
  // SENSING
  // ==================================================

  case "ask_wait": {
    const answer=window.prompt(val0 || "");
    state.answer=answer ?? "";
    break;
  }

  case "reset_timer": {
    state.timerStartedAt=performance.now();
    break;
  }

  case "key_pressed": {
    break;
  }

  case "set_drag_mode": {
    state.dragMode = selectedOption === "draggable" ? "draggable" : "not-draggable";
    break;
  }

  // ==================================================
  // VARIABLES
  // ==================================================

  case "set_var": {
    const name=selectedOption || "my variable";
    state.variables[name]=valueOf(val0);
    if (!state.variableMeta[name]) state.variableMeta[name]={visible:true};
    updateVariableMonitor(name);
    break;
  }

  case "show_var": {
    setVariableVisible(selectedOption || "my variable", true);
    break;
  }

  case "hide_var": {
    setVariableVisible(selectedOption || "my variable", false);
    break;
  }

  case "add_list": {
    const name = String(val0 || "my list").trim();
    if (name) {
      state.lists[name] = [];
      state.listMeta[name] = { visible: true, scope: state._pendingListScope || "all" };
      state._pendingListScope = null;
      renderVariablePaletteAndMonitors();
    }
    break;
  }

  case "delete_list_all": {
    const name = selectedOption || Object.keys(state.lists)[0];
    if (name && state.lists[name]) state.lists[name] = [];
    renderVariablePaletteAndMonitors();
    break;
  }

  case "list_add": {
    const name = selectedOption || Object.keys(state.lists)[0];
    if (name && state.lists[name]) state.lists[name].push(val0 ?? "");
    renderVariablePaletteAndMonitors();
    break;
  }

  case "list_delete_item": {
    const name = selectedOption || Object.keys(state.lists)[0];
    const idx = Math.floor(Number(val0));
    if (name && state.lists[name] && Number.isFinite(idx) && idx >= 1 && idx <= state.lists[name].length) state.lists[name].splice(idx - 1, 1);
    renderVariablePaletteAndMonitors();
    break;
  }

  case "list_insert": {
    const name = selectedOption || Object.keys(state.lists)[0];
    const idx = Math.max(1, Math.floor(Number(val1) || 1));
    if (name && state.lists[name]) state.lists[name].splice(Math.min(idx - 1, state.lists[name].length), 0, val0 ?? "");
    renderVariablePaletteAndMonitors();
    break;
  }

  case "list_replace": {
    const name = selectedOption || Object.keys(state.lists)[0];
    const idx = Math.floor(Number(val0));
    if (name && state.lists[name] && Number.isFinite(idx) && idx >= 1 && idx <= state.lists[name].length) state.lists[name][idx - 1] = val1 ?? "";
    renderVariablePaletteAndMonitors();
    break;
  }

  case "show_list": {
    const name = selectedOption || Object.keys(state.lists)[0];
    if (name && state.listMeta[name]) state.listMeta[name].visible = true;
    renderVariablePaletteAndMonitors();
    break;
  }

  case "hide_list": {
    const name = selectedOption || Object.keys(state.lists)[0];
    if (name && state.listMeta[name]) state.listMeta[name].visible = false;
    renderVariablePaletteAndMonitors();
    break;
  }

  // ==================================================
  // MY BLOCKS
  // ==================================================

  case "define_myblock": {
    break;
  }

  case "call_myblock": {
    const name = blockObj.customName || selectedOption || "";
    const defStack = state.stacks.find(st => st.blocks[0]?.type === "define_myblock" && st.blocks[0]?.customName === name);
    if (defStack) {
      const oldRunning = state.isRunning;
      for (let i = 1; i < defStack.blocks.length && state.isRunning; i++) {
        await executeSingleEventBlock(defStack.blocks[i]);
      }
      state.isRunning = oldRunning;
    }
    break;
  }

  // ==================================================
  // REPORTERS
  // ==================================================

  case "reporter_x":
  case "reporter_y":
  case "reporter_direction":
  case "reporter_costume":
  case "reporter_backdrop":
  case "reporter_size":
  case "backdrop_of":
  case "reporter_volume":
  case "var_reporter":
  case "op_add":
  case "op_subtract":
  case "op_multiply":
  case "op_divide":
  case "op_random":
  case "op_gt":
  case "op_lt":
  case "op_eq":
  case "op_and":
  case "op_or":
  case "op_not":
  case "op_join":
  case "op_letter":
  case "op_length":
  case "op_contains":
  case "op_mod":
  case "op_round":
  case "op_math":
  case "touching":
  case "touching_color":
  case "color_touching_color":
  case "distance_to":
  case "answer":
  case "mouse_down":
  case "mouse_x":
  case "mouse_y":
  case "loudness":
  case "timer":
  case "current":
  case "days_since_2000":
  case "username":
  case "online":
  case "list_reporter":
  case "list_length":
  case "list_item":
  case "list_contains":
    blockObj.lastValue = evaluateBlockReporter(blockObj);
    break;
}


renderStage();


if (
  state.isRunning
) {

  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        100
      )
  );
}
}

// ============================================================
// KEY PRESSED
// ============================================================

document.addEventListener(
  "keydown",
  (e) => {

    // Jangan trigger ketika sedang mengetik
    // di input block.
    if (
      e.target &&
      (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA"
      )
    ) {
      return;
    }

    if (e.repeat) {
      return;
    }

    let key =
      e.key;

    if (key === " ") {
      key = "space";
    }

    state.stacks.forEach(
      (stack) => {

        const firstBlock =
          getFirstBlock(stack);

        if (
          !firstBlock ||
          firstBlock.type !==
            "when_key_pressed"
        ) {
          return;
        }

        const selectedKey =
          getBlockDropdownValue(
            firstBlock
          );

        if (
          selectedKey === "any" ||
          selectedKey === key
        ) {

          runEventStack(
            stack
          );
        }
      }
    );
  }
);


// ============================================================
// SPRITE CLICKED
// ============================================================

if (canvas) {

  canvas.addEventListener(
    "click",
    (e) => {

      if (
        !state.sprite.visible
      ) {
        return;
      }

      const rect =
        canvas.getBoundingClientRect();

      const scaleX =
        canvas.width /
        rect.width;

      const scaleY =
        canvas.height /
        rect.height;

      const clickX =
        (
          e.clientX -
          rect.left
        ) *
        scaleX;

      const clickY =
        (
          e.clientY -
          rect.top
        ) *
        scaleY;

      const spriteX =
        state.sprite.x +
        canvas.width / 2;

      const spriteY =
        -state.sprite.y +
        canvas.height / 2;

      const radius =
        Math.max(
          30,
          35 *
          state.sprite.size /
          100
        );

      const distance =
        Math.sqrt(
          Math.pow(
            clickX - spriteX,
            2
          ) +
          Math.pow(
            clickY - spriteY,
            2
          )
        );

      if (
        distance <= radius
      ) {

        state.stacks
          .filter(
            (stack) => {

              const firstBlock =
                getFirstBlock(stack);

              return (
                firstBlock &&
                firstBlock.type ===
                  "when_sprite_clicked"
              );
            }
          )
          .forEach(
            (stack) => {

              runEventStack(
                stack
              );
            }
          );
      }
    }
  );
}


// ============================================================
// CLICK-TO-RUN WORKSPACE BLOCK
// ============================================================

function findStackByContainer(container) {
  return state.stacks.find(
    (stack) => stack.containerElem === container
  ) || null;
}

function findNestedBlockOwner(blocks, element) {
  for (const block of blocks || []) {
    if (block?.element === element) {
      return block;
    }

    for (const branch of block?.branches || []) {
      const found = findNestedBlockOwner(branch, element);
      if (found) return found;
    }
  }
  return null;
}

async function runClickedWorkspaceBlock(container, blockElement) {
  const stack = findStackByContainer(container);

  if (!stack || !blockElement) {
    return;
  }

  const index = stack.blocks.findIndex(
    (block) => block.element === blockElement
  );

  // Nested blocks inside Control C-blocks are not part of the
  // top-level stack array. They can still be clicked directly.
  if (index < 0) {
    const nestedBlock = findNestedBlockOwner(stack.blocks, blockElement);
    if (!nestedBlock || nestedBlock.type === "when_flag_clicked") {
      return;
    }

    if (state.isRunning) {
      return;
    }

    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    state.isRunning = true;
    try {
      await executeSingleEventBlock(nestedBlock);
      if (typeof renderStage === "function") renderStage();
    } finally {
      state.isRunning = false;
    }
    return;
  }

  const block = stack.blocks[index];

  // The flag hat is intentionally NOT directly executable.
  if (block.type === "when_flag_clicked") {
    return;
  }

  if (state.isRunning) {
    return;
  }

  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  state.isRunning = true;

  try {
    // If another event hat is clicked, start after the hat.
    let startIndex = index;
    if (isEventHat(block.type)) {
      startIndex = index + 1;
    }

    for (let i = startIndex; i < stack.blocks.length; i++) {
      if (!state.isRunning) {
        break;
      }

      const blockObj = stack.blocks[i];

      if (blockObj.type === "broadcast") {
        await triggerBroadcast(getBlockDropdownValue(blockObj));
        continue;
      }

      if (blockObj.type === "broadcast_wait") {
        await triggerBroadcast(getBlockDropdownValue(blockObj), true);
        continue;
      }

      await executeSingleEventBlock(blockObj);

      // Update the stage immediately so a block clicked directly
      // gives visible feedback (e.g. move/turn/say) without
      // requiring the green flag.
      if (typeof renderStage === "function") {
        renderStage();
      }

      // Keep the same small visual step used by event stacks.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    state.isRunning = false;
  }
}

// ============================================================
// RUN EVENT STACK
// ============================================================

async function runEventStack(
  stack
) {

  if (
    !stack ||
    !stack.blocks ||
    !stack.blocks.length
  ) {
    return;
  }

  const firstBlock =
    getFirstBlock(stack);

  let startIndex =
    isEventHat(firstBlock.type)
      ? 1
      : 0;

  const oldRunning =
    state.isRunning;

  state.isRunning =
    true;

  try {

    for (
      let i = startIndex;
      i < stack.blocks.length;
      i++
    ) {

      if (
        !state.isRunning
      ) {
        break;
      }

      const blockObj =
        stack.blocks[i];

      // Broadcast ditangani khusus
      if (
        blockObj.type ===
        "broadcast"
      ) {

        const message =
          getBlockDropdownValue(
            blockObj
          );

        triggerBroadcast(
          message
        );

        continue;
      }


      if (
        blockObj.type ===
        "broadcast_wait"
      ) {

        const message =
          getBlockDropdownValue(
            blockObj
          );

        await triggerBroadcast(
          message,
          true
        );

        continue;
      }


      // Untuk blok lainnya,
      // gunakan execution engine lama.
      await executeSingleEventBlock(
        blockObj
      );

      renderStage();

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            100
          )
      );
    }

  } finally {

    if (!oldRunning) {
      state.isRunning =
        false;
    }
  }
}


// ============================================================
// LOUDNESS / TIMER EVENT HATS
// ============================================================

function pollSensorEventHats() {
  state.stacks.forEach((stack) => {
    const firstBlock = getFirstBlock(stack);
    if (!firstBlock || firstBlock.type !== "when_loudness_gt") return;
    const source = getBlockDropdownValue(firstBlock) || "loudness";
    const threshold = Number(getBlockInputValue(firstBlock));
    const limit = Number.isFinite(threshold) ? threshold : 10;
    const value = source === "timer" ? getSensingValue("timer") : getSensingValue("loudness");
    const active = Number(value) > limit;
    const wasActive = state.eventTriggerState.get(firstBlock) === true;
    if (active && !wasActive && !state.isRunning) runEventStack(stack);
    state.eventTriggerState.set(firstBlock, active);
  });
}

setInterval(pollSensorEventHats, 100);

// ============================================================
// BROADCAST
// ============================================================

async function triggerBroadcast(
  message,
  waitForDone = false
) {

  if (!message) {
    return;
  }

  const receivers =
    state.stacks.filter(
      (stack) => {

        const firstBlock =
          getFirstBlock(stack);

        if (
          !firstBlock ||
          firstBlock.type !==
            "when_receive"
        ) {
          return false;
        }

        return (
          getBlockDropdownValue(
            firstBlock
          ) === message
        );
      }
    );


  const runs =
    receivers.map(
      (stack) =>
        runEventStack(stack)
    );


  if (waitForDone) {
    await Promise.all(runs);
  }
}
