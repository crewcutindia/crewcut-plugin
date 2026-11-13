/* Pure ES3 Premiere Pro (PPRO) ExtendScript handlers */

var __CC_PPRO_TICKS_PER_SEC = 254016000000;

function __ccPproTicksToSeconds(ticksVal) {
  var num = parseFloat(ticksVal);
  if (isNaN(num)) {
    return 0;
  }
  return num / __CC_PPRO_TICKS_PER_SEC;
}

function __ccPproSerializeSequence(seq) {
  var durationS = 0;
  var zeroS = 0;
  var endS = 0;
  var hasInOut = false;
  var inS = 0;
  var outS = 0;
  var playheadS = 0;

  try {
    zeroS = __ccPproTicksToSeconds(seq.zeroPoint);
    endS = __ccPproTicksToSeconds(seq.end);
    durationS = endS - zeroS;
    if (durationS < 0) {
      durationS = 0;
    }
  } catch (eDur) {}

  try {
    var pos = seq.getPlayerPosition();
    if (pos && typeof pos.seconds === "number") {
      playheadS = Math.max(0, pos.seconds - zeroS);
    }
  } catch (ePos) {}

  try {
    var inPt = seq.getInPoint();
    var outPt = seq.getOutPoint();
    if (typeof inPt === "number" && typeof outPt === "number" && inPt >= 0 && outPt > inPt && outPt <= durationS + 1) {
      hasInOut = true;
      inS = inPt;
      outS = outPt;
    }
  } catch (eIo) {}

  return {
    kind: "sequence",
    id: seq.sequenceID ? String(seq.sequenceID) : "",
    name: seq.name ? String(seq.name) : "Untitled Sequence",
    durationSeconds: Math.round(durationS * 100) / 100,
    playheadSeconds: Math.round(playheadS * 100) / 100,
    hasWorkRange: hasInOut,
    hasCustomWorkRange: hasInOut,
    rangeStartSeconds: Math.round(inS * 100) / 100,
    rangeEndSeconds: Math.round(outS * 100) / 100
  };
}

function __ccPproFindSequence(targetId) {
  var proj = app && app.project ? app.project : null;
  var wanted = targetId ? String(targetId) : "";
  var seqs;
  var i;

  if (!proj) {
    return null;
  }

  if (wanted && proj.sequences) {
    seqs = proj.sequences;
    for (i = 0; i < seqs.numSequences; i++) {
      if (seqs[i] && String(seqs[i].sequenceID) === wanted) {
        return seqs[i];
      }
    }
  }

  if (proj.activeSequence) {
    return proj.activeSequence;
  }

  if (proj.sequences && proj.sequences.numSequences > 0) {
    return proj.sequences[0];
  }

  return null;
}

function __ccPproGetContext() {
  var proj = app && app.project ? app.project : null;
  var seq = proj && proj.activeSequence ? proj.activeSequence : null;
  var seqs;
  var items = [];
  var i;
  var picked;

  if (!proj) {
    return {
      host: "PPRO",
      hostLabel: "Premiere Pro",
      appVersion: app && app.version ? String(app.version) : "",
      hasProject: false,
      hasActiveItem: false,
      activeItem: null,
      items: []
    };
  }

  try {
    seqs = proj.sequences;
    if (seqs && seqs.numSequences) {
      for (i = 0; i < seqs.numSequences; i++) {
        if (seqs[i]) {
          items.push(__ccPproSerializeSequence(seqs[i]));
        }
      }
    }
  } catch (eList) {}

  picked = seq || (seqs && seqs.numSequences > 0 ? seqs[0] : null);
  if (!picked) {
    return {
      host: "PPRO",
      hostLabel: "Premiere Pro",
      appVersion: app && app.version ? String(app.version) : "",
      hasProject: true,
      projectName: proj.name ? String(proj.name) : "Untitled Project",
      hasActiveItem: false,
      activeItem: null,
      items: items
    };
  }

  return {
    host: "PPRO",
    hostLabel: "Premiere Pro",
    appVersion: app && app.version ? String(app.version) : "",
    hasProject: true,
    projectName: proj.name ? String(proj.name) : "Untitled Project",
    hasActiveItem: true,
    activeItem: __ccPproSerializeSequence(picked),
    items: items
  };
}

