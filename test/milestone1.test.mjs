import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  BYTES_PER_GB,
  computeQuotaStats,
  formatBytes,
  formatPlanName,
  formatTimecode,
  maskApiKey,
  validateApiKeyFormat,
} = require('../client/lib/format.js');
const { createApiClient, CrewCutApiError } = require('../client/lib/api.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('format helpers match CrewCut binary GiB and timecode specs', () => {
  assert.equal(BYTES_PER_GB, 1024 * 1024 * 1024);
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(75 * BYTES_PER_GB), '75 GB');
  assert.equal(formatTimecode(0), '0:00');
  assert.equal(formatTimecode(94.8), '1:34');
  assert.equal(formatTimecode(3665), '1:01:05');
  assert.equal(formatPlanName('plus'), 'Plus');
  assert.equal(formatPlanName('STUDIO'), 'Studio');
  assert.equal(validateApiKeyFormat('cc_live_0123456789abcdef0123456789abcdef'), true);
  assert.equal(validateApiKeyFormat('sk_live_0123456789abcdef'), false);
  assert.equal(validateApiKeyFormat('cc_live_short'), false);
  assert.equal(maskApiKey('cc_live_0123456789abcdef0123456789abcdef'), 'cc_live_0123456...');

  assert.equal(computeQuotaStats(50 * BYTES_PER_GB, 100 * BYTES_PER_GB).status, 'normal');
  assert.equal(computeQuotaStats(80 * BYTES_PER_GB, 100 * BYTES_PER_GB).status, 'warning');
  assert.equal(computeQuotaStats(92 * BYTES_PER_GB, 100 * BYTES_PER_GB).status, 'critical');
});

test('API client sends x-crewcut-api-key and handles 200 / 401 / 403 / 500 responses', async () => {
  const calls = [];
  const mockFetch = (status, body) => async (url, init) => {
    calls.push({ url, init: { ...init, body: JSON.parse(init.body) } });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };

  const okClient = createApiClient({
    apiBaseUrl: 'https://example.supabase.co/functions/v1/',
    apiKey: 'cc_live_0123456789abcdef0123456789abcdef',
    fetchImpl: mockFetch(200, {
      success: true,
      user: { email: 'editor@crewcut.in', plan: 'plus', storageUsedBytes: 1024, storageLimitBytes: 75 * BYTES_PER_GB },
      folders: [{ id: 'f1', name: 'Client Cuts' }],
      recentVideos: [],
    }),
  });

  const ctx = await okClient.getContext();
  assert.equal(ctx.user.plan, 'plus');
  assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/nle-plugin');
  assert.equal(calls[0].init.headers['x-crewcut-api-key'], 'cc_live_0123456789abcdef0123456789abcdef');
  assert.deepEqual(calls[0].init.body, { action: 'get-context' });

  const restrictedClient = createApiClient({
    apiKey: 'cc_live_0123456789abcdef0123456789abcdef',
    fetchImpl: mockFetch(403, {
      error: 'Plus or Studio required',
      nlePluginRestricted: true,
      planId: 'starter',
    }),
  });
  await assert.rejects(
    () => restrictedClient.getContext(),
    (err) => err instanceof CrewCutApiError && err.code === 'PLAN_RESTRICTED' && err.planId === 'starter'
  );

  const unauthClient = createApiClient({
    apiKey: 'cc_live_0123456789abcdef0123456789abcdef',
    fetchImpl: mockFetch(401, { error: 'Invalid key' }),
  });
  await assert.rejects(
    () => unauthClient.getContext(),
    (err) => err instanceof CrewCutApiError && err.code === 'UNAUTHORIZED'
  );

  const serverErrClient = createApiClient({
    apiKey: 'cc_live_0123456789abcdef0123456789abcdef',
    fetchImpl: mockFetch(500, { error: 'DB failure' }),
  });
  await assert.rejects(
    () => serverErrClient.markUploaded({ videoId: 'v1', sizeBytes: 512 }),
    (err) => err instanceof CrewCutApiError && err.code === 'SERVER_ERROR' && err.status === 500
  );
});

