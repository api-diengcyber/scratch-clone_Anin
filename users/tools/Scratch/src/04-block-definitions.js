// ============================================================
// BLOCK DEFINITIONS
// ============================================================

const blockDefinitions = [

  // ==========================================================
  // MOTION
  // ==========================================================

  {
    cat: "motion",
    type: "move_steps",
    text: "move {10} steps",
    defaultVal: 10
  },

  {
    cat: "motion",
    type: "turn_right",
    text: "turn ↻ {15} degrees",
    defaultVal: 15
  },

  {
    cat: "motion",
    type: "turn_left",
    text: "turn ↺ {15} degrees",
    defaultVal: 15
  },

  {
    cat: "motion",
    type: "goto_random",
    text: "go to [menu]",
    options: [
      {
        label: "random position",
        value: "random"
      },
      {
        label: "mouse-pointer",
        value: "mouse"
      }
    ]
  },

  {
    cat: "motion",
    type: "goto_xy",
    text: "go to x: {0} y: {0}",
    defaultVals: [0, 0]
  },

  {
    cat: "motion",
    type: "glide_random",
    text: "glide {1} secs to [menu]",
    defaultVal: 1,
    options: [
      {
        label: "random position",
        value: "random"
      },
      {
        label: "mouse-pointer",
        value: "mouse"
      }
    ]
  },

  {
    cat: "motion",
    type: "glide_xy",
    text: "glide {1} secs to x: {0} y: {0}",
    defaultVals: [1, 0, 0]
  },

  {
    cat: "motion",
    type: "point_direction",
    text: "point in direction {90}",
    defaultVal: 90
  },

  {
    cat: "motion",
    type: "point_towards",
    text: "point towards [menu]",
    options: [
      {
        label: "mouse-pointer",
        value: "mouse"
      },
      {
        label: "random position",
        value: "random"
      }
    ]
  },

  {
    cat: "motion",
    type: "change_x",
    text: "change x by {10}",
    defaultVal: 10
  },

  {
    cat: "motion",
    type: "set_x",
    text: "set x to {0}",
    defaultVal: 0
  },

  {
    cat: "motion",
    type: "change_y",
    text: "change y by {10}",
    defaultVal: 10
  },

  {
    cat: "motion",
    type: "set_y",
    text: "set y to {0}",
    defaultVal: 0
  },

  {
    cat: "motion",
    type: "if_edge",
    text: "if on edge, bounce"
  },

  {
    cat: "motion",
    type: "set_rotation_style",
    text: "set rotation style [menu]",
    options: [
      {
        label: "left-right",
        value: "left-right"
      },
      {
        label: "don't rotate",
        value: "dont-rotate"
      },
      {
        label: "all around",
        value: "all-around"
      }
    ]
  },

  {
    cat: "motion",
    type: "reporter_x",
    isReporter: true,
    hasCheckbox: true,
    text: "x position"
  },

  {
    cat: "motion",
    type: "reporter_y",
    isReporter: true,
    hasCheckbox: true,
    text: "y position"
  },

  {
    cat: "motion",
    type: "reporter_direction",
    isReporter: true,
    hasCheckbox: true,
    text: "direction"
  },


  // ==========================================================
  // LOOKS
  // ==========================================================

  {
    cat: "looks",
    type: "say_for_secs",
    text: "say {Hello!} for {2} seconds",
    defaultVals: ["Hello!", 2]
  },

  {
    cat: "looks",
    type: "say",
    text: "say {Hello!}",
    defaultVal: "Hello!"
  },

  {
    cat: "looks",
    type: "think_for_secs",
    text: "think {Hmm...} for {2} seconds",
    defaultVals: ["Hmm...", 2]
  },

  {
    cat: "looks",
    type: "think",
    text: "think {Hmm...}",
    defaultVal: "Hmm..."
  },

  {
    cat: "looks",
    type: "switch_costume",
    text: "switch costume to [menu]",
    options:
      COSTUME_DEFINITIONS.map(
        (costume) => ({
          label: costume.name,
          value: costume.name
        })
      )
  },

  {
    cat: "looks",
    type: "next_costume",
    text: "next costume"
  },

  {
    cat: "looks",
    type: "change_size",
    text: "change size by {10}",
    defaultVal: 10
  },

  {
    cat: "looks",
    type: "set_size",
    text: "set size to {100} %",
    defaultVal: 100
  },

  {
    cat: "looks",
    type: "show",
    text: "show"
  },

  {
    cat: "looks",
    type: "hide",
    text: "hide"
  },

  {
    cat: "looks",
    type: "change_graphic_effect",
    text: "change [menu] effect by {25}",
    options:
      GRAPHIC_EFFECT_NAMES.map(
        (effect) => ({
          label: effect,
          value: effect
        })
      ),
    defaultVal: 25
  },

  {
    cat: "looks",
    type: "set_graphic_effect",
    text: "set [menu] effect to {0}",
    options:
      GRAPHIC_EFFECT_NAMES.map(
        (effect) => ({
          label: effect,
          value: effect
        })
      ),
    defaultVal: 0
  },

  {
    cat: "looks",
    type: "clear_graphic_effects",
    text: "clear graphic effects"
  },

  {
    cat: "looks",
    type: "go_to_front",
    text: "go to front layer"
  },

  {
    cat: "looks",
    type: "go_back_layers",
    text: "go back {1} layers",
    defaultVal: 1
  },

  {
    cat: "looks",
    type: "switch_backdrop",
    text: "switch backdrop to [menu]",
    options:
      BACKDROP_DEFINITIONS.map(
        (backdrop) => ({
          label: backdrop.name,
          value: backdrop.name
        })
      )
  },

  {
    cat: "looks",
    type: "next_backdrop",
    text: "next backdrop"
  },

  {
    cat: "looks",
    type: "reporter_costume",
    isReporter: true,
    hasCheckbox: true,
    text: "costume [menu]",
    options: [
      {
        label: "number",
        value: "number"
      },
      {
        label: "name",
        value: "name"
      }
    ]
  },

  {
    cat: "looks",
    type: "reporter_backdrop",
    isReporter: true,
    hasCheckbox: true,
    text: "backdrop [menu]",
    options: [
      {
        label: "number",
        value: "number"
      },
      {
        label: "name",
        value: "name"
      }
    ]
  },

  {
    cat: "looks",
    type: "reporter_size",
    isReporter: true,
    hasCheckbox: true,
    text: "size"
  },


  // ==========================================================
  // SOUND
  // ==========================================================

  {
    cat: "sound",
    type: "play_sound_until_done",
    text: "play sound [menu] until done",
    optionsSource: "sounds",
    options: [
      {
        label: "Meow",
        value: "Meow"
      }
    ]
  },

  {
    cat: "sound",
    type: "start_sound",
    text: "start sound [menu]",
    optionsSource: "sounds",
    options: [
      {
        label: "Meow",
        value: "Meow"
      }
    ]
  },

  {
    cat: "sound",
    type: "stop_all_sounds",
    text: "stop all sounds"
  },

  {
    cat: "sound",
    type: "change_sound_effect",
    text: "change [menu] effect by {10}",
    options: [
      {
        label: "pitch",
        value: "pitch"
      },
      {
        label: "pan",
        value: "pan"
      }
    ],
    defaultVal: 10
  },

  {
    cat: "sound",
    type: "set_sound_effect",
    text: "set [menu] effect to {100}",
    options: [
      {
        label: "pitch",
        value: "pitch"
      },
      {
        label: "pan",
        value: "pan"
      }
    ],
    defaultVal: 100
  },

  {
    cat: "sound",
    type: "clear_sound_effects",
    text: "clear sound effects"
  },

  {
    cat: "sound",
    type: "change_volume",
    text: "change volume by {-10}",
    defaultVal: -10
  },

  {
    cat: "sound",
    type: "set_volume",
    text: "set volume to {100} %",
    defaultVal: 100
  },

  {
    cat: "sound",
    type: "reporter_volume",
    isReporter: true,
    hasCheckbox: true,
    text: "volume"
  },


  // ==========================================================
  // EVENTS
  // ==========================================================

// ==========================================================
// EVENTS
// ==========================================================

{
  cat: "events",
  type: "when_flag_clicked",
  text: "when 🚩 clicked"
},

{
  cat: "events",
  type: "when_key_pressed",
  text: "when [menu] key pressed",
  options: [
    { label: "space", value: "space" },
    { label: "up arrow", value: "ArrowUp" },
    { label: "down arrow", value: "ArrowDown" },
    { label: "left arrow", value: "ArrowLeft" },
    { label: "right arrow", value: "ArrowRight" },
    { label: "any key", value: "any" },
    { label: "a", value: "a" },
    { label: "b", value: "b" },
    { label: "c", value: "c" },
    { label: "d", value: "d" },
    { label: "e", value: "e" },
    { label: "f", value: "f" },
    { label: "g", value: "g" },
    { label: "h", value: "h" },
    { label: "i", value: "i" },
    { label: "j", value: "j" },
    { label: "k", value: "k" },
    { label: "l", value: "l" },
    { label: "m", value: "m" },
    { label: "n", value: "n" },
    { label: "o", value: "o" },
    { label: "p", value: "p" },
    { label: "q", value: "q" },
    { label: "r", value: "r" },
    { label: "s", value: "s" },
    { label: "t", value: "t" },
    { label: "u", value: "u" },
    { label: "v", value: "v" },
    { label: "w", value: "w" },
    { label: "x", value: "x" },
    { label: "y", value: "y" },
    { label: "z", value: "z" },
    { label: "0", value: "0" },
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "4", value: "4" },
    { label: "5", value: "5" },
    { label: "6", value: "6" },
    { label: "7", value: "7" },
    { label: "8", value: "8" },
    { label: "9", value: "9" }
  ]
},