var __ccPproJobs = __ccPproJobs || {};
var __ccPproJobOrder = __ccPproJobOrder || [];
var __ccPproEncoderBound = __ccPproEncoderBound || false;

function __ccPproScanPresetFolder(folderObj, depth, onlyCrewCut) {
  var entries;
  var i;
  var entry;
  var nameLower;
  var subMatch;
  var fallbackMatch = "";

  if (!folderObj || !folderObj.exists || depth > 3) {
    return "";
  }

  try {
    entries = folderObj.getFiles();
  } catch (eFiles) {
    return "";
  }

  if (!entries) {
    return "";
  }

  for (i = 0; i < entries.length; i++) {
    entry = entries[i];
    if (entry instanceof File) {
      nameLower = decodeURI(String(entry.name || "")).toLowerCase();
      if (nameLower.indexOf(".epr", nameLower.length - 4) !== -1) {
        if (nameLower.indexOf("crewcut") !== -1) {
          return entry.fsName;
        }
        if (onlyCrewCut) {
          continue;
        }
        if (nameLower.indexOf("match source - high bitrate") !== -1) {
          return entry.fsName;
        }
        if (
          !fallbackMatch &&
          (nameLower.indexOf("25mbps") !== -1 ||
            nameLower.indexOf("25 mbps") !== -1 ||
            nameLower.indexOf("match source") !== -1 ||
            nameLower.indexOf("youtube 1080p") !== -1 ||
            nameLower.indexOf("h.264") !== -1 ||
            nameLower.indexOf("h264") !== -1)
        ) {
          fallbackMatch = entry.fsName;
        }
      }
    }
  }

  if (fallbackMatch) {
    return fallbackMatch;
  }

  for (i = 0; i < entries.length; i++) {
    entry = entries[i];
    if (entry instanceof Folder) {
      subMatch = __ccPproScanPresetFolder(entry, depth + 1, onlyCrewCut);
      if (subMatch) {
        return subMatch;
      }
    }
  }

  return "";
}

function __ccPproFindH264Preset() {
  var userCandidates = [];
  var sysCandidates = [];
  var appFolder = app && app.path ? new Folder(app.path) : null;
  var adobeRoot = appFolder ? appFolder.parent : null;
  var docsAdobe = typeof Folder !== "undefined" && Folder.myDocuments
    ? new Folder(Folder.myDocuments.fsName + "/Adobe")
    : null;
  var docsEntries;
  var docName;
  var adobeSiblings;
  var i;
  var found;

  if (docsAdobe && docsAdobe.exists) {
    try {
      docsEntries = docsAdobe.getFiles();
      for (i = 0; i < docsEntries.length; i++) {
        if (docsEntries[i] instanceof Folder) {
          docName = decodeURI(String(docsEntries[i].name || "")).toLowerCase();
          if (docName.indexOf("media encoder") !== -1 || docName.indexOf("premiere") !== -1) {
            userCandidates.push(new Folder(docsEntries[i].fsName + "/Presets"));
          }
        }
      }
    } catch (eDocs) {}
  }

  for (i = 0; i < userCandidates.length; i++) {
    found = __ccPproScanPresetFolder(userCandidates[i], 0, true);
    if (found) {
      return found;
    }
  }

  if (appFolder) {
    sysCandidates.push(new Folder(appFolder.fsName + "/MediaIO/systempresets"));
    if (appFolder.parent) {
      sysCandidates.push(new Folder(appFolder.parent.fsName + "/MediaIO/systempresets"));
    }
  }

  if (adobeRoot && adobeRoot.exists) {
    try {
      adobeSiblings = adobeRoot.getFiles();
      for (i = 0; i < adobeSiblings.length; i++) {
        if (
          adobeSiblings[i] instanceof Folder &&
          decodeURI(String(adobeSiblings[i].name || "")).toLowerCase().indexOf("media encoder") !== -1
        ) {
          sysCandidates.push(new Folder(adobeSiblings[i].fsName + "/MediaIO/systempresets"));
        }
      }
    } catch (eSib) {}
  }

  for (i = 0; i < sysCandidates.length; i++) {
    found = __ccPproScanPresetFolder(sysCandidates[i], 0, false);
    if (found) {
      return found;
    }
  }

  return "";
}

