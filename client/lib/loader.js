/**
 * CrewCut Cloud Auto-Updater (OTA)
 * Checks GitHub Pages for the latest app.js, styles.css, and version.json.
 * If a newer version is published, it updates the local files in CEP AppData.
 */
(function (root) {
  var LOCAL_VERSION = '1.0.2';
  var REMOTE_BASE = 'https://crewcutindia.github.io/crewcut-plugin/client';
  var CHECK_TIMEOUT_MS = 2500;

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

  function getCepRuntime() {
    return typeof window !== 'undefined' && window.__adobe_cep__ ? window.__adobe_cep__ : null;
  }

  function toFsPath(rawPath) {
    if (typeof rawPath !== 'string') return '';
    var trimmed = rawPath.trim();
    if (!trimmed) return '';
    if (/^file:\/\//i.test(trimmed)) {
      var stripped = trimmed.replace(/^file:\/\//i, '').replace(/^\/([a-zA-Z]:)/, '$1');
      try {
        return decodeURI(stripped);
      } catch (_) {
        return stripped;
      }
    }
    return trimmed;
  }

  function getExtensionRoot() {
    var cep = getCepRuntime();
    if (!cep) return null;
    try {
      return toFsPath(cep.getSystemPath('extension'));
    } catch (_) {
      return null;
    }
  }

  function fetchWithTimeout(url, timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    var options = {
      cache: 'no-store',
      headers: { 'Accept': '*/*' },
    };
    if (controller) {
      options.signal = controller.signal;
      timer = setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }
    return fetch(url, options).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function showUpdateToast(newVersion) {
    var toast = document.createElement('div');
    toast.className = 'update-toast shiny-text';
    toast.style.cursor = 'pointer';
    toast.innerHTML = '✨ CrewCut updated to v' + newVersion + ' · <span style="text-decoration:underline;">Click to reload</span>';
    toast.addEventListener('click', function () {
      window.location.reload();
    });
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 6000);
  }

  async function checkAndApplyUpdates() {
    try {
      var versionRes = await fetchWithTimeout(REMOTE_BASE + '/version.json?_t=' + Date.now(), CHECK_TIMEOUT_MS);
      var remoteMeta = await versionRes.json();
      if (!remoteMeta || !remoteMeta.version) return;

      var nodeReq = getNodeRequire();
      var extRoot = getExtensionRoot();

      if (remoteMeta.version !== LOCAL_VERSION && nodeReq && extRoot) {
        var fs = nodeReq('fs');
        var path = nodeReq('path');

        // Fetch remote app.js and styles.css
        var jsRes = await fetchWithTimeout(REMOTE_BASE + '/app.js?_t=' + Date.now(), 5000);
        var newJs = await jsRes.text();

        var cssRes = await fetchWithTimeout(REMOTE_BASE + '/styles.css?_t=' + Date.now(), 5000);
        var newCss = await cssRes.text();

        if (newJs && newJs.length > 500 && newCss && newCss.length > 500) {
          // Write updated files to disk safely
          var clientDir = path.join(extRoot, 'client');
          fs.writeFileSync(path.join(clientDir, 'app.js'), newJs, 'utf8');
          fs.writeFileSync(path.join(clientDir, 'styles.css'), newCss, 'utf8');
          fs.writeFileSync(path.join(clientDir, 'version.json'), JSON.stringify(remoteMeta, null, 2), 'utf8');

          showUpdateToast(remoteMeta.version);
        }
      }
    } catch (_) {
      // Offline or network timeout — proceed silently with cached local files
    }
  }

  root.CrewCutUpdater = {
    version: LOCAL_VERSION,
    checkAndApplyUpdates: checkAndApplyUpdates,
  };

  // Run update check in background without blocking panel launch
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', function () {
      setTimeout(checkAndApplyUpdates, 1500);
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
