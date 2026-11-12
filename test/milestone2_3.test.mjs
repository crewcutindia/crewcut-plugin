import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createApiClient } = require('../client/lib/api.js');
const { startSignedTusUpload, detectMimeType, stripExtension } = require('../client/lib/uploader.js');
const { toFsPath } = require('../client/lib/cepBridge.js');
import url from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('api.signUpload sends expected payload and headers', async () => {
  const calls = [];
  const client = createApiClient({
    apiBaseUrl: 'https://example.supabase.co/functions/v1',
    apiKey: 'cc_live_0123456789abcdef0123456789abcdef',
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          videoId: 'vid-1',
          providerVideoId: 'bunny-1',
          tusEndpoint: 'https://video.bunnycdn.com/tusupload',
          reviewToken: 'abc123xyz',
          reviewUrl: 'https://beta.crewcut.in/review/abc123xyz',
          authHeaders: { LibraryId: '799214', VideoId: 'bunny-1' },
        }),
      };
    },
  });

  const signed = await client.signUpload({
    title: 'Cut v2',
    sizeBytes: 1048576,
    folderId: 'fld-9',
    instantPlayback: true,
    estimatedDurationSeconds: 42.6,
  });

  assert.equal(signed.videoId, 'vid-1');
  assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/upload-sign');
  assert.deepEqual(calls[0].body, {
    title: 'Cut v2',
    sizeBytes: 1048576,
    folderId: 'fld-9',
    isPremium: false,
    instantPlayback: true,
    estimatedDurationSeconds: 43,
  });
});

test('uploader helper handles MIME detection, temp cleanup, pause/resume, cancel, and quota check', async () => {
  assert.equal(detectMimeType('master.mov'), 'video/quicktime');
  assert.equal(detectMimeType('clip.MKV'), 'video/x-matroska');
  assert.equal(detectMimeType('cut.mp4'), 'video/mp4');
  assert.equal(stripExtension('Master Cut v4.mp4'), 'Master Cut v4');

  const deleted = [];
  const phases = [];
  const mockApi = {
    signUpload: async () => ({
      videoId: 'vid-99',
      providerVideoId: 'b-99',
      tusEndpoint: 'https://video.bunnycdn.com/tusupload',
      reviewToken: 'tok123456',
      reviewUrl: 'https://beta.crewcut.in/review/tok123456',
      authHeaders: { AuthorizationSignature: 'sig', LibraryId: '799214', VideoId: 'b-99' },
    }),
    markUploaded: async (p) => ({ success: true, video: { id: p.videoId, status: 'processing' } }),
  };
  const mockCep = {
    createNodeReadStream: () => ({ destroy() {} }),
    deleteFileSafe: (p) => { deleted.push(p); return true; },
  };

  // 1. Pre-flight quota check cleans up temp files without hitting signUpload
  const overQuota = startSignedTusUpload({
    api: mockApi,
    cep: mockCep,
    tusLib: { Upload: function () {} },
    filePath: '/tmp/too-big.mp4',
    fileName: 'too-big.mp4',
    sizeBytes: 5000,
    isTempFile: true,
    remainingBytes: 1000,
  });
  await assert.rejects(overQuota.promise, /exceeds remaining storage quota/);
  assert.deepEqual(deleted, ['/tmp/too-big.mp4']);

  // 2. Happy path + Pause/Resume deletes temp render only when isTempFile=true
  deleted.length = 0;
  let capturedInstance = null;
  class FakeTusUpload {
    constructor(input, opts) {
      this.input = input;
      this.opts = opts;
      this.aborted = false;
      capturedInstance = this;
    }
    start() {
      this.aborted = false;
      this.opts.onProgress(500, 1000);
    }
    abort() {
      this.aborted = true;
      return Promise.resolve();
    }
  }

  const handle = startSignedTusUpload({
    api: mockApi,
    cep: mockCep,
    tusLib: { Upload: FakeTusUpload },
    filePath: '/tmp/render.mp4',
    fileName: 'render.mp4',
    sizeBytes: 1000,
    isTempFile: true,
    title: 'Master Cut',
    remainingBytes: 10000,
    onPhase: (p) => phases.push(p),
  });

  await new Promise((r) => setTimeout(r, 15));
  assert.equal(handle.pause(), true);
  assert.equal(handle.isPaused(), true);
  assert.equal(handle.resume(), true);
  assert.equal(handle.isPaused(), false);

  capturedInstance.opts.onSuccess();
  const res = await handle.promise;
  assert.equal(res.reviewUrl, 'https://beta.crewcut.in/review/tok123456');
  assert.deepEqual(deleted, ['/tmp/render.mp4']);
  assert.equal(phases.includes('finalizing'), true);
  assert.equal(phases.includes('done'), true);

  // 3. Cancel stops active TUS upload and never leaves local user files deleted when isTempFile=false
  deleted.length = 0;
  const cancelHandle = startSignedTusUpload({
    api: mockApi,
    cep: mockCep,
    tusLib: { Upload: FakeTusUpload },
    filePath: '/users/editor/final.mp4',
    fileName: 'final.mp4',
    sizeBytes: 1000,
    isTempFile: false,
    remainingBytes: 10000,
  });
  await new Promise((r) => setTimeout(r, 15));
  await cancelHandle.cancel();
  await assert.rejects(cancelHandle.promise, (err) => err && err.code === 'CANCELLED');
  assert.deepEqual(deleted, []);
});