{
  cat: "events",
  type: "when_sprite_clicked",
  text: "when this sprite clicked"
},

{
  cat: "events",
  type: "when_backdrop_switches",
  text: "when backdrop switches to [menu]",
  options:
    BACKDROP_DEFINITIONS.map(
      (backdrop) => ({
        label: backdrop.name,
        value: backdrop.name
      })
    )
},

{
  cat: "events",
  type: "when_loudness_gt",
  text: "when [loudness] > {10}",
  options: [
    { label: "loudness", value: "loudness" },
    { label: "timer", value: "timer" }
  ],
  defaultVal: 10
},

{
  cat: "events",
  type: "broadcast",
  text: "broadcast [menu]",
  optionsSource: "broadcasts"
},

{
  cat: "events",
  type: "broadcast_wait",
  text: "broadcast [menu] and wait",
  optionsSource: "broadcasts"
},

{
  cat: "events",
  type: "when_receive",
  text: "when I receive [menu]",
  optionsSource: "broadcasts"
},


  // ==========================================================
  // CONTROL — Scratch-compatible core blocks
  // ==========================================================

  { cat:"control", type:"wait_secs", text:"wait {1} seconds", defaultVal:1 },
  { cat:"control", type:"repeat", text:"repeat {10}", defaultVal:10 },
  { cat:"control", type:"forever", text:"forever" },
  { cat:"control", type:"if", text:"if {true} then" , defaultVal:"true" },
  { cat:"control", type:"if_else", text:"if {true} then", defaultVal:"true" },
  { cat:"control", type:"wait_until", text:"wait until {true}", defaultVal:"true" },
  { cat:"control", type:"repeat_until", text:"repeat until {true}", defaultVal:"true" },
  { cat:"control", type:"stop", text:"stop [menu]",
    options:[{label:"all",value:"all"},{label:"this script",value:"this-script"},{label:"other scripts in sprite",value:"other-scripts"}] },
  { cat:"control", type:"create_clone", text:"create clone of [menu]",
    options:[{label:"myself",value:"myself"}] },
  { cat:"control", type:"delete_clone", text:"delete this clone" },

  // ==========================================================
  // SENSING
  // ==========================================================

  { cat:"sensing", type:"touching", isReporter:true, text:"touching [menu] ?",
    options:[{label:"mouse pointer",value:"mouse"},{label:"touching",value:"sprite"}] },
  { cat:"sensing", type:"touching_color", isReporter:true, text:"touching color {#ff0000}?",
    defaultVal:"#ff0000", inputTypes:["color"] },
  { cat:"sensing", type:"color_touching_color", isReporter:true, text:"color {#ff0000} is touching {#00ff00}?",
    defaultVals:["#ff0000","#00ff00"], inputTypes:["color","color"] },
  { cat:"sensing", type:"distance_to", isReporter:true, text:"distance to [menu]",
    options:[{label:"mouse pointer",value:"mouse"}] },
  { cat:"sensing", type:"ask_wait", text:"ask {What's your name?} and wait", defaultVal:"What's your name?" },
  { cat:"sensing", type:"answer", isReporter:true, hasCheckbox:true, text:"answer" },
  { cat:"sensing", type:"key_pressed", isReporter:true, text:"key [menu] pressed?",
    options:[{label:"space",value:"space"},{label:"up arrow",value:"ArrowUp"},{label:"down arrow",value:"ArrowDown"},{label:"left arrow",value:"ArrowLeft"},{label:"right arrow",value:"ArrowRight"},{label:"any key",value:"any"},{label:"a",value:"a"}, {label:"b",value:"b"}, {label:"c",value:"c"}, {label:"d",value:"d"}, {label:"e",value:"e"}, {label:"f",value:"f"}, {label:"g",value:"g"}, {label:"h",value:"h"}, {label:"i",value:"i"}, {label:"j",value:"j"}, {label:"k",value:"k"}, {label:"l",value:"l"}, {label:"m",value:"m"}, {label:"n",value:"n"}, {label:"o",value:"o"}, {label:"p",value:"p"}, {label:"q",value:"q"}, {label:"r",value:"r"}, {label:"s",value:"s"}, {label:"t",value:"t"}, {label:"u",value:"u"}, {label:"v",value:"v"}, {label:"w",value:"w"}, {label:"x",value:"x"}, {label:"y",value:"y"}, {label:"z",value:"z"},{label:"0",value:"0"}, {label:"1",value:"1"}, {label:"2",value:"2"}, {label:"3",value:"3"}, {label:"4",value:"4"}, {label:"5",value:"5"}, {label:"6",value:"6"}, {label:"7",value:"7"}, {label:"8",value:"8"}, {label:"9",value:"9"} ] },
  { cat:"sensing", type:"mouse_down", isReporter:true, text:"mouse down?" },
  { cat:"sensing", type:"mouse_x", isReporter:true, text:"mouse x" },
  { cat:"sensing", type:"mouse_y", isReporter:true, text:"mouse y" },
  { cat:"sensing", type:"loudness", isReporter:true, hasCheckbox:true, text:"loudness" },
  { cat:"sensing", type:"timer", isReporter:true, hasCheckbox:true, text:"timer" },
  { cat:"sensing", type:"reset_timer", text:"reset timer" },
  { cat:"sensing", type:"current", isReporter:true, hasCheckbox:true, text:"current [menu]",
    options:[{label:"year",value:"year"},{label:"month",value:"month"},{label:"date",value:"date"},{label:"day of week",value:"day"},{label:"hour",value:"hour"},{label:"minute",value:"minute"},{label:"second",value:"second"}] },
  { cat:"sensing", type:"days_since_2000", isReporter:true, text:"days since 2000" },
  { cat:"sensing", type:"online", isReporter:true, hasCheckbox:true, text:"online?" },
  { cat:"sensing", type:"username", isReporter:true, hasCheckbox:true, text:"username" },
  { cat:"sensing", type:"backdrop_of", isReporter:true, text:"backdrop [menu] of [stage]", options:[{label:"backdrop #",value:"number"},{label:"backdrop name",value:"name"},{label:"volume",value:"volume"},{label:"my variable",value:"my variable"}], options2:[{label:"Stage",value:"stage"}] },
  { cat:"sensing", type:"set_drag_mode", text:"set drag mode [menu]", options:[{label:"draggable",value:"draggable"},{label:"not draggable",value:"not-draggable"}] },

  // ==========================================================
  // OPERATORS
  // ==========================================================

  { cat:"operators", type:"op_add", isReporter:true, text:"{1} + {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_subtract", isReporter:true, text:"{1} - {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_multiply", isReporter:true, text:"{1} * {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_divide", isReporter:true, text:"{1} / {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_random", isReporter:true, text:"pick random {1} to {10}", defaultVals:[1,10] },
  { cat:"operators", type:"op_gt", isReporter:true, text:"{1} > {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_lt", isReporter:true, text:"{1} < {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_eq", isReporter:true, text:"{1} = {1}", defaultVals:[1,1] },
  { cat:"operators", type:"op_and", isReporter:true, text:"{true} and {true}", defaultVals:["true","true"] },
  { cat:"operators", type:"op_or", isReporter:true, text:"{true} or {true}", defaultVals:["true","true"] },
  { cat:"operators", type:"op_not", isReporter:true, text:"not {true}", defaultVal:"true" },
  { cat:"operators", type:"op_join", isReporter:true, text:"join {hello } {world}", defaultVals:["hello ","world"] },
  { cat:"operators", type:"op_letter", isReporter:true, text:"letter {1} of {world}", defaultVals:[1,"world"] },
  { cat:"operators", type:"op_length", isReporter:true, text:"length of {world}", defaultVal:"world" },
  { cat:"operators", type:"op_contains", isReporter:true, text:"{world} contains {o}?", defaultVals:["world","o"] },
  { cat:"operators", type:"op_mod", isReporter:true, text:"{10} mod {3}", defaultVals:[10,3] },
  { cat:"operators", type:"op_round", isReporter:true, text:"round {3.14}", defaultVal:3.14 },
  { cat:"operators", type:"op_math", isReporter:true, text:"[menu] of {10}",
    options:[{label:"abs",value:"abs"},{label:"floor",value:"floor"},{label:"ceiling",value:"ceil"},{label:"sqrt",value:"sqrt"},{label:"sin",value:"sin"},{label:"cos",value:"cos"},{label:"tan",value:"tan"},{label:"asin",value:"asin"},{label:"acos",value:"acos"},{label:"atan",value:"atan"},{label:"ln",value:"ln"},{label:"log",value:"log"},{label:"e^",value:"e"},{label:"10^",value:"10pow"}], defaultVal:10 },

  // ==========================================================
  // VARIABLES
  // ==========================================================

  { cat:"variables", type:"set_var", text:"set [my variable] to {0}", defaultVal:0, optionsSource:"variables" },
  { cat:"variables", type:"change_var", text:"change [my variable] by {1}", defaultVal:1, optionsSource:"variables" },
  { cat:"variables", type:"show_var", text:"show variable [my variable]", optionsSource:"variables" },
  { cat:"variables", type:"hide_var", text:"hide variable [my variable]", optionsSource:"variables" },
  { cat:"variables", type:"var_reporter", isReporter:true, hasCheckbox:true, text:"[my variable]", optionsSource:"variables" },
  
  // List blocks are injected dynamically after a list is created.

  // ==========================================================
  // MY BLOCKS
  // ==========================================================
  // Custom blocks are injected dynamically after the user clicks Make a Block.
];


// ============================================================
// CANVAS
// ============================================================

const canvas =
  document.getElementById("stage");

const ctx =
  canvas
    ? canvas.getContext("2d")
    : null;

const sayBubble =
  document.getElementById("say-bubble");