function __ccPproNormalizePath(p) {
  return String(p || "").replace(/\\/g, "/").toLowerCase();
}

function __ccPproBindEncoderEvents() {
  if (__ccPproEncoderBound || !app || !app.encoder || typeof app.encoder.bind !== "function") {
    return;
  }
  __ccPproEncoderBound = true;

  app.encoder.bind("onEncoderJobComplete", function (jobID, outputFilePath) {
    var key = String(jobID || "");
    var normOut = __ccPproNormalizePath(outputFilePath);
    var i;
    var jKey;
    var job;

    if (__ccPproJobs[key]) {
      __ccPproJobs[key].status = "complete";
      if (outputFilePath) {
        __ccPproJobs[key].outputPath = String(outputFilePath);
      }
      return;
    }

    if (normOut) {
      for (i = 0; i < __ccPproJobOrder.length; i++) {
        jKey = __ccPproJobOrder[i];
        job = __ccPproJobs[jKey];
        if (job && job.status === "rendering" && __ccPproNormalizePath(job.outputPath) === normOut) {
          job.status = "complete";
          return;
        }
      }
    }
  });

  app.encoder.bind("onEncoderJobError", function (jobID, errorMessage) {
    var key = String(jobID || "");
    var i;
    var job;
    if (__ccPproJobs[key]) {
      if (__ccPproJobs[key].status !== "cancelled") {
        __ccPproJobs[key].status = "error";
        __ccPproJobs[key].error = String(errorMessage || "Adobe Media Encoder failed.");
      }
      return;
    }
    for (i = __ccPproJobOrder.length - 1; i >= 0; i--) {
      job = __ccPproJobs[__ccPproJobOrder[i]];
      if (job && job.status === "rendering") {
        job.status = "error";
        job.error = String(errorMessage || "Adobe Media Encoder failed.");
        return;
      }
    }
  });
}

function __ccPproStartRender(outputPath, workAreaOnly, targetId) {
  var proj = app && app.project ? app.project : null;
  var seq = __ccPproFindSequence(targetId);
  var presetPath;
  var outFile;
  var workAreaType;
  var jobId;
  var key;

  if (!proj || !seq) {
    throw new Error("Open an active sequence in Premiere Pro before rendering.");
  }
  if (!app.encoder) {
    throw new Error("Adobe Media Encoder bridge is unavailable in this Premiere Pro session.");
  }

  presetPath = __ccPproFindH264Preset();
  if (!presetPath) {
    throw new Error("Could not locate an Adobe H.264 (.epr) preset. Use Browse/Drop to upload an exported file.");
  }

  outFile = new File(outputPath);
  if (outFile.parent && !outFile.parent.exists) {
    outFile.parent.create();
  }

  __ccPproBindEncoderEvents();
  try {
    app.encoder.launchEncoder();
  } catch (eLaunch) {}

  workAreaType = workAreaOnly
    ? (typeof app.encoder.ENCODE_IN_TO_OUT === "number" ? app.encoder.ENCODE_IN_TO_OUT : 1)
    : (typeof app.encoder.ENCODE_ENTIRE === "number" ? app.encoder.ENCODE_ENTIRE : 0);

  jobId = app.encoder.encodeSequence(seq, outFile.fsName, presetPath, workAreaType, 1);
  if (!jobId) {
    throw new Error("Premiere Pro failed to queue the sequence in Adobe Media Encoder.");
  }

  key = String(jobId);
  __ccPproJobs[key] = {
    jobId: key,
    status: "rendering",
    outputPath: outFile.fsName,
    presetPath: presetPath,
    error: ""
  };
  __ccPproJobOrder.push(key);

  app.encoder.startBatch();

  return {
    jobId: key,
    status: "rendering",
    outputPath: outFile.fsName,
    presetPath: presetPath
  };
}