test('ExtendScript PPRO seek, AME status, and idempotent marker sync work under ES3 vm', () => {
  const sources = {
    common: fs.readFileSync(path.join(repoRoot, 'host', 'common.jsx'), 'utf8'),
    ppro: fs.readFileSync(path.join(repoRoot, 'host', 'ppro.jsx'), 'utf8'),
  };

  let seekedTicks = null;
  const createdMarkers = [];
  const existingMarkers = [
    { name: 'CrewCut: Alice', comments: 'Old note\n[cc:cmt-1]' },
  ];

  const markerCollection = {
    getFirstMarker: () => existingMarkers[0] || null,
    getNextMarker: (cur) => {
      const idx = existingMarkers.indexOf(cur);
      return idx >= 0 && idx + 1 < existingMarkers.length ? existingMarkers[idx + 1] : null;
    },
    createMarker: (sec) => {
      const mk = { startSeconds: sec, name: '', comments: '' };
      existingMarkers.push(mk);
      createdMarkers.push(mk);
      return mk;
    },
  };

  const pproCtx = vm.createContext({
    BridgeTalk: { appName: 'premierepro' },
    app: {
      version: '25.1.0',
      project: {
        name: 'Spot.prproj',
        activeSequence: {
          sequenceID: 's-1',
          name: 'Spot 30s',
          zeroPoint: String(254016000000 * 3600),
          end: String(254016000000 * 3630),
          setPlayerPosition: (ticks) => { seekedTicks = ticks; },
          markers: markerCollection,
        },
      },
    },
  });

  vm.runInContext(sources.common, pproCtx);
  vm.runInContext(sources.ppro, pproCtx);

  const seekRes = JSON.parse(vm.runInContext('__ccOk(__ccPproSeek(12.5))', pproCtx));
  assert.equal(seekRes.ok, true);
  assert.equal(seekRes.data.seekSeconds, 12.5);
  assert.equal(seekedTicks, String(Math.round((3600 + 12.5) * 254016000000)));

  const commentsArg = JSON.stringify([
    { id: 'cmt-1', author: 'Alice', text: 'Old note', timecodeSeconds: 3 },
    { id: 'cmt-2', author: 'Bob', text: 'Tighten cut', timecodeSeconds: 18 },
  ]);
  const sync1 = JSON.parse(vm.runInContext(`__ccOk(__ccPproSyncMarkers(${commentsArg}))`, pproCtx));
  assert.equal(sync1.data.added, 1);
  assert.equal(sync1.data.skipped, 1);
  assert.equal(createdMarkers[0].startSeconds, 3618);
  assert.equal(createdMarkers[0].name, 'CrewCut: Bob');
  assert.match(createdMarkers[0].comments, /Tighten cut\n\[cc:cmt-2\]/);

  // Re-running sync must add 0 duplicates
  const sync2 = JSON.parse(vm.runInContext(`__ccOk(__ccPproSyncMarkers(${commentsArg}))`, pproCtx));
  assert.equal(sync2.data.added, 0);
  assert.equal(sync2.data.skipped, 2);

  // Test PPRO AME job completion by normalized output path fallback
  const listeners = {};
  function FakeFolder(p) {
    this.fsName = p;
    this.exists = p.indexOf('MediaIO/systempresets') !== -1;
    this.parent = p === 'C:/Adobe/Premiere' ? new FakeFolder('C:/Adobe') : null;
    this.getFiles = () => {
      if (p.indexOf('MediaIO/systempresets') !== -1) {
        return [new FakeFile('C:/Adobe/Premiere/MediaIO/systempresets/Match Source - High bitrate.epr')];
      }
      return [];
    };
  }
  function FakeFile(p) {
    this.fsName = p;
    this.name = p.split('/').pop();
    this.exists = p.endsWith('.epr') || p.endsWith('out.mp4');
    this.length = 2048;
    this.parent = { exists: true, create() {} };
  }
  const ameCtx = vm.createContext({
    BridgeTalk: { appName: 'premierepro' },
    Folder: FakeFolder,
    File: FakeFile,
    app: {
      path: 'C:/Adobe/Premiere/Adobe Premiere Pro.exe',
      encoder: {
        ENCODE_IN_TO_OUT: 1,
        ENCODE_ENTIRE: 0,
        launchEncoder() {},
        bind: (evt, fn) => { listeners[evt] = fn; },
        encodeSequence: () => 'job-42',
        startBatch() {},
      },
      project: { name: 'Spot.prproj', activeSequence: { name: 'Spot 30s' } },
    },
  });
  vm.runInContext(sources.common, ameCtx);
  vm.runInContext(sources.ppro, ameCtx);
  const startJob = JSON.parse(vm.runInContext('__ccOk(__ccPproStartRender("C:/tmp/out.mp4", true))', ameCtx));
  assert.equal(startJob.data.status, 'rendering');
  assert.equal(startJob.data.jobId, 'job-42');
  listeners.onEncoderJobComplete('ame-internal-id', 'c:\\tmp\\out.mp4');
  const statusAfter = JSON.parse(vm.runInContext('__ccOk(__ccPproGetRenderStatus("job-42"))', ameCtx));
  assert.equal(statusAfter.data.status, 'complete');
});

