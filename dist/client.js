"use strict";
(() => {
  // src/client/main.ts
  var visible = false;
  function setVisible(next) {
    visible = next;
    SetNuiFocus(visible, visible);
    SendNUIMessage({ type: "visibility", visible });
    if (visible) {
      emitNet("pg-wrapper:requestStats");
    }
  }
  onNet("pg-wrapper:openStats", () => {
    setVisible(!visible);
  });
  onNet("pg-wrapper:stats", (payload) => {
    SendNUIMessage({ type: "stats", payload });
  });
  onNet("pg-wrapper:disabled", (reason) => {
    SendNUIMessage({ type: "disabled", reason });
  });
  RegisterNuiCallbackType("close");
  on("__cfx_nui:close", (_data, cb) => {
    setVisible(false);
    cb({ ok: true });
  });
  RegisterNuiCallbackType("refresh");
  on("__cfx_nui:refresh", (_data, cb) => {
    emitNet("pg-wrapper:requestStats");
    cb({ ok: true });
  });
})();