function __ccPproGetRenderStatus(jobId) {
  var key = String(jobId || "");
  var job = __ccPproJobs[key];
  var outFile;
  var fileExists = false;
  var fileSize = 0;

  if (!job) {
    throw new Error("Unknown Premiere Pro render job: " + key);
  }

  outFile = new File(job.outputPath);
  if (outFile && outFile.exists) {
    fileExists = true;
    try {
      fileSize = Number(outFile.length || 0);
    } catch (eLen) {}
  }

  return {
    jobId: job.jobId,
    status: job.status,
    outputPath: job.outputPath,
    error: job.error || "",
    fileExists: fileExists,
    fileSize: fileSize
  };
}

function __ccPproCancelRender(jobId) {
  var key = String(jobId || "");
  if (__ccPproJobs[key]) {
    __ccPproJobs[key].status = "cancelled";
  }
  return { jobId: key, status: "cancelled" };
}

function __ccPproGetSeqTiming(seq) {
  var zeroS = 0;
  var endS = 0;
  var durS = 0;
  try {
    zeroS = __ccPproTicksToSeconds(seq.zeroPoint);
    endS = __ccPproTicksToSeconds(seq.end);
    durS = Math.max(0, endS - zeroS);
  } catch (eTiming) {}
  return { zeroSeconds: zeroS, durationSeconds: durS };
}

function __ccPproSeek(seconds, targetId) {
  var proj = app && app.project ? app.project : null;
  var seq = __ccPproFindSequence(targetId);
  var timing;
  var reqS = Number(seconds);
  var clampedS;
  var targetTicks;

  if (!proj || !seq) {
    throw new Error("Open an active sequence in Premiere Pro to seek.");
  }
  if (isNaN(reqS) || reqS < 0) {
    reqS = 0;
  }

  timing = __ccPproGetSeqTiming(seq);
  clampedS = timing.durationSeconds > 0 ? Math.min(reqS, timing.durationSeconds) : reqS;
  targetTicks = Math.round((timing.zeroSeconds + clampedS) * __CC_PPRO_TICKS_PER_SEC);
  seq.setPlayerPosition(String(targetTicks));

  return { seekSeconds: Math.round(clampedS * 1000) / 1000 };
}

function __ccExtractCommentIds(text, map) {
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

function __ccPproSyncMarkers(comments, targetId) {
  var proj = app && app.project ? app.project : null;
  var seq = __ccPproFindSequence(targetId);
  var list = comments instanceof Array ? comments : [];
  var existing = {};
  var markers;
  var m;
  var timing;
  var i;
  var item;
  var id;
  var t;
  var mk;
  var added = 0;
  var skipped = 0;

  if (!proj || !seq) {
    throw new Error("Open an active sequence in Premiere Pro to sync markers.");
  }

  markers = seq.markers;
  if (!markers) {
    throw new Error("Sequence markers collection is unavailable.");
  }

  m = markers.getFirstMarker();
  while (m) {
    __ccExtractCommentIds(m.comments, existing);
    m = markers.getNextMarker(m);
  }

  timing = __ccPproGetSeqTiming(seq);

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
    if (timing.durationSeconds > 0 && t > timing.durationSeconds) {
      t = timing.durationSeconds;
    }

    var bodyText = String(item.text || item.body || "");
    if (item.voiceNoteUrl) {
      bodyText = (bodyText ? bodyText + "\n" : "") + "[Voice Note in Review]";
    }

    mk = markers.createMarker(timing.zeroSeconds + t);
    mk.name = "CrewCut: " + String(item.author || item.authorName || "Client") + (item.voiceNoteUrl ? " [Voice]" : "");
    mk.comments = bodyText + "\n[cc:" + id + "]";
    existing[id] = true;
    added++;
  }

  return { added: added, skipped: skipped };
}