test('ExtendScript AEFT seek and idempotent marker sync work under ES3 vm', () => {
  const sources = {
    common: fs.readFileSync(path.join(repoRoot, 'host', 'common.jsx'), 'utf8'),
    aeft: fs.readFileSync(path.join(repoRoot, 'host', 'aeft.jsx'), 'utf8'),
  };

  const markerKeys = [];
  function MarkerValue(comment) {
    this.comment = comment;
    this.chapter = '';
  }
  function CompItem() {}

  const activeComp = Object.assign(new CompItem(), {
    id: 9,
    name: 'EndTag_Comp',
    duration: 20,
    time: 0,
    workAreaStart: 0,
    workAreaDuration: 20,
    openInViewerCalled: false,
    openInViewer() { this.openInViewerCalled = true; },
    markerProperty: {
      get numKeys() { return markerKeys.length; },
      keyValue: (k) => markerKeys[k - 1].value,
      setValueAtTime: (t, mv) => { markerKeys.push({ time: t, value: mv }); },
    },
  });

  const aeftCtx = vm.createContext({
    BridgeTalk: { appName: 'aftereffects' },
    CompItem,
    MarkerValue,
    app: {
      version: '25.0.0',
      beginUndoGroup() {},
      endUndoGroup() {},
      project: { activeItem: activeComp },
    },
  });

  vm.runInContext(sources.common, aeftCtx);
  vm.runInContext(sources.aeft, aeftCtx);

  const seekRes = JSON.parse(vm.runInContext('__ccOk(__ccAeftSeek(9.25))', aeftCtx));
  assert.equal(seekRes.data.seekSeconds, 9.25);
  assert.equal(activeComp.time, 9.25);
  assert.equal(activeComp.openInViewerCalled, true);

  const commentsArg = JSON.stringify([
    { id: 'c10', author: 'Nina', text: 'Brighten logo', timecodeSeconds: 7.5 },
  ]);
  const sync1 = JSON.parse(vm.runInContext(`__ccOk(__ccAeftSyncMarkers(${commentsArg}))`, aeftCtx));
  assert.deepEqual(sync1.data, { added: 1, skipped: 0 });
  assert.equal(markerKeys[0].time, 7.5);
  assert.equal(markerKeys[0].value.chapter, 'Nina');

  const sync2 = JSON.parse(vm.runInContext(`__ccOk(__ccAeftSyncMarkers(${commentsArg}))`, aeftCtx));
  assert.deepEqual(sync2.data, { added: 0, skipped: 1 });

  // Test AEFT render template selection (.mp4 via H.264), skipping DONE/STOPPED RQ items, & restoring QUEUED items
  const RQItemStatus = { QUEUED: 2615, STOPPED: 2618, DONE: 2619, RENDERING: 2616 };
  const preExistingRqItem = { status: RQItemStatus.QUEUED, render: true };
  const doneRqItem = {
    status: RQItemStatus.DONE,
    get render() { return true; },
    set render(_) { throw new Error('Can not set attribute "render" when RenderQueueItem status is RENDERING, STOPPED, or DONE.'); },
  };
  let addedRqItem = null;
  let renderedPreExistingAtRenderTime = null;
  function FakeAeFile(p) {
    this.fsName = p;
    this.exists = true;
    this.length = 4096;
    this.parent = { exists: true, create() {} };
  }
  const aeRenderCtx = vm.createContext({
    BridgeTalk: { appName: 'aftereffects' },
    CompItem,
    RQItemStatus,
    File: FakeAeFile,
    app: {
      project: {
        activeItem: activeComp,
        renderQueue: {
          rendering: false,
          numItems: 2,
          item: (i) => (i === 1 ? doneRqItem : preExistingRqItem),
          items: {
            add: () => {
              addedRqItem = {
                timeSpanStart: 0,
                timeSpanDuration: 0,
                appliedTemplates: [],
                applyTemplate(t) { this.appliedTemplates.push(t); },
                removed: false,
                remove() { this.removed = true; },
                om: {
                  templates: ['Lossless', 'H.264 - Match Render Settings - 15 Mbps'],
                  file: null,
                  appliedOm: '',
                  applyTemplate(t) { this.appliedOm = t; },
                },
                outputModule() { return this.om; },
              };
              return addedRqItem;
            },
          },
          render: () => { renderedPreExistingAtRenderTime = preExistingRqItem.render; },
        },
      },
    },
  });
  vm.runInContext(sources.common, aeRenderCtx);
  vm.runInContext(sources.aeft, aeRenderCtx);
  const aeRender = JSON.parse(vm.runInContext('__ccOk(__ccAeftRenderComp("C:/tmp/cut.mov", false))', aeRenderCtx));
  assert.equal(aeRender.data.status, 'complete');
  assert.equal(aeRender.data.template, 'H.264 - Match Render Settings - 15 Mbps');
  assert.equal(aeRender.data.outputPath, 'C:/tmp/cut.mp4');
  assert.equal(renderedPreExistingAtRenderTime, false);
  assert.equal(preExistingRqItem.render, true);
  assert.equal(addedRqItem.removed, true);
});

