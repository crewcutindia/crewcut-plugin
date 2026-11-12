/* Pure ES3 After Effects (AEFT) ExtendScript handlers */

function __ccAeftSerializeComp(comp) {
  var dur = Number(comp.duration || 0);
  var ws = Number(comp.workAreaStart || 0);
  var wd = Number(comp.workAreaDuration || 0);
  var we = ws + wd;
  var hasCustom = Boolean(dur > 0 && (ws > 0.01 || Math.abs(wd - dur) > 0.05));
  return {
    kind: "composition",
    id: comp.id ? String(comp.id) : "",
    name: comp.name ? String(comp.name) : "Untitled Comp",
    durationSeconds: Math.round(dur * 100) / 100,
    playheadSeconds: Math.round(Number(comp.time || 0) * 100) / 100,
    hasWorkRange: wd > 0,
    hasCustomWorkRange: hasCustom,
    rangeStartSeconds: Math.round(ws * 100) / 100,
    rangeEndSeconds: Math.round(we * 100) / 100,
    frameRate: Number(comp.frameRate || 0),
    width: Number(comp.width || 0),
    height: Number(comp.height || 0)
  };
}

function __ccAeftDetectActiveComp(proj) {
  var item = proj ? proj.activeItem : null;
  var sel;
  var i;

  if (item && (item instanceof CompItem)) {
    return item;
  }

  try {
    sel = proj ? proj.selection : null;
    if (sel && sel.length) {
      for (i = 0; i < sel.length; i++) {
        if (sel[i] && (sel[i] instanceof CompItem)) {
          return sel[i];
        }
      }
    }
  } catch (eSel) {}

  return null;
}

function __ccAeftListComps(proj) {
  var out = [];
  var i;
  var item;
  if (!proj) {
    return out;
  }
  try {
    for (i = 1; i <= proj.numItems; i++) {
      item = proj.item(i);
      if (item && (item instanceof CompItem)) {
        out.push(item);
      }
    }
  } catch (eList) {}
  return out;
}

function __ccAeftFindComp(targetId) {
  var proj = app && app.project ? app.project : null;
  var wanted = targetId ? String(targetId) : "";
  var comps;
  var i;
  var active;

  if (!proj) {
    return null;
  }

  if (wanted) {
    comps = __ccAeftListComps(proj);
    for (i = 0; i < comps.length; i++) {
      if (String(comps[i].id) === wanted) {
        return comps[i];
      }
    }
  }

  active = __ccAeftDetectActiveComp(proj);
  if (active) {
    return active;
  }

  comps = comps || __ccAeftListComps(proj);
  return comps.length > 0 ? comps[0] : null;
}

function __ccAeftGetContext() {
  var proj = app && app.project ? app.project : null;
  var projectName = "Untitled Project";
  var comps;
  var items = [];
  var i;
  var activeComp;
  var selectedComp;
  var serializedActive = null;

  if (!proj) {
    return {
      host: "AEFT",
      hostLabel: "After Effects",
      appVersion: app && app.version ? String(app.version) : "",
      hasProject: false,
      hasActiveItem: false,
      activeItem: null,
      items: []
    };
  }

  try {
    if (proj.file && proj.file.name) {
      projectName = decodeURI(String(proj.file.name));
    } else if (proj.numItems > 0) {
      projectName = "Unsaved Project";
    }
  } catch (eName) {}

  comps = __ccAeftListComps(proj);
  for (i = 0; i < comps.length; i++) {
    items.push(__ccAeftSerializeComp(comps[i]));
  }

  activeComp = __ccAeftDetectActiveComp(proj);
  selectedComp = activeComp || (comps.length > 0 ? comps[0] : null);
  if (selectedComp) {
    serializedActive = __ccAeftSerializeComp(selectedComp);
  }

  return {
    host: "AEFT",
    hostLabel: "After Effects",
    appVersion: app && app.version ? String(app.version) : "",
    hasProject: true,
    projectName: projectName,
    hasActiveItem: Boolean(serializedActive),
    activeItem: serializedActive,
    items: items
  };
}

