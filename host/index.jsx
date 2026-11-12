/* CrewCut ExtendScript Entrypoint (loaded via CSXS ScriptPath) */

(function () {
  try {
    if (typeof $.fileName !== "string" || !$.fileName) {
      return;
    }
    var hostDir = new File($.fileName).parent;
    var files = ["common.jsx", "ppro.jsx", "aeft.jsx"];
    var i;
    var f;
    for (i = 0; i < files.length; i++) {
      f = new File(hostDir.fsName + "/" + files[i]);
      if (f.exists) {
        $.evalFile(f);
      }
    }
  } catch (eInit) {}
})();

function __ccDetectHostCode() {
  var btName = typeof BridgeTalk !== "undefined" && BridgeTalk.appName
    ? String(BridgeTalk.appName).toLowerCase()
    : "";
  if (btName.indexOf("aftereffects") !== -1) {
    return "AEFT";
  }
  if (btName.indexOf("premiere") !== -1) {
    return "PPRO";
  }
  if (typeof CompItem !== "undefined") {
    return "AEFT";
  }
  return "PPRO";
}

function ccPing() {
  try {
    var hostCode = __ccDetectHostCode();
    return __ccOk({
      host: hostCode,
      appName: typeof BridgeTalk !== "undefined" ? String(BridgeTalk.appName || "") : "",
      appVersion: typeof app !== "undefined" && app && app.version ? String(app.version) : ""
    });
  } catch (err) {
    return __ccErr(err && err.message ? err.message : err, "PING_FAILED");
  }
}

function ccGetHostContext() {
  try {
    var hostCode = __ccDetectHostCode();
    if (hostCode === "AEFT") {
      return __ccOk(__ccAeftGetContext());
    }
    return __ccOk(__ccPproGetContext());
  } catch (err) {
    return __ccErr(err && err.message ? err.message : err, "HOST_CONTEXT_FAILED");
  }
}

function ccStartRender(outputPath, workAreaOnly, targetId) {
  try {
    var hostCode = __ccDetectHostCode();
    if (hostCode === "AEFT") {
      return __ccOk(__ccAeftRenderComp(outputPath, Boolean(workAreaOnly), targetId));
    }
    return __ccOk(__ccPproStartRender(outputPath, Boolean(workAreaOnly), targetId));
  } catch (err) {
    return __ccErr(err && err.message ? err.message : err, "HOST_RENDER_FAILED");
  }
}

function ccGetRenderStatus(jobId) {
  try {
    if (__ccDetectHostCode() === "AEFT") {
      return __ccOk({ jobId: String(jobId || ""), status: "complete" });
    }
    return __ccOk(__ccPproGetRenderStatus(jobId));
  } catch (err) {
    return __ccErr(err && err.message ? err.message : err, "RENDER_STATUS_FAILED");
  }
}

function ccCancelRender(jobId) {
  try {
    if (__ccDetectHostCode() === "AEFT") {
      return __ccOk({ jobId: String(jobId || ""), status: "cancelled" });
    }
    return __ccOk(__ccPproCancelRender(jobId));
  } catch (err) {
    return __ccErr(err && err.message ? err.message : err, "RENDER_CANCEL_FAILED");
  }
}

function ccSeekPlayhead(seconds, targetId) {
  try {
    if (__ccDetectHostCode() === "AEFT") {
      return __ccOk(__ccAeftSeek(seconds, targetId));
    }
    return __ccOk(__ccPproSeek(seconds, targetId));
  } catch (err) {
    return __ccErr(err && err.message ? err.message : err, "SEEK_FAILED");
  }
}

function ccSyncMarkers(comments, targetId) {
  try {
    if (__ccDetectHostCode() === "AEFT") {
      return __ccOk(__ccAeftSyncMarkers(comments, targetId));
    }
    return __ccOk(__ccPproSyncMarkers(comments, targetId));
  } catch (err) {
    return __ccErr(err && err.message ? err.message : err, "SYNC_MARKERS_FAILED");
  }
}