test('HTML loads classic uploader.js script and native progress element', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'client', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /type="module"/);
  assert.match(html, /<script defer src="\.\/lib\/uploader\.js"><\/script>/);
  assert.match(html, /<progress id="upload-progress-bar"/);
});

test('CEP file:// URI paths convert to native OS filesystem paths', () => {
  assert.equal(
    toFsPath('file:///C:/Users/Ishant/AppData/Roaming', url),
    'C:\\Users\\Ishant\\AppData\\Roaming'
  );
  assert.equal(
    toFsPath('file:///C:/Users/John%20Doe/AppData/Roaming', url),
    'C:\\Users\\John Doe\\AppData\\Roaming'
  );
  assert.equal(toFsPath('C:\\Users\\Ishant\\AppData\\Roaming', url), 'C:\\Users\\Ishant\\AppData\\Roaming');
});

test('AEFT lists all project comps and renders targetId comp work area even when panel loses focus', () => {
  const sources = {
    common: fs.readFileSync(path.join(repoRoot, 'host', 'common.jsx'), 'utf8'),
    aeft: fs.readFileSync(path.join(repoRoot, 'host', 'aeft.jsx'), 'utf8'),
  };
  function CompItem() {}
  const comp1 = Object.assign(new CompItem(), {
    id: 1, name: 'Comp 1', duration: 10, time: 0, workAreaStart: 0, workAreaDuration: 10,
  });
  const comp6 = Object.assign(new CompItem(), {
    id: 6, name: 'Comp 6', duration: 30, time: 0, workAreaStart: 4, workAreaDuration: 8,
    openInViewer() {},
  });
  const projectItems = [comp1, comp6];
  let renderedComp = null;
  let capturedSpan = null;
  function FakeFile(p) {
    this.fsName = p;
    this.exists = true;
    this.length = 1024;
    this.parent = { exists: true, create() {} };
  }
  const ctx = vm.createContext({
    BridgeTalk: { appName: 'aftereffects' },
    CompItem,
    File: FakeFile,
    app: {
      version: '25.0.0',
      project: {
        file: null,
        activeItem: null,
        selection: [comp6],
        numItems: projectItems.length,
        item: (i) => projectItems[i - 1],
        renderQueue: {
          numItems: 0,
          items: {
            add: (comp) => {
              renderedComp = comp;
              const rq = {
                timeSpanStart: 0,
                timeSpanDuration: 0,
                applyTemplate() {},
                remove() {},
                om: { templates: ['H.264 - Match Render Settings - 15 Mbps'], file: null, applyTemplate() {} },
                outputModule() { return this.om; },
              };
              capturedSpan = rq;
              return rq;
            },
          },
          render() {},
        },
      },
    },
  });
  vm.runInContext(sources.common, ctx);
  vm.runInContext(sources.aeft, ctx);

  const info = JSON.parse(vm.runInContext('__ccOk(__ccAeftGetContext())', ctx));
  assert.equal(info.data.hasProject, true);
  assert.equal(info.data.items.length, 2);
  assert.equal(info.data.activeItem.id, '6');
  assert.equal(info.data.activeItem.hasCustomWorkRange, true);

  // Also verify custom "CrewCut" AE Output Module template overrides built-in 15/40 Mbps defaults
  const pickedCustom = vm.runInContext(
    '__ccAeftPickOutputTemplate(["Lossless", "H.264 - Match Render Settings - 15 Mbps", "H.264 - Match Render Settings - 40 Mbps", "CrewCut"])',
    ctx
  );
  assert.equal(pickedCustom.template, 'CrewCut');
  assert.equal(pickedCustom.ext, '.mp4');
  assert.equal(pickedCustom.isCustom, true);

  const pickedFallback40 = vm.runInContext(
    '__ccAeftPickOutputTemplate(["Lossless", "H.264 - Match Render Settings - 15 Mbps", "H.264 - Match Render Settings - 40 Mbps"])',
    ctx
  );
  assert.equal(pickedFallback40.template, 'H.264 - Match Render Settings - 40 Mbps');
  assert.equal(pickedFallback40.isCustom, false);

  // Even with activeItem & selection cleared (panel focus), passing targetId "6" targets Comp 6
  ctx.app.project.activeItem = null;
  ctx.app.project.selection = [];
  const renderRes = JSON.parse(vm.runInContext('__ccOk(__ccAeftRenderComp("C:/tmp/c6.mp4", true, "6"))', ctx));
  assert.equal(renderRes.data.status, 'complete');
  assert.equal(renderedComp, comp6);
  assert.equal(capturedSpan.timeSpanStart, 4);
  assert.equal(capturedSpan.timeSpanDuration, 8);
});