function __ccAeftRequireActiveComp(targetId) {
  var comp = __ccAeftFindComp(targetId);
  if (!comp) {
    throw new Error("Open or create a composition in After Effects first.");
  }
  return comp;
}

function __ccAeftPickOutputTemplate(templates) {
  var list = templates || [];
  var i;
  var name;
  var lower;
  var customCrewCut = "";
  var custom25 = "";
  var h264Forty = "";
  var h264Fifteen = "";
  var h264Candidate = "";
  var proresCandidate = "";
  var losslessCandidate = "";

  for (i = 0; i < list.length; i++) {
    name = String(list[i] || "");
    lower = name.toLowerCase();
    if (!customCrewCut && lower.indexOf("crewcut") !== -1) {
      customCrewCut = name;
    }
    if (!custom25 && (lower.indexOf("h.264") !== -1 || lower.indexOf("h264") !== -1) && lower.indexOf("25") !== -1) {
      custom25 = name;
    }
    if (!h264Forty && lower === "h.264 - match render settings - 40 mbps") {
      h264Forty = name;
    }
    if (!h264Fifteen && lower === "h.264 - match render settings - 15 mbps") {
      h264Fifteen = name;
    }
    if (!h264Candidate && (lower.indexOf("h.264") === 0 || lower.indexOf("h264") !== -1 || lower.indexOf("mp4") !== -1)) {
      h264Candidate = name;
    }
    if (!proresCandidate && (lower.indexOf("prores 422") !== -1 || lower.indexOf("quicktime") !== -1)) {
      proresCandidate = name;
    }
    if (!losslessCandidate && lower === "lossless") {
      losslessCandidate = name;
    }
  }

  if (customCrewCut) {
    return { template: customCrewCut, ext: ".mp4", codec: "h264", isCustom: true };
  }
  if (custom25) {
    return { template: custom25, ext: ".mp4", codec: "h264", isCustom: true };
  }
  if (h264Forty) {
    return { template: h264Forty, ext: ".mp4", codec: "h264", isCustom: false };
  }
  if (h264Fifteen) {
    return { template: h264Fifteen, ext: ".mp4", codec: "h264", isCustom: false };
  }
  if (h264Candidate) {
    return { template: h264Candidate, ext: ".mp4", codec: "h264", isCustom: false };
  }
  if (proresCandidate) {
    return { template: proresCandidate, ext: ".mov", codec: "prores", isCustom: false };
  }
  if (losslessCandidate) {
    return { template: losslessCandidate, ext: "", codec: "lossless", isCustom: false };
  }
  return { template: "", ext: "", codec: "default", isCustom: false };
}

function __ccAeftSwapExt(filePath, newExt) {
  if (!newExt) {
    return filePath;
  }
  return String(filePath).replace(/\.[a-z0-9]{2,5}$/i, "") + newExt;
}

