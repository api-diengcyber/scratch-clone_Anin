// ============================================================
// CATEGORY COLORS
// ============================================================

const categoryColors = {

  motion:
    "#4c97ff",

  looks:
    "#9966ff",

  sound:
    "#cf63cf",

  events:
    "#ffbf00",

  control:
    "#ffab19",

  sensing:
    "#5cb1d6",

  operators:
    "#59c059",

  variables:
    "#ff8c1a",

  myblocks:
    "#ff6680"
};


const categoryTextColors = {

  motion:
    "#ffffff",

  looks:
    "#ffffff",

  sound:
    "#ffffff",

  events:
    "#575e75",

  control:
    "#ffffff",

  sensing:
    "#ffffff",

  operators:
    "#ffffff",

  variables:
    "#ffffff",

  myblocks:
    "#ffffff"
};


// ============================================================
// DROPDOWN CSS
// ============================================================

function installDropdownStyles() {

  if (
    document.getElementById(
      "runtime-dropdown-style"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "runtime-dropdown-style";

  style.textContent = `

    .custom-dropdown {
      position: relative !important;
      display: inline-block !important;
      vertical-align: middle !important;
      min-width: 90px;
      z-index: 1000;
      touch-action: manipulation;
    }

    .custom-dropdown-selected {
      position: relative !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      min-height: 23px !important;
      padding: 3px 24px 3px 9px !important;
      border-radius: 12px !important;
      font-size: 11px !important;
      font-weight: bold !important;
      line-height: 16px !important;
      white-space: nowrap !important;
      cursor: pointer !important;
      user-select: none !important;
      box-sizing: border-box !important;
      touch-action: manipulation;
    }

    .custom-dropdown-selected::after {
      content: "▾";
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 10px;
      pointer-events: none;
    }

    .custom-dropdown-menu {
      position: fixed !important;
      display: none !important;
      min-width: 100px;
      max-width: min(300px, calc(100vw - 16px));
      max-height: min(220px, 45vh);
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      padding: 3px 0;
      border-radius: 7px;
      box-shadow:
        0 5px 18px rgba(0,0,0,.30);
      border:
        1px solid rgba(0,0,0,.18);
      z-index:
        2147483647 !important;
      box-sizing:
        border-box;
      touch-action: pan-y;
    }

    .custom-dropdown-menu.open {
      display: block !important;
    }

    .custom-dropdown-option {
      display: block !important;
      padding: 8px 10px !important;
      min-height: 32px;
      font-size: 11px !important;
      font-weight: bold !important;
      line-height: 14px !important;
      white-space: nowrap !important;
      cursor: pointer !important;
      box-sizing: border-box !important;
      touch-action: manipulation;
    }

    .custom-dropdown-option:hover {
      filter: brightness(.88);
    }

    .custom-dropdown-option:active {
      filter: brightness(.78);
    }

  `;

  document.head.appendChild(
    style
  );
}


installDropdownStyles();


// ============================================================
// CLOSE DROPDOWNS
// ============================================================

function closeAllDropdowns(
  removeMenus = false
) {

  document
    .querySelectorAll(
      ".custom-dropdown.open"
    )
    .forEach(
      (dropdown) => {

        dropdown.classList.remove(
          "open"
        );
      }
    );

  document
    .querySelectorAll(
      ".custom-dropdown-menu.open"
    )
    .forEach(
      (menu) => {

        menu.classList.remove(
          "open"
        );
      }
    );

  if (removeMenus) {

    document
      .querySelectorAll(
        ".custom-dropdown-menu"
      )
      .forEach(
        (menu) => {

          menu.remove();
        }
      );
  }
}


// ============================================================
// POSITION DROPDOWN
// ============================================================

function positionDropdownMenu(
  dropdown
) {

  if (!dropdown) {
    return;
  }

  const selected =
    dropdown.querySelector(
      ".custom-dropdown-selected"
    );

  const menu =
    dropdown._dropdownMenu;

  if (
    !selected ||
    !menu
  ) {
    return;
  }

  const rect =
    selected.getBoundingClientRect();

  menu.style.minWidth =
    `${Math.max(
      rect.width,
      100
    )}px`;

  menu.style.left =
    `${Math.round(
      rect.left
    )}px`;

  menu.style.top =
    `${Math.round(
      rect.bottom + 4
    )}px`;

  menu.classList.add(
    "open"
  );

  const menuRect =
    menu.getBoundingClientRect();

  if (
    rect.bottom +
      menuRect.height >
    window.innerHeight - 8
  ) {

    if (
      rect.top -
        menuRect.height >
      8
    ) {

      menu.style.top =
        `${Math.round(
          rect.top -
          menuRect.height -
          4
        )}px`;
    }
  }

  const maxLeft =
    window.innerWidth -
    menuRect.width -
    8;

  if (
    parseFloat(
      menu.style.left
    ) >
    maxLeft
  ) {

    menu.style.left =
      `${Math.max(
        8,
        maxLeft
      )}px`;
  }

  if (
    parseFloat(
      menu.style.left
    ) < 8
  ) {

    menu.style.left =
      "8px";
  }
}


// ============================================================
// DYNAMIC PALETTE OPTIONS
// ============================================================

function getDynamicOptions(def) {
  if (!def || !def.optionsSource) return def?.options || [];
  if (def.optionsSource === "variables") {
    const names = Object.keys(state.variables || {});
    const base = names.length ? names.map(name => ({label:name, value:name})) : [{label:"my variable", value:"my variable"}];
    const current = base[0]?.label || "my variable";
    return [...base,
      {label:"rename variable", value:"__rename_variable__", isVariableAction:true},
      {label:`delete this "${current}" variable`, value:"__delete_variable__", isVariableAction:true}
    ];
  }
  if (def.optionsSource === "lists") {
    const names = Object.keys(state.lists || {});
    return names.length ? names.map(name => ({label:name, value:name})) : [{label:"my list", value:"my list"}];
  }
  if (def.optionsSource === "myblocks") {
    return Object.keys(state.myBlocks || {}).map(name => ({label:name, value:name}));
  }
  if (def.optionsSource === "sounds") {
    return getSoundOptions();
  }
  if (def.optionsSource === "broadcasts") {
    const messages = Array.isArray(state.broadcastMessages) && state.broadcastMessages.length ? state.broadcastMessages : ["message1"];
    return [...messages.map(name => ({label:name, value:name})), {label:"new message", value:"__new_message__"}];
  }
  return def.options || [];
}

// ============================================================
// CREATE CUSTOM DROPDOWN
// ============================================================

function createCustomDropdown(
  def
) {

  const dropdown =
    document.createElement("div");

  dropdown.className =
    `custom-dropdown dropdown-${def.cat}`;

  const categoryColor =
    categoryColors[def.cat] ||
    "#4c97ff";

  const categoryTextColor =
    categoryTextColors[def.cat] ||
    "#ffffff";

  const firstOption =
    def.options &&
    def.options.length
      ? (def.options.find((o) => !o.isSoundAction) || null)
      : null;

  if (def.optionsSource === "sounds") {
    dropdown.dataset.source = "sounds";
  }

  dropdown.dataset.value =
    firstOption
      ? firstOption.value
      : "";

  dropdown.style.setProperty(
    "--dropdown-color",
    categoryColor
  );

  dropdown.style.setProperty(
    "--dropdown-text",
    categoryTextColor
  );

  const selected =
    document.createElement("div");

  selected.className =
    "custom-dropdown-selected";

  selected.textContent =
    firstOption
      ? firstOption.label
      : (def.optionsSource === "sounds" ? "—" : "");

  selected.style.backgroundColor =
    categoryColor;

  selected.style.color =
    categoryTextColor;

  selected.setAttribute(
    "role",
    "button"
  );

  selected.setAttribute(
    "tabindex",
    "0"
  );

  const menu =
    document.createElement("div");

  menu.className =
    "custom-dropdown-menu";

  menu.style.backgroundColor =
    categoryColor;

  menu.style.color =
    categoryTextColor;

  document.body.appendChild(
    menu
  );

  dropdown._dropdownMenu =
    menu;


  function buildMenuOptions(optionList) {

    optionList.forEach(
      (option) => {

        const optionElement =
          document.createElement("div");

        optionElement.className =
          "custom-dropdown-option";

        optionElement.textContent =
          option.label;

        optionElement.dataset.value =
          option.value;

        optionElement.style.backgroundColor =
          categoryColor;

        optionElement.style.color =
          categoryTextColor;


        optionElement.addEventListener(
          "pointerdown",
          (e) => {

            e.preventDefault();
            e.stopPropagation();

            if (def.optionsSource === "variables" && option.value === "__rename_variable__") {
              const oldName = dropdown.dataset.value || Object.keys(state.variables || {})[0] || "my variable";
              const nextName = String(window.prompt(`Rename variable "${oldName}"`, oldName) || "").trim();
              if (nextName && nextName !== oldName && state.variables[oldName] !== undefined && state.variables[nextName] === undefined) {
                state.variables[nextName] = state.variables[oldName];
                delete state.variables[oldName];
                state.variableMeta[nextName] = state.variableMeta[oldName] || {visible:true, scope:"all"};
                delete state.variableMeta[oldName];
                renderVariablePaletteAndMonitors();
              }
              closeAllDropdowns();
              return;
            }

            if (def.optionsSource === "variables" && option.value === "__delete_variable__") {
              const name = dropdown.dataset.value || Object.keys(state.variables || {})[0] || "my variable";
              if (state.variables[name] !== undefined && window.confirm(`Delete variable "${name}"?`)) {
                delete state.variables[name];
                delete state.variableMeta[name];
                renderVariablePaletteAndMonitors();
              }
              closeAllDropdowns();
              return;
            }

            if (def.optionsSource === "sounds" && option.value === "__record_sound__") {
              closeAllDropdowns();
              openSoundRecorder((snd) => {
                dropdown.dataset.value = snd.name;
                selected.textContent = snd.name;
              });
              return;
            }

            if (def.optionsSource === "broadcasts" && option.value === "__new_message__") {
              const message = window.prompt("New Message", "");
              const clean = String(message || "").trim();
              if (clean) {
                state.broadcastMessages = Array.isArray(state.broadcastMessages) ? state.broadcastMessages : ["message1"];
                if (!state.broadcastMessages.includes(clean)) state.broadcastMessages.push(clean);
                dropdown.dataset.value = clean;
                selected.textContent = clean;
              }
              closeAllDropdowns();
              return;
            }

            dropdown.dataset.value =
              option.value;

            selected.textContent =
              option.label;

            closeAllDropdowns();
          }
        );


        optionElement.addEventListener(
          "click",
          (e) => {

            e.preventDefault();
            e.stopPropagation();
          }
        );


        menu.appendChild(
          optionElement
        );
      }
    );
  }

  if (def.options && def.options.length) {
    buildMenuOptions(def.options);
  }

  dropdown._rebuildOptions = (list) => {
    menu.innerHTML = "";
    buildMenuOptions(list);
    const current = list.find(
      (o) => !o.isSoundAction && o.value === dropdown.dataset.value
    );
    if (current) {
      selected.textContent = current.label;
    } else {
      const fallback = list.find((o) => !o.isSoundAction);
      dropdown.dataset.value = fallback ? fallback.value : "";
      selected.textContent = fallback ? fallback.label : "—";
    }
  };

  function toggleDropdown(e) {

    e.preventDefault();
    e.stopPropagation();

    const wasOpen =
      dropdown.classList.contains(
        "open"
      );

    closeAllDropdowns();

    if (wasOpen) {
      return;
    }

    if (def.optionsSource === "variables") {
      const currentName = dropdown.dataset.value || Object.keys(state.variables || {})[0] || "my variable";
      menu.querySelectorAll('[data-value="__delete_variable__"]').forEach(el => { el.textContent = `delete this "${currentName}" variable`; });
    }

    dropdown.classList.add(
      "open"
    );

    positionDropdownMenu(
      dropdown
    );
  }


  selected.addEventListener(
    "pointerdown",
    toggleDropdown
  );


  selected.addEventListener(
    "click",
    (e) => {

      e.preventDefault();
      e.stopPropagation();
    }
  );


  menu.addEventListener(
    "pointerdown",
    (e) => {
      e.stopPropagation();
    }
  );


  menu.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
    }
  );


  dropdown.addEventListener(
    "pointerdown",
    (e) => {
      e.stopPropagation();
    }
  );


  selected.addEventListener(
    "keydown",
    (e) => {

      if (
        e.key === "Enter" ||
        e.key === " "
      ) {

        e.preventDefault();

        toggleDropdown(e);
      }

      if (
        e.key === "Escape"
      ) {

        closeAllDropdowns();
      }
    }
  );


  dropdown.appendChild(
    selected
  );

  return dropdown;
}


// ============================================================
// DRAG PROTECTION
// ============================================================

function protectInteractiveElement(
  element,
  owner
) {

  if (
    !element ||
    !owner
  ) {
    return;
  }

  const original =
    owner.draggable;

  element.addEventListener(
    "pointerdown",
    (e) => {

      e.stopPropagation();

      owner.draggable =
        false;

      const restore =
        () => {

          owner.draggable =
            original;

          window.removeEventListener(
            "pointerup",
            restore
          );

          window.removeEventListener(
            "mouseup",
            restore
          );
        };

      window.addEventListener(
        "pointerup",
        restore
      );

      window.addEventListener(
        "mouseup",
        restore
      );
    }
  );

  element.addEventListener(
    "mousedown",
    (e) => {
      e.stopPropagation();
    }
  );

  element.addEventListener(
    "touchstart",
    (e) => {
      e.stopPropagation();
    },
    { passive: true }
  );
}


