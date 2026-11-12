(function (root) {
  var Format = root.CrewCutFormat || (typeof require === 'function' ? require('./format.js') : null);
  var Api = root.CrewCutApi || (typeof require === 'function' ? require('./api.js') : null);

  var BROWSER_STORAGE_KEY = 'crewcut_nle_config_v1';

  function getCepRuntime() {
    return typeof window !== 'undefined' && window.__adobe_cep__ ? window.__adobe_cep__ : null;
  }

  function getNodeRequire() {
    if (typeof window === 'undefined') return null;
    if (window.cep_node && typeof window.cep_node.require === 'function') {
      return window.cep_node.require;
    }
    if (typeof window.require === 'function') {
      return window.require;
    }
    return null;
  }

  function toFsPath(rawPath, urlMod) {
    if (typeof rawPath !== 'string') return '';
    var trimmed = rawPath.trim();
    if (!trimmed) return '';
    if (/^file:\/\//i.test(trimmed)) {
      if (urlMod && typeof urlMod.fileURLToPath === 'function') {
        try {
          return urlMod.fileURLToPath(trimmed);
        } catch (_) {}
      }
      var stripped = trimmed.replace(/^file:\/\//i, '').replace(/^\/([a-zA-Z]:)/, '$1');
      try {
        return decodeURI(stripped);
      } catch (_) {
        return stripped;
      }
    }
    return trimmed;
  }

  function getConfigFilePath() {
    var cep = getCepRuntime();
    var nodeReq = getNodeRequire();
    if (!cep || !nodeReq) return null;
    try {
      var path = nodeReq('path');
      var os = nodeReq('os');
      var urlMod = null;
      try {
        urlMod = nodeReq('url');
      } catch (_) {}
      var userData = toFsPath(cep.getSystemPath('userData'), urlMod) || os.homedir();
      return path.join(userData, 'CrewCut', 'config.json');
    } catch (_) {
      return null;
    }
  }

  function getHostEnvironment() {
    var cep = getCepRuntime();
    if (!cep) {
      return {
        inCep: false,
        host: 'BROWSER',
        hostLabel: 'Browser Preview',
        appVersion: '',
      };
    }
    try {
      var raw = cep.getHostEnvironment();
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      var appName = String((parsed && parsed.appName) || '').toUpperCase();
      var host = appName.includes('AEFT') ? 'AEFT' : appName.includes('PPRO') ? 'PPRO' : appName || 'CEP';
      var hostLabel =
        host === 'AEFT' ? 'After Effects' : host === 'PPRO' ? 'Premiere Pro' : 'Adobe Host';
      return {
        inCep: true,
        host: host,
        hostLabel: hostLabel,
        appVersion: String((parsed && parsed.appVersion) || ''),
      };
    } catch (_) {
      return {
        inCep: true,
        host: 'CEP',
        hostLabel: 'Adobe Host',
        appVersion: '',
      };
    }
  }

  function rawEval(cep, script) {
    return new Promise(function (resolve) {
      try {
        cep.evalScript(script, function (rawResult) {
          resolve(rawResult);
        });
      } catch (err) {
        resolve('EvalScript error.');
      }
    });
  }

  var hostLoadPromise = null;

  function ensureHostScriptsLoaded() {
    var cep = getCepRuntime();
    if (!cep) return Promise.resolve(false);
    if (hostLoadPromise) return hostLoadPromise;

    hostLoadPromise = (async function () {
      var probe = await rawEval(
        cep,
        "(typeof __ccOk === 'function' && typeof __ccAeftGetContext === 'function' && typeof __ccPproGetContext === 'function' && typeof ccGetHostContext === 'function') ? 'READY' : 'MISSING'"
      );
      if (probe === 'READY') {
        return true;
      }

      var nodeReq = getNodeRequire();
      if (!nodeReq) {
        hostLoadPromise = null;
        return false;
      }

      var fs = nodeReq('fs');
      var path = nodeReq('path');
      var urlMod = null;
      try {
        urlMod = nodeReq('url');
      } catch (_) {}

      var extRoot = toFsPath(cep.getSystemPath('extension'), urlMod);
      if (!extRoot) {
        hostLoadPromise = null;
        return false;
      }

      var jsxFiles = ['common.jsx', 'ppro.jsx', 'aeft.jsx', 'index.jsx'];
      for (var i = 0; i < jsxFiles.length; i++) {
        var fullPath = path.join(extRoot, 'host', jsxFiles[i]);
        if (fs.existsSync(fullPath)) {
          var code = fs.readFileSync(fullPath, 'utf8');
          await rawEval(cep, code);
        }
      }

      var after = await rawEval(
        cep,
        "(typeof __ccOk === 'function' && typeof ccGetHostContext === 'function') ? 'READY' : 'MISSING'"
      );
      if (after !== 'READY') {
        hostLoadPromise = null;
        return false;
      }
      return true;
    })();

    return hostLoadPromise;
  }

  async function evalScript(script) {
    var cep = getCepRuntime();
    if (!cep) {
      return {
        ok: false,
        error: 'Standalone browser preview — ExtendScript host is unavailable.',
        code: 'NO_CEP_HOST',
      };
    }

    await ensureHostScriptsLoaded();

    try {
      var rawResult = await rawEval(cep, script);
      if (
        rawResult === 'EvalScript error.' ||
        rawResult === undefined ||
        rawResult === null ||
        rawResult === '' ||
        rawResult === 'undefined'
      ) {
        return {
          ok: false,
          error: 'ExtendScript evaluation returned an empty or failed response (' + String(rawResult) + ').',
          code: 'EVALSCRIPT_ERROR',
        };
      }
      try {
        return JSON.parse(String(rawResult));
      } catch (_) {
        return {
          ok: false,
          error: 'Unexpected ExtendScript output: ' + String(rawResult).slice(0, 120),
          code: 'EVALSCRIPT_INVALID',
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: (err && err.message) || 'Failed to invoke ExtendScript.',
        code: 'EVALSCRIPT_EXCEPTION',
      };
    }
  }

  async function getHostContext() {
    var env = getHostEnvironment();
    if (!env.inCep) {
      return {
        inCep: false,
        host: 'BROWSER',
        hostLabel: 'Browser Preview',
        appVersion: '',
        hasProject: false,
        hasActiveItem: false,
        activeItem: null,
        items: [],
      };
    }

    var res = await evalScript('ccGetHostContext()');
    if (!res || !res.ok || !res.data || typeof res.data !== 'object') {
      return {
        inCep: true,
        host: env.host,
        hostLabel: env.hostLabel,
        appVersion: env.appVersion,
        hasProject: false,
        hasActiveItem: false,
        activeItem: null,
        items: [],
        hostError: (res && res.error) || 'Could not inspect host timeline.',
      };
    }

    return Object.assign({ inCep: true }, res.data);
  }

  function escapeJsArg(value) {
    return JSON.stringify(value)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function sanitizeFilename(title) {
    var cleaned = String(title || 'crewcut-export')
      .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.slice(0, 72) || 'crewcut-export';
  }

  function getTempRenderPath(title, ext) {
    var nodeReq = getNodeRequire();
    if (!nodeReq) return null;
    var fs = nodeReq('fs');
    var os = nodeReq('os');
    var path = nodeReq('path');
    var dir = path.join(os.tmpdir(), 'crewcut-renders');
    fs.mkdirSync(dir, { recursive: true });
    var suffix = ext && ext.charAt(0) === '.' ? ext : '.' + (ext || 'mp4');
    return path.join(dir, sanitizeFilename(title) + '-' + Date.now() + suffix);
  }

  function statFile(filePath) {
    var nodeReq = getNodeRequire();
    if (!nodeReq || !filePath) return null;
    try {
      var fs = nodeReq('fs');
      var path = nodeReq('path');
      var st = fs.statSync(filePath);
      if (!st || !st.isFile()) return null;
      return {
        path: filePath,
        name: path.basename(filePath),
        sizeBytes: Number(st.size || 0),
      };
    } catch (_) {
      return null;
    }
  }

  function deleteFileSafe(filePath) {
    var nodeReq = getNodeRequire();
    if (!nodeReq || !filePath) return false;
    try {
      var fs = nodeReq('fs');
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function createNodeReadStream(filePath) {
    var nodeReq = getNodeRequire();
    if (!nodeReq || !filePath) return null;
    var fs = nodeReq('fs');
    return fs.createReadStream(filePath);
  }

  function getNodeTus() {
    var nodeReq = getNodeRequire();
    if (!nodeReq) return null;
    try {
      return nodeReq('tus-js-client');
    } catch (_) {
      return null;
    }
  }

  function startHostRender(outputPath, workAreaOnly, targetId) {
    return evalScript(
      'ccStartRender(' + escapeJsArg(outputPath) + ', ' + Boolean(workAreaOnly) + ', ' + escapeJsArg(String(targetId || '')) + ')'
    );
  }

  function getHostRenderStatus(jobId) {
    return evalScript('ccGetRenderStatus(' + escapeJsArg(String(jobId || '')) + ')');
  }

  function cancelHostRender(jobId) {
    return evalScript('ccCancelRender(' + escapeJsArg(String(jobId || '')) + ')');
  }

  function seekPlayhead(seconds, targetId) {
    return evalScript('ccSeekPlayhead(' + Number(seconds || 0) + ', ' + escapeJsArg(String(targetId || '')) + ')');
  }

  function syncMarkers(comments, targetId) {
    var list = Array.isArray(comments) ? comments : [];
    return evalScript('ccSyncMarkers(' + escapeJsArg(list) + ', ' + escapeJsArg(String(targetId || '')) + ')');
  }

  function loadConfig() {
    var defaults = {
      apiKey: '',
      apiBaseUrl: Api.DEFAULT_API_BASE_URL,
      appOrigin: Api.DEFAULT_APP_ORIGIN,
    };

    var filePath = getConfigFilePath();
    var nodeReq = getNodeRequire();
    if (filePath && nodeReq) {
      try {
        var fs = nodeReq('fs');
        if (fs.existsSync(filePath)) {
          var parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          return {
            apiKey: String((parsed && parsed.apiKey) || ''),
            apiBaseUrl: Format.normalizeBaseUrl(parsed && parsed.apiBaseUrl, Api.DEFAULT_API_BASE_URL),
            appOrigin: Format.normalizeBaseUrl(parsed && parsed.appOrigin, Api.DEFAULT_APP_ORIGIN),
          };
        }
      } catch (_) {}
      return defaults;
    }

    try {
      var saved = globalThis.localStorage && globalThis.localStorage.getItem(BROWSER_STORAGE_KEY);
      if (!saved) return defaults;
      var parsedLocal = JSON.parse(saved);
      return {
        apiKey: String((parsedLocal && parsedLocal.apiKey) || ''),
        apiBaseUrl: Format.normalizeBaseUrl(parsedLocal && parsedLocal.apiBaseUrl, Api.DEFAULT_API_BASE_URL),
        appOrigin: Format.normalizeBaseUrl(parsedLocal && parsedLocal.appOrigin, Api.DEFAULT_APP_ORIGIN),
      };
    } catch (_) {
      return defaults;
    }
  }

  function saveConfig(nextConfig) {
    var cfg = nextConfig || {};
    var payload = {
      apiKey: String(cfg.apiKey || '').trim(),
      apiBaseUrl: Format.normalizeBaseUrl(cfg.apiBaseUrl, Api.DEFAULT_API_BASE_URL),
      appOrigin: Format.normalizeBaseUrl(cfg.appOrigin, Api.DEFAULT_APP_ORIGIN),
    };

    var filePath = getConfigFilePath();
    var nodeReq = getNodeRequire();
    if (filePath && nodeReq) {
      var fs = nodeReq('fs');
      var path = nodeReq('path');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
      return payload;
    }

    try {
      if (globalThis.localStorage) {
        globalThis.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(payload));
      }
    } catch (_) {}
    return payload;
  }

  function openExternalUrl(url) {
    if (!url) return;
    if (typeof window !== 'undefined' && window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) {
      window.cep.util.openURLInDefaultBrowser(url);
      return;
    }
    if (typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function copyText(text) {
    if (!text) return false;
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {}
    }
    if (typeof document !== 'undefined') {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (_) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
    return false;
  }

  var exported = {
    getHostEnvironment: getHostEnvironment,
    evalScript: evalScript,
    getHostContext: getHostContext,
    toFsPath: toFsPath,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    openExternalUrl: openExternalUrl,
    copyText: copyText,
    getTempRenderPath: getTempRenderPath,
    statFile: statFile,
    deleteFileSafe: deleteFileSafe,
    createNodeReadStream: createNodeReadStream,
    getNodeTus: getNodeTus,
    startHostRender: startHostRender,
    getHostRenderStatus: getHostRenderStatus,
    cancelHostRender: cancelHostRender,
    seekPlayhead: seekPlayhead,
    syncMarkers: syncMarkers,
  };

  root.CrewCutCep = exported;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