test('CEP bridge injects host JSX if missing and rejects empty/non-JSON ExtendScript outputs', async () => {
  const bridgeCode = fs.readFileSync(path.join(repoRoot, 'client', 'lib', 'cepBridge.js'), 'utf8');
  const formatMod = require('../client/lib/format.js');
  const apiMod = require('../client/lib/api.js');

  const evaluated = [];
  let loaded = false;
  const fakeWindow = {
    __adobe_cep__: {
      getHostEnvironment: () => JSON.stringify({ appName: 'AEFT', appVersion: '25.0' }),
      getSystemPath: (k) => (k === 'extension' ? 'file:///C:/ext' : 'file:///C:/ud'),
      evalScript: (script, cb) => {
        evaluated.push(script);
        if (script.indexOf("? 'READY' : 'MISSING'") !== -1) {
          cb(loaded ? 'READY' : 'MISSING');
          return;
        }
        if (script.indexOf('function __ccAeftGetContext') !== -1) {
          loaded = true;
          cb('undefined');
          return;
        }
        if (script.indexOf('ccGetHostContext()') !== -1) {
          cb('');
          return;
        }
        cb('undefined');
      },
    },
    cep_node: {
      require: (mod) => {
        if (mod === 'fs') {
          return {
            existsSync: () => true,
            readFileSync: (p) => (p.endsWith('aeft.jsx') ? 'function __ccAeftGetContext(){}' : `/* ${p} */`),
          };
        }
        if (mod === 'path') return path.win32;
        if (mod === 'url') return url;
        return null;
      },
    },
  };

  const sandbox = vm.createContext({
    window: fakeWindow,
    globalThis: {},
    require: (id) => (id === './format.js' ? formatMod : apiMod),
    module: { exports: {} },
    console,
    Promise,
  });
  sandbox.globalThis = sandbox;
  sandbox.globalThis.CrewCutFormat = formatMod;
  sandbox.globalThis.CrewCutApi = apiMod;
  vm.runInContext(bridgeCode, sandbox);

  const hostCtx = await sandbox.module.exports.getHostContext();
  assert.equal(loaded, true);
  assert.ok(evaluated.some((s) => s.includes('common.jsx')));
  // Empty string from ccGetHostContext must produce hostError instead of "No project open"
  assert.ok(hostCtx.hostError);
  assert.equal(hostCtx.hasProject, false);
});

test('Responsive UI removes Local File dropzone and enables side-by-side desktop layout', () => {
  const html = fs.readFileSync(path.join(repoRoot, 'client', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(repoRoot, 'client', 'styles.css'), 'utf8');
  const manifest = fs.readFileSync(path.join(repoRoot, 'CSXS', 'manifest.xml'), 'utf8');

  assert.match(html, /id="host-item-select"/);
  assert.match(html, /id="upload-instant-playback"[^>]*checked/);
  assert.match(html, /class="panels-grid"/);
  assert.doesNotMatch(html, /id="dropzone"|id="local-file-input"|btn-source-local/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(css, /@media \(min-width: 720px\)/);
  assert.match(css, /max-width: 1120px/);
  assert.match(manifest, /<Width>2560<\/Width>/);
});