test('CSXS manifest, .debug, and classic script tags remain CEP file:// safe', () => {
  const manifest = fs.readFileSync(path.join(repoRoot, 'CSXS', 'manifest.xml'), 'utf8');
  assert.match(manifest, /ExtensionBundleId="in\.crewcut\.nle"/);
  assert.match(manifest, /<Host Name="PPRO"/);
  assert.match(manifest, /<Host Name="AEFT"/);
  assert.match(manifest, /<RequiredRuntime Name="CSXS" Version="11\.0"/);
  assert.match(manifest, /<MainPath>\.\/client\/index\.html<\/MainPath>/);
  assert.match(manifest, /<ScriptPath>\.\/host\/index\.jsx<\/ScriptPath>/);
  assert.match(manifest, /--enable-nodejs/);
  assert.match(manifest, /<Menu>CrewCut<\/Menu>/);

  const debugXml = fs.readFileSync(path.join(repoRoot, '.debug'), 'utf8');
  assert.match(debugXml, /<Host Name="PPRO" Port="8088"/);
  assert.match(debugXml, /<Host Name="AEFT" Port="8089"/);

  const html = fs.readFileSync(path.join(repoRoot, 'client', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /type="module"/, 'CEP file:// panels must not rely on ES module scripts');
});

test('ExtendScript host scripts remain ES3-safe and return valid JSON for mock PPRO and AEFT hosts', () => {
  const hostFiles = ['common.jsx', 'ppro.jsx', 'aeft.jsx', 'index.jsx'];
  const sources = {};

  for (const file of hostFiles) {
    const content = fs.readFileSync(path.join(repoRoot, 'host', file), 'utf8');
    assert.doesNotMatch(content, /\b(const|let)\s+/, `${file} must not use ES6 const/let`);
    assert.doesNotMatch(content, /=>/, `${file} must not use arrow functions`);
    sources[file] = content;
  }

  const pproCtx = vm.createContext({
    BridgeTalk: { appName: 'premierepro' },
    app: {
      version: '25.1.0',
      project: {
        name: 'BrandCampaign.prproj',
        activeSequence: {
          sequenceID: 'seq-1',
          name: 'Master Cut v3',
          zeroPoint: '0',
          end: String(254016000000 * 45),
          getPlayerPosition: () => ({ seconds: 12.34 }),
          getInPoint: () => 5,
          getOutPoint: () => 35,
        },
      },
    },
  });
  vm.runInContext(sources['common.jsx'], pproCtx);
  vm.runInContext(sources['ppro.jsx'], pproCtx);
  const pproJson = JSON.parse(vm.runInContext('__ccOk(__ccPproGetContext())', pproCtx));
  assert.equal(pproJson.ok, true);
  assert.equal(pproJson.data.host, 'PPRO');
  assert.equal(pproJson.data.activeItem.name, 'Master Cut v3');
  assert.equal(pproJson.data.activeItem.durationSeconds, 45);
  assert.equal(pproJson.data.activeItem.hasWorkRange, true);

  function CompItem() {}
  const activeComp = Object.assign(new CompItem(), {
    id: 42,
    name: 'Title_Card_4K',
    duration: 18.5,
    time: 4.25,
    workAreaStart: 2,
    workAreaDuration: 10,
    frameRate: 24,
    width: 3840,
    height: 2160,
  });
  const aeftCtx = vm.createContext({
    BridgeTalk: { appName: 'aftereffects' },
    CompItem,
    app: {
      version: '25.0.0',
      project: {
        file: { name: 'MotionPack.aep' },
        activeItem: activeComp,
      },
    },
  });
  vm.runInContext(sources['common.jsx'], aeftCtx);
  vm.runInContext(sources['aeft.jsx'], aeftCtx);
  const aeftJson = JSON.parse(vm.runInContext('__ccOk(__ccAeftGetContext())', aeftCtx));
  assert.equal(aeftJson.ok, true);
  assert.equal(aeftJson.data.host, 'AEFT');
  assert.equal(aeftJson.data.activeItem.kind, 'composition');
  assert.equal(aeftJson.data.activeItem.name, 'Title_Card_4K');
  assert.equal(aeftJson.data.activeItem.durationSeconds, 18.5);
  assert.equal(aeftJson.data.activeItem.rangeEndSeconds, 12);
});
