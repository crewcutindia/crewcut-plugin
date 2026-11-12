(function (root) {
  var Api = root.CrewCutApi || (typeof require === 'function' ? require('./api.js') : null);
  var Cep = root.CrewCutCep || (typeof require === 'function' ? require('./cepBridge.js') : null);
  var Format = root.CrewCutFormat || (typeof require === 'function' ? require('./format.js') : null);

  var CHUNK_SIZE_BYTES = 5 * 1024 * 1024;
  var RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 20000];

  function detectMimeType(fileName, fallbackType) {
    if (fallbackType && String(fallbackType).indexOf('video/') === 0) {
      return fallbackType;
    }
    var lower = String(fileName || '').toLowerCase();
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.mkv')) return 'video/x-matroska';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.avi')) return 'video/x-msvideo';
    return 'video/mp4';
  }

  function stripExtension(name) {
    return String(name || 'Untitled Cut').replace(/\.[a-z0-9]{2,5}$/i, '').trim() || 'Untitled Cut';
  }

  function resolveTusLib(customTus) {
    if (customTus) return customTus;
    if (Cep && typeof Cep.getNodeTus === 'function') {
      var nodeTus = Cep.getNodeTus();
      if (nodeTus) return nodeTus;
    }
    if (typeof root.tus !== 'undefined') return root.tus;
    return null;
  }

  function startSignedTusUpload(options) {
    var opts = options || {};
    var cep = opts.cep || Cep;
    var api = opts.api || (Api ? Api.createApiClient(opts.apiConfig || {}) : null);
    var tusLib = resolveTusLib(opts.tusLib);

    var filePath = opts.filePath ? String(opts.filePath) : '';
    var browserFile = opts.browserFile || null;
    var isTempFile = Boolean(opts.isTempFile);
    var sizeBytes = Number(opts.sizeBytes || (browserFile && browserFile.size) || 0);
    var fileName = opts.fileName || (browserFile && browserFile.name) || 'export.mp4';
    var title = String(opts.title || '').trim() || stripExtension(fileName);
    var mimeType = detectMimeType(fileName, browserFile && browserFile.type);

    var onPhase = typeof opts.onPhase === 'function' ? opts.onPhase : function () {};
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};

    var tusUpload = null;
    var nodeStream = null;
    var paused = false;
    var cancelled = false;
    var settled = false;
    var tempCleaned = false;
    var rejectUploadPromise = null;

    function destroyNodeStream() {
      if (nodeStream && typeof nodeStream.destroy === 'function') {
        try {
          nodeStream.destroy();
        } catch (_) {}
      }
      nodeStream = null;
    }

    function cleanupTemp() {
      destroyNodeStream();
      if (tempCleaned) return;
      tempCleaned = true;
      if (isTempFile && filePath && cep && typeof cep.deleteFileSafe === 'function') {
        cep.deleteFileSafe(filePath);
      }
    }

    var promise = (async function () {
      if (!api) {
        throw new Error('CrewCut API client unavailable.');
      }
      if (!tusLib || typeof tusLib.Upload !== 'function') {
        throw new Error('tus-js-client library is not loaded.');
      }

      if (filePath && (!sizeBytes || sizeBytes <= 0) && cep && typeof cep.statFile === 'function') {
        var st = cep.statFile(filePath);
        if (st) {
          sizeBytes = st.sizeBytes;
          fileName = st.name || fileName;
        }
      }

      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        throw new Error('Exported video file is missing or empty.');
      }

      if (Number.isFinite(opts.remainingBytes) && opts.remainingBytes >= 0 && sizeBytes > opts.remainingBytes) {
        var fileLabel = Format ? Format.formatBytes(sizeBytes) : sizeBytes + ' bytes';
        var leftLabel = Format ? Format.formatBytes(opts.remainingBytes) : opts.remainingBytes + ' bytes';
        cleanupTemp();
        throw new Error('File (' + fileLabel + ') exceeds remaining storage quota (' + leftLabel + ').');
      }

      onPhase('signing', { title: title, sizeBytes: sizeBytes });

      var signed = await api.signUpload({
        title: title,
        sizeBytes: sizeBytes,
        folderId: opts.folderId || null,
        instantPlayback: Boolean(opts.instantPlayback),
        estimatedDurationSeconds: opts.estimatedDurationSeconds || 0,
      });

      if (cancelled) {
        cleanupTemp();
        throw Object.assign(new Error('Upload cancelled.'), { code: 'CANCELLED' });
      }

      var uploadInput = browserFile;
      if (!uploadInput && filePath && cep && typeof cep.createNodeReadStream === 'function') {
        nodeStream = cep.createNodeReadStream(filePath);
        uploadInput = nodeStream;
      }

      if (!uploadInput) {
        cleanupTemp();
        throw new Error('No readable video file or stream is available for upload.');
      }

      onPhase('uploading', {
        title: title,
        sizeBytes: sizeBytes,
        videoId: signed.videoId,
        reviewUrl: signed.reviewUrl,
      });

      await new Promise(function (resolve, reject) {
        rejectUploadPromise = reject;
        tusUpload = new tusLib.Upload(uploadInput, {
          endpoint: signed.tusEndpoint || signed.uploadUrl,
          chunkSize: CHUNK_SIZE_BYTES,
          retryDelays: RETRY_DELAYS,
          uploadSize: sizeBytes,
          storeFingerprintForResuming: false,
          removeFingerprintOnSuccess: true,
          headers: signed.authHeaders || {},
          metadata: {
            filename: fileName,
            filetype: mimeType,
          },
          onError: function (err) {
            if (settled) return;
            settled = true;
            reject(err || new Error('TUS upload failed.'));
          },
          onProgress: function (bytesUploaded, bytesTotal) {
            var total = bytesTotal || sizeBytes;
            var pct = total > 0 ? Math.min(100, Math.round((bytesUploaded / total) * 100)) : 0;
            onProgress({
              bytesUploaded: bytesUploaded,
              bytesTotal: total,
              percent: pct,
            });
          },
          onSuccess: function () {
            if (settled) return;
            settled = true;
            resolve();
          },
        });

        tusUpload.start();
      });

      onPhase('finalizing', {
        title: title,
        videoId: signed.videoId,
        reviewUrl: signed.reviewUrl,
      });

      await api.markUploaded({
        videoId: signed.videoId,
        sizeBytes: sizeBytes,
      });

      cleanupTemp();

      var result = {
        videoId: signed.videoId,
        providerVideoId: signed.providerVideoId,
        reviewToken: signed.reviewToken,
        reviewUrl: signed.reviewUrl,
        title: title,
        sizeBytes: sizeBytes,
      };
      onPhase('done', result);
      return result;
    })().catch(function (err) {
      cleanupTemp();
      throw err;
    });

    return {
      promise: promise,
      isPaused: function () {
        return paused;
      },
      pause: function () {
        if (!tusUpload || cancelled || paused || settled) return false;
        paused = true;
        tusUpload.abort(false);
        onPhase('paused', { title: title });
        return true;
      },
      resume: function () {
        if (!tusUpload || cancelled || !paused || settled) return false;
        paused = false;
        onPhase('uploading', { title: title });
        tusUpload.start();
        return true;
      },
      cancel: async function () {
        cancelled = true;
        if (tusUpload && !settled) {
          settled = true;
          try {
            await tusUpload.abort(false);
          } catch (_) {}
          if (typeof rejectUploadPromise === 'function') {
            rejectUploadPromise(Object.assign(new Error('Upload cancelled.'), { code: 'CANCELLED' }));
          }
        }
        cleanupTemp();
      },
    };
  }

  var exported = {
    CHUNK_SIZE_BYTES: CHUNK_SIZE_BYTES,
    detectMimeType: detectMimeType,
    stripExtension: stripExtension,
    startSignedTusUpload: startSignedTusUpload,
  };

  root.CrewCutUploader = exported;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
