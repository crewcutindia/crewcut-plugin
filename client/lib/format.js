(function (root) {
  var BYTES_PER_GB = 1024 * 1024 * 1024;

  function formatBytes(bytes, decimals) {
    if (decimals === undefined) decimals = 1;
    var value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    var k = 1024;
    var dm = decimals < 0 ? 0 : decimals;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.min(sizes.length - 1, Math.floor(Math.log(value) / Math.log(k)));
    return parseFloat((value / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function formatTimecode(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var hrs = Math.floor(total / 3600);
    var mins = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    if (hrs > 0) {
      return hrs + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }
    return mins + ':' + String(secs).padStart(2, '0');
  }

  function timeAgo(dateString) {
    if (!dateString) return '';
    var ts = new Date(dateString).getTime();
    if (!Number.isFinite(ts)) return '';
    var seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (seconds < 60) return 'just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    var months = Math.floor(days / 30);
    return months + 'mo ago';
  }

  function formatPlanName(planId) {
    if (!planId) return 'Free';
    var lower = String(planId).toLowerCase().trim();
    if (lower.startsWith('free')) return 'Free';
    if (lower.startsWith('starter')) return 'Starter';
    if (lower.startsWith('plus')) return 'Plus';
    if (lower.startsWith('studio')) return 'Studio';
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  function validateApiKeyFormat(rawKey) {
    if (typeof rawKey !== 'string') return false;
    return /^cc_live_[a-fA-F0-9]{16,}$/.test(rawKey.trim());
  }

  function maskApiKey(rawKey) {
    if (typeof rawKey !== 'string') return '';
    var trimmed = rawKey.trim();
    if (trimmed.length <= 15) return trimmed;
    return trimmed.slice(0, 15) + '...';
  }

  function computeQuotaStats(usedBytes, limitBytes) {
    var used = Math.max(0, Number(usedBytes) || 0);
    var limit = Math.max(0, Number(limitBytes) || 0);
    var remaining = Math.max(0, limit - used);
    var usedPercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    var status = usedPercent >= 90 ? 'critical' : usedPercent >= 75 ? 'warning' : 'normal';
    return {
      usedBytes: used,
      limitBytes: limit,
      remainingBytes: remaining,
      usedPercent: usedPercent,
      status: status,
    };
  }

  function normalizeBaseUrl(url, fallback) {
    var raw = typeof url === 'string' && url.trim() ? url.trim() : fallback;
    return raw.replace(/\/+$/, '');
  }

  var exported = {
    BYTES_PER_GB: BYTES_PER_GB,
    formatBytes: formatBytes,
    formatTimecode: formatTimecode,
    timeAgo: timeAgo,
    formatPlanName: formatPlanName,
    validateApiKeyFormat: validateApiKeyFormat,
    maskApiKey: maskApiKey,
    computeQuotaStats: computeQuotaStats,
    normalizeBaseUrl: normalizeBaseUrl,
  };

  root.CrewCutFormat = exported;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
