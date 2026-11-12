(function (root) {
  var Format = root.CrewCutFormat || (typeof require === 'function' ? require('./format.js') : null);

  var DEFAULT_API_BASE_URL = 'https://sobbjbnalljbqifzcqcf.supabase.co/functions/v1';
  var DEFAULT_APP_ORIGIN = 'https://beta.crewcut.in';

  class CrewCutApiError extends Error {
    constructor(message, opts) {
      super(message);
      var o = opts || {};
      this.name = 'CrewCutApiError';
      this.status = o.status || 0;
      this.code = o.code || 'API_ERROR';
      this.planId = o.planId || null;
      this.details = o.details || null;
    }
  }

  function createApiClient(options) {
    var opts = options || {};
    var baseUrl = Format.normalizeBaseUrl(opts.apiBaseUrl, DEFAULT_API_BASE_URL);
    var trimmedKey = String(opts.apiKey || '').trim();
    var fetchImpl = opts.fetchImpl || globalThis.fetch;
    var timeoutMs = opts.timeoutMs || 15000;

    async function postFunction(fnName, payload) {
      if (!trimmedKey) {
        throw new CrewCutApiError('CrewCut API key is required.', {
          status: 401,
          code: 'UNAUTHORIZED',
        });
      }
      if (typeof fetchImpl !== 'function') {
        throw new CrewCutApiError('Fetch API unavailable in this runtime.', {
          code: 'NETWORK_ERROR',
        });
      }

      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;

      var res;
      var data = null;
      try {
        res = await fetchImpl(baseUrl + '/' + fnName, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-crewcut-api-key': trimmedKey,
          },
          body: JSON.stringify(payload || {}),
          signal: controller ? controller.signal : undefined,
        });
        data = await res.json().catch(function () { return null; });
      } catch (err) {
        if (err && err.name === 'AbortError') {
          throw new CrewCutApiError('Request timed out contacting CrewCut.', {
            code: 'TIMEOUT',
          });
        }
        throw new CrewCutApiError((err && err.message) || 'Network error contacting CrewCut.', {
          code: 'NETWORK_ERROR',
        });
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (!res.ok) {
        var serverMsg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
        if (res.status === 401) {
          throw new CrewCutApiError(serverMsg, { status: 401, code: 'UNAUTHORIZED', details: data });
        }
        if (res.status === 403 && data && data.nlePluginRestricted) {
          throw new CrewCutApiError(serverMsg, {
            status: 403,
            code: 'PLAN_RESTRICTED',
            planId: data.planId || null,
            details: data,
          });
        }
        if (res.status === 403 && data && data.quotaExceeded) {
          throw new CrewCutApiError(serverMsg, {
            status: 403,
            code: 'QUOTA_EXCEEDED',
            details: data,
          });
        }
        if (res.status === 404) {
          throw new CrewCutApiError(serverMsg, { status: 404, code: 'NOT_FOUND', details: data });
        }
        throw new CrewCutApiError(serverMsg, { status: res.status, code: 'SERVER_ERROR', details: data });
      }

      return data;
    }

    return {
      getContext: function () {
        return postFunction('nle-plugin', { action: 'get-context' });
      },
      getOrCreateReviewLink: function (videoId) {
        return postFunction('nle-plugin', { action: 'get-or-create-review-link', videoId: videoId });
      },
      getComments: function (params) {
        var p = params || {};
        return postFunction('nle-plugin', {
          action: 'get-comments',
          videoId: p.videoId,
          reviewToken: p.reviewToken,
        });
      },
      markUploaded: function (params) {
        var p = params || {};
        return postFunction('nle-plugin', {
          action: 'mark-uploaded',
          videoId: p.videoId,
          sizeBytes: p.sizeBytes,
        });
      },
      signUpload: function (params) {
        var p = params || {};
        return postFunction('upload-sign', {
          title: String(p.title || 'Untitled Cut'),
          sizeBytes: Number(p.sizeBytes || 0),
          folderId: p.folderId || null,
          isPremium: false,
          instantPlayback: Boolean(p.instantPlayback),
          estimatedDurationSeconds: Math.max(0, Math.round(Number(p.estimatedDurationSeconds) || 0)),
        });
      },
    };
  }

  var exported = {
    DEFAULT_API_BASE_URL: DEFAULT_API_BASE_URL,
    DEFAULT_APP_ORIGIN: DEFAULT_APP_ORIGIN,
    CrewCutApiError: CrewCutApiError,
    createApiClient: createApiClient,
  };

  root.CrewCutApi = exported;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
