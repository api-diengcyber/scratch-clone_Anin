// GLOBAL DROPDOWN
document.addEventListener(
  "pointerdown",
  (e) => {

    if (
      e.target.closest(
        ".custom-dropdown-menu"
      )
    ) {
      return;
    }
    if (
      e.target.closest(
        ".custom-dropdown-selected"
      )
    ) {
      return;
    }
    closeAllDropdowns();
  }
);
// RESIZE
let resizeTimer =
  null;
window.addEventListener(
  "resize",
  () => {

    clearTimeout(
      resizeTimer
    );
    resizeTimer =
      setTimeout(
        () => {
          const dropdown =
            document.querySelector(
              ".custom-dropdown.open"
            );
          if (dropdown) {

            positionDropdownMenu(
              dropdown
            );
          }
          renderStage();
        },
        50
      );
  }
);
// ORIENTATION CHANGE
window.addEventListener(
  "orientationchange",
  () => {
    setTimeout(
      () => {
        const dropdown =
          document.querySelector(
            ".custom-dropdown.open"
          );
        if (dropdown) {
          positionDropdownMenu(
            dropdown
          );
        }
        renderStage();
      },
      150
    );
  }
);
// ============================================================
// SCROLL
// ============================================================
if (paletteScroll) {
  paletteScroll.addEventListener(
    "scroll",
    () => {

      closeAllDropdowns();
    },
    { passive: true }
  );
}
if (scriptArea) {

  scriptArea.addEventListener(
    "scroll",
    () => {

      closeAllDropdowns();
    },
    { passive: true }
  );
}
// TOUCH / MOBILE SAFETY
document.addEventListener(
  "touchmove",
  (e) => {

    if (
      activePointerDrag
    ) {

      e.preventDefault();
    }
  },
  { passive: false }
);
setInterval(() => {
  if (state.sensingMonitors?.timer || state.sensingMonitors?.loudness || state.sensingMonitors?.online || state.sensingMonitors?.username || state.sensingMonitors?.answer || state.sensingMonitors?.current) {
    renderSensingMonitors();
  }
  if (Object.values(state.reporterMonitors || {}).some(Boolean)) renderReporterMonitors();
  if (state.sensingMonitors?.loudness && !loudnessAnalyser) ensureLoudnessMeter();
}, 100);
// ============================================================
// INITIAL SETUP
// ============================================================
checkAuth();
initPalette();
setupSidebarNavigation();
renderStage();
renderStageVariableMonitors();
renderSensingMonitors();
renderReporterMonitors();