function __ccAeftRenderComp(outputPath, workAreaOnly, targetId) {
  var comp = __ccAeftRequireActiveComp(targetId);
  var rq = app.project.renderQueue;
  var pausedExisting = [];
  var i;
  var existingItem;
  var rqItem;
  var om;
  var picked;
  var targetPath;
  var outFile;
  var finalFile;

  if (rq.rendering) {
    throw new Error("Wait for After Effects Render Queue to finish its active render first.");
  }

  for (i = 1; i <= rq.numItems; i++) {
    existingItem = rq.item(i);
    if (
      existingItem &&
      existingItem.render &&
      (typeof RQItemStatus === "undefined" || existingItem.status === RQItemStatus.QUEUED)
    ) {
      try {
        existingItem.render = false;
        pausedExisting.push(existingItem);
      } catch (ePause) {}
    }
  }

  rqItem = rq.items.add(comp);
  try {
    rqItem.applyTemplate("Best Settings");
  } catch (eBest) {}

  try {
    if (workAreaOnly) {
      rqItem.timeSpanStart = comp.workAreaStart;
      rqItem.timeSpanDuration = comp.workAreaDuration;
    } else {
      rqItem.timeSpanStart = 0;
      rqItem.timeSpanDuration = comp.duration;
    }
  } catch (eSpan) {}

  om = rqItem.outputModule(1);
  picked = __ccAeftPickOutputTemplate(om.templates);
  targetPath = __ccAeftSwapExt(outputPath, picked.ext);
  outFile = new File(targetPath);
  if (outFile.parent && !outFile.parent.exists) {
    outFile.parent.create();
  }

  if (picked.template) {
    try {
      om.applyTemplate(picked.template);
    } catch (eTmpl) {
      throw new Error("Could not apply Output Module template '" + picked.template + "'.");
    }
  }
  om.file = outFile;

  try {
    rq.render();
  } finally {
    finalFile = om.file;
    try {
      rqItem.remove();
    } catch (eRm) {}
    for (i = 0; i < pausedExisting.length; i++) {
      try {
        pausedExisting[i].render = true;
      } catch (eRestore) {}
    }
  }

  if (!finalFile || !finalFile.exists || Number(finalFile.length || 0) <= 0) {
    throw new Error("After Effects render finished without producing an output file.");
  }

  return {
    jobId: "ae-" + String(new Date().getTime()),
    status: "complete",
    outputPath: finalFile.fsName,
    template: picked.template || "default",
    usedCustomPreset: Boolean(picked.isCustom)
  };
}

function __ccAeftSeek(seconds, targetId) {
  var comp = __ccAeftRequireActiveComp(targetId);
  var reqS = Number(seconds);
  var durS = Number(comp.duration || 0);
  var clampedS;

  if (isNaN(reqS) || reqS < 0) {
    reqS = 0;
  }
  clampedS = durS > 0 ? Math.min(reqS, durS) : reqS;
  comp.time = clampedS;
  try {
    comp.openInViewer();
  } catch (eViewer) {}

  return { seekSeconds: Math.round(clampedS * 1000) / 1000 };
}

function __ccAeftExtractIds(text, map) {
  var str = String(text || "");
  var idx = 0;
  var start;
  var end;
  var id;
  while (idx < str.length) {
    start = str.indexOf("[cc:", idx);
    if (start === -1) {
      break;
    }
    end = str.indexOf("]", start + 4);
    if (end === -1) {
      break;
    }
    id = str.substring(start + 4, end);
    if (id) {
      map[id] = true;
    }
    idx = end + 1;
  }
}

function __ccAeftSyncMarkers(comments, targetId) {
  var comp = __ccAeftRequireActiveComp(targetId);
  var mp = comp.markerProperty;
  var list = comments instanceof Array ? comments : [];
  var existing = {};
  var k;
  var keyVal;
  var durS = Number(comp.duration || 0);
  var i;
  var item;
  var id;
  var t;
  var mv;
  var added = 0;
  var skipped = 0;

  if (!mp) {
    throw new Error("Composition marker property is unavailable.");
  }

  for (k = 1; k <= mp.numKeys; k++) {
    keyVal = mp.keyValue(k);
    if (keyVal && keyVal.comment) {
      __ccAeftExtractIds(keyVal.comment, existing);
    }
  }

  app.beginUndoGroup("CrewCut Sync Markers");
  try {
    for (i = 0; i < list.length; i++) {
      item = list[i];
      if (!item) {
        continue;
      }
      id = item.id ? String(item.id) : "";
      if (!id) {
        continue;
      }
      if (existing[id]) {
        skipped++;
        continue;
      }

      t = Number(item.timecodeSeconds);
      if (isNaN(t) || t < 0) {
        t = 0;
      }
      if (durS > 0 && t > durS) {
        t = durS;
      }

      mv = new MarkerValue(String(item.text || item.body || "") + "\n[cc:" + id + "]");
      try {
        mv.chapter = String(item.author || item.authorName || "Client");
      } catch (eChap) {}
      mp.setValueAtTime(t, mv);
      existing[id] = true;
      added++;
    }
  } finally {
    app.endUndoGroup();
  }

  return { added: added, skipped: skipped };
}
