(function (root) {
  var Format = root.CrewCutFormat;
  var Api = root.CrewCutApi;
  var Cep = root.CrewCutCep;
  var Uploader = root.CrewCutUploader;

  var el = {
    hostBadge: document.getElementById('host-badge'),
    headerActions: document.getElementById('header-actions'),
    btnRefreshAll: document.getElementById('btn-refresh-all'),
    btnUnlink: document.getElementById('btn-unlink'),

    viewAuth: document.getElementById('view-auth'),
    viewRestricted: document.getElementById('view-restricted'),
    viewWorkspace: document.getElementById('view-workspace'),

    authForm: document.getElementById('auth-form'),
    apiKeyInput: document.getElementById('api-key-input'),
    apiKeyError: document.getElementById('api-key-error'),
    btnToggleKey: document.getElementById('btn-toggle-key'),
    authServerError: document.getElementById('auth-server-error'),
    btnLinkAccount: document.getElementById('btn-link-account'),
    btnOpenKeysPage: document.getElementById('btn-open-keys-page'),
    apiBaseInput: document.getElementById('api-base-input'),
    appOriginInput: document.getElementById('app-origin-input'),

    restrictedPlanBadge: document.getElementById('restricted-plan-badge'),
    btnComparePlans: document.getElementById('btn-compare-plans'),
    btnSwitchKey: document.getElementById('btn-switch-key'),

    userEmail: document.getElementById('user-email'),
    userKeyMask: document.getElementById('user-key-mask'),
    userPlanBadge: document.getElementById('user-plan-badge'),
    storageNumbers: document.getElementById('storage-numbers'),
    storageTrack: document.getElementById('storage-track'),
    storageFill: document.getElementById('storage-fill'),
    storageRemaining: document.getElementById('storage-remaining'),
    storagePercent: document.getElementById('storage-percent'),

    tabUpload: document.getElementById('tab-upload'),
    tabFeedback: document.getElementById('tab-feedback'),
    panelUpload: document.getElementById('panel-upload'),
    panelFeedback: document.getElementById('panel-feedback'),

    btnRefreshHost: document.getElementById('btn-refresh-host'),
    hostItemSelect: document.getElementById('host-item-select'),
    hostSourceName: document.getElementById('host-source-name'),
    hostSourceMeta: document.getElementById('host-source-meta'),
    uploadWorkArea: document.getElementById('upload-work-area'),
    uploadWorkAreaText: document.getElementById('upload-work-area-text'),

    uploadTitleInput: document.getElementById('upload-title-input'),
    uploadFolderSelect: document.getElementById('upload-folder-select'),
    uploadInstantPlayback: document.getElementById('upload-instant-playback'),
    uploadError: document.getElementById('upload-error'),
    btnStartUpload: document.getElementById('btn-start-upload'),
    uploadProgressCard: document.getElementById('upload-progress-card'),
    uploadStageLabel: document.getElementById('upload-stage-label'),
    uploadPercentLabel: document.getElementById('upload-percent-label'),
    uploadProgressBar: document.getElementById('upload-progress-bar'),
    uploadProgressMeta: document.getElementById('upload-progress-meta'),
    btnUploadPause: document.getElementById('btn-upload-pause'),
    btnUploadCancel: document.getElementById('btn-upload-cancel'),

    uploadResultCard: document.getElementById('upload-result-card'),
    resultCutTitle: document.getElementById('result-cut-title'),
    resultReviewUrl: document.getElementById('result-review-url'),
    btnResultCopy: document.getElementById('btn-result-copy'),
    btnResultOpen: document.getElementById('btn-result-open'),
    btnResultFeedback: document.getElementById('btn-result-feedback'),

    recentCount: document.getElementById('recent-count'),
    feedbackCutSelect: document.getElementById('feedback-cut-select'),
    btnRefreshComments: document.getElementById('btn-refresh-comments'),
    btnFeedbackCopy: document.getElementById('btn-feedback-copy'),
    btnFeedbackOpen: document.getElementById('btn-feedback-open'),
    btnSyncMarkers: document.getElementById('btn-sync-markers'),
    syncStatusLine: document.getElementById('sync-status-line'),
    feedbackError: document.getElementById('feedback-error'),
    commentsCount: document.getElementById('comments-count'),
    commentsList: document.getElementById('comments-list'),

    announcer: document.getElementById('sr-announcer'),
  };

  var config = Cep.loadConfig();
  var keyTouched = false;
  var announceTimer = null;

  var currentHost = null;
  var hostItems = [];
  var selectedHostItemId = '';
  var lastDetectedHostActiveId = '';
  var titleEditedManually = false;
  var quotaRemainingBytes = Infinity;
  var recentVideos = [];
  var selectedCutId = '';
  var currentComments = [];
  var syncedCommentIds = new Set();
  var lastUploadResult = null;
  var activeTransfer = null;
  var currentActiveAudio = null;
  var currentActiveAudioBtn = null;

  function makeClient() {
    return Api.createApiClient({
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
    });
  }

  function announce(message) {
    clearTimeout(announceTimer);
    el.announcer.textContent = '';
    announceTimer = setTimeout(function () {
      el.announcer.textContent = message;
    }, 50);
  }

  function showView(name) {
    el.viewAuth.hidden = name !== 'auth';
    el.viewRestricted.hidden = name !== 'restricted';
    el.viewWorkspace.hidden = name !== 'workspace';
    el.headerActions.hidden = name === 'auth';
  }

  function setKeyFieldValidity(showError) {
    var value = el.apiKeyInput.value.trim();
    var valid = Format.validateApiKeyFormat(value);
    var invalidNow = showError && !valid;

    el.apiKeyInput.classList.toggle('user-invalid-fallback', invalidNow);
    el.apiKeyInput.setAttribute('aria-invalid', invalidNow ? 'true' : 'false');
    el.apiKeyError.hidden = !invalidNow;
    el.apiKeyInput.setAttribute(
      'aria-describedby',
      invalidNow ? 'api-key-hint api-key-error' : 'api-key-hint'
    );
    if (invalidNow) {
      announce('Enter a valid CrewCut API key starting with cc_live_.');
    }
    return valid;
  }

  function setAuthServerError(message) {
    if (!message) {
      el.authServerError.hidden = true;
      el.authServerError.textContent = '';
      return;
    }
    el.authServerError.hidden = false;
    el.authServerError.textContent = message;
    announce(message);
  }

  function setUploadError(message) {
    if (!message) {
      el.uploadError.hidden = true;
      el.uploadError.textContent = '';
      return;
    }
    el.uploadError.hidden = false;
    el.uploadError.textContent = message;
    announce(message);
  }

  function setFeedbackError(message) {
    if (!message) {
      el.feedbackError.hidden = true;
      el.feedbackError.textContent = '';
      return;
    }
    el.feedbackError.hidden = false;
    el.feedbackError.textContent = message;
    announce(message);
  }

  function renderStorage(user) {
    var stats = Format.computeQuotaStats(user && user.storageUsedBytes, user && user.storageLimitBytes);
    quotaRemainingBytes = stats.remainingBytes;
    el.storageNumbers.textContent = Format.formatBytes(stats.usedBytes) + ' / ' + Format.formatBytes(stats.limitBytes);
    el.storagePercent.textContent = stats.usedPercent + '%';
    el.storageRemaining.textContent = Format.formatBytes(stats.remainingBytes) + ' available';
    el.storageTrack.setAttribute('aria-valuenow', String(stats.usedPercent));
    el.storageFill.style.width = (stats.usedBytes > 0 ? Math.max(2, stats.usedPercent) : 0) + '%';
    el.storageFill.classList.toggle('is-warning', stats.status === 'warning');
    el.storageFill.classList.toggle('is-critical', stats.status === 'critical');
  }

  function renderFolders(folders) {
    var prev = el.uploadFolderSelect.value;
    el.uploadFolderSelect.innerHTML = '';
    var rootOpt = document.createElement('option');
    rootOpt.value = '';
    rootOpt.textContent = 'All Videos (Root)';
    el.uploadFolderSelect.appendChild(rootOpt);

    (folders || []).forEach(function (folder) {
      var opt = document.createElement('option');
      opt.value = folder.id;
      opt.textContent = folder.name;
      el.uploadFolderSelect.appendChild(opt);
    });

    if (Array.from(el.uploadFolderSelect.options).some(function (o) { return o.value === prev; })) {
      el.uploadFolderSelect.value = prev;
    }
  }

  function getSelectedHostItem() {
    for (var i = 0; i < hostItems.length; i++) {
      if (hostItems[i].id === selectedHostItemId) return hostItems[i];
    }
    if (currentHost && currentHost.activeItem) return currentHost.activeItem;
    return null;
  }

  function getSelectedCut() {
    var id = selectedCutId || el.feedbackCutSelect.value;
    for (var i = 0; i < recentVideos.length; i++) {
      if (recentVideos[i].id === id) return recentVideos[i];
    }
    return null;
  }

  function renderCutSelector(videos) {
    recentVideos = Array.isArray(videos) ? videos.slice() : [];
    el.recentCount.textContent = String(recentVideos.length);
    el.feedbackCutSelect.innerHTML = '';

    if (recentVideos.length === 0) {
      var emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'No uploaded cuts yet';
      el.feedbackCutSelect.appendChild(emptyOpt);
      selectedCutId = '';
      updateFeedbackControls();
      renderComments([]);
      return;
    }

    var keepExisting = recentVideos.some(function (v) { return v.id === selectedCutId; });
    if (!keepExisting) {
      selectedCutId = recentVideos[0].id;
    }

    recentVideos.forEach(function (video) {
      var opt = document.createElement('option');
      opt.value = video.id;
      var status = String(video.status || 'ready');
      var ago = Format.timeAgo(video.created_at);
      var suffix = [Format.formatTimecode(video.duration_s), status];
      if (ago) suffix.push(ago);
      opt.textContent = (video.title || 'Untitled Cut') + ' (' + suffix.join(' · ') + ')';
      el.feedbackCutSelect.appendChild(opt);
    });

    el.feedbackCutSelect.value = selectedCutId;
    updateFeedbackControls();
  }

  function updateFeedbackControls() {
    var cut = getSelectedCut();
    el.btnFeedbackCopy.disabled = !cut;
    el.btnFeedbackOpen.disabled = !cut;
    el.btnSyncMarkers.disabled = !cut || currentComments.length === 0;
  }

  function renderComments(comments) {
    if (currentActiveAudio) {
      currentActiveAudio.pause();
      currentActiveAudio = null;
      currentActiveAudioBtn = null;
    }

    currentComments = Array.isArray(comments) ? comments : [];
    el.commentsCount.textContent = currentComments.length + (currentComments.length === 1 ? ' comment' : ' comments');
    el.commentsList.innerHTML = '';
    updateFeedbackControls();

    if (currentComments.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = recentVideos.length === 0
        ? 'Render and upload a cut to collect client feedback.'
        : 'No comments on this cut yet.';
      el.commentsList.appendChild(empty);
      return;
    }

    currentComments.forEach(function (comment, idx) {
      var card = document.createElement('article');
      card.className = 'comment-card' + (comment.isReply ? ' is-reply' : '');
      card.style.animationDelay = (idx * 35) + 'ms';

      var head = document.createElement('div');
      head.className = 'row-between';

      var author = document.createElement('span');
      author.className = 'comment-author';
      author.textContent = comment.author || 'Client';

      var tcBtn = document.createElement('button');
      tcBtn.type = 'button';
      tcBtn.className = 'timecode-btn';
      var tcLabel = Format.formatTimecode(comment.timecodeSeconds);
      tcBtn.textContent = tcLabel;
      tcBtn.setAttribute('aria-label', 'Jump playhead to ' + tcLabel);
      tcBtn.addEventListener('click', async function () {
        setFeedbackError('');
        var activeItem = getSelectedHostItem();
        var res = await Cep.seekPlayhead(comment.timecodeSeconds, activeItem ? activeItem.id : '');
        if (!res || !res.ok) {
          setFeedbackError((res && res.error) || 'Could not seek host playhead.');
          return;
        }
        announce('Playhead moved to ' + tcLabel);
      });

      head.append(author, tcBtn);

      var body = null;
      if (comment.text && comment.text.trim()) {
        body = document.createElement('p');
        body.className = 'comment-body';
        body.textContent = comment.text;
      }

      var voiceUrl = comment.voiceNoteUrl || comment.voice_note_url;
      var voiceCard = null;
      if (voiceUrl) {
        voiceCard = document.createElement('div');
        voiceCard.className = 'voice-note-player';

        var playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = 'voice-play-btn';
        playBtn.setAttribute('aria-label', 'Play voice note');
        playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

        var track = document.createElement('div');
        track.className = 'voice-track';
        var fill = document.createElement('div');
        fill.className = 'voice-fill';
        track.appendChild(fill);

        var timeLabel = document.createElement('span');
        timeLabel.className = 'mono tabular-nums voice-time';
        timeLabel.textContent = 'Voice note';

        var audio = new Audio(voiceUrl);

        track.addEventListener('click', function (e) {
          if (!audio.duration || isNaN(audio.duration)) return;
          var rect = track.getBoundingClientRect();
          var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          audio.currentTime = pct * audio.duration;
          fill.style.width = (pct * 100) + '%';
        });

        audio.addEventListener('loadedmetadata', function () {
          if (audio.duration && !isNaN(audio.duration)) {
            timeLabel.textContent = Format.formatTimecode(audio.duration);
          }
        });

        audio.addEventListener('timeupdate', function () {
          if (audio.duration && !isNaN(audio.duration)) {
            var pct = (audio.currentTime / audio.duration) * 100;
            fill.style.width = pct + '%';
            timeLabel.textContent = Format.formatTimecode(audio.currentTime) + ' / ' + Format.formatTimecode(audio.duration);
          }
        });

        audio.addEventListener('ended', function () {
          playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
          fill.style.width = '0%';
          if (audio.duration && !isNaN(audio.duration)) {
            timeLabel.textContent = Format.formatTimecode(audio.duration);
          }
          if (currentActiveAudio === audio) {
            currentActiveAudio = null;
            currentActiveAudioBtn = null;
          }
        });

        playBtn.addEventListener('click', function () {
          if (currentActiveAudio && currentActiveAudio !== audio) {
            currentActiveAudio.pause();
            currentActiveAudio.currentTime = 0;
            if (currentActiveAudioBtn) {
              currentActiveAudioBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            }
          }

          if (audio.paused) {
            audio.play().then(function () {
              playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
              currentActiveAudio = audio;
              currentActiveAudioBtn = playBtn;
            }).catch(function (e) {
              setFeedbackError('Audio playback failed: ' + (e && e.message));
            });
          } else {
            audio.pause();
            playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            currentActiveAudio = null;
            currentActiveAudioBtn = null;
          }
        });

        voiceCard.append(playBtn, track, timeLabel);
      }

      var foot = document.createElement('div');
      foot.className = 'comment-foot';

      var leftTag = document.createElement('span');
      var tags = [];
      if (voiceUrl) tags.push('🎙️ Voice note');
      if (comment.isReply) tags.push('Reply');
      if (syncedCommentIds.has(comment.id)) tags.push('Synced');
      leftTag.textContent = tags.join(' · ');

      var ago = document.createElement('span');
      ago.className = 'mono';
      ago.textContent = Format.timeAgo(comment.createdAt);

      foot.append(leftTag, ago);
      card.appendChild(head);
      if (body) card.appendChild(body);
      if (voiceCard) card.appendChild(voiceCard);
      card.appendChild(foot);
      el.commentsList.appendChild(card);
    });
  }

  async function loadCommentsForSelectedCut() {
    var cut = getSelectedCut();
    setFeedbackError('');
    el.syncStatusLine.hidden = true;
    el.syncStatusLine.textContent = '';

    if (!cut) {
      renderComments([]);
      return;
    }

    el.btnRefreshComments.disabled = true;
    try {
      var res = await makeClient().getComments({ videoId: cut.id });
      renderComments(res.comments || []);
    } catch (err) {
      setFeedbackError((err && err.message) || 'Failed to load comments.');
    } finally {
      el.btnRefreshComments.disabled = false;
    }
  }

  function updateAutoTitle(candidate) {
    if (titleEditedManually) return;
    el.uploadTitleInput.value = candidate ? String(candidate) : '';
  }

  function updateUploadReadyState() {
    var busy = Boolean(activeTransfer);
    var selectedItem = getSelectedHostItem();
    var hostReady = Boolean(currentHost && currentHost.inCep && currentHost.hasProject && selectedItem);

    el.btnRefreshHost.disabled = busy;
    el.hostItemSelect.disabled = busy || !currentHost || !currentHost.inCep || hostItems.length === 0;
    el.uploadTitleInput.disabled = busy;
    el.uploadFolderSelect.disabled = busy;
    el.uploadInstantPlayback.disabled = busy;
    el.btnStartUpload.disabled = busy || !hostReady;
  }

  function applySelectedHostItem(item, shouldSetDefaultRange) {
    if (!item) {
      el.uploadWorkArea.checked = false;
      el.uploadWorkArea.disabled = true;
      el.uploadWorkAreaText.textContent = 'Render Work Area / In-Out range only';
      updateUploadReadyState();
      return;
    }

    var projPrefix = currentHost && currentHost.projectName ? currentHost.projectName + ' · ' : '';
    el.hostSourceName.textContent = projPrefix + item.name;

    var metaParts = [
      item.kind === 'composition' ? 'Comp' : 'Sequence',
      Format.formatTimecode(item.durationSeconds),
    ];
    if (item.width && item.height) {
      metaParts.push(item.width + 'x' + item.height);
    }
    if (item.frameRate) {
      metaParts.push(Math.round(item.frameRate * 100) / 100 + ' fps');
    }
    if (item.hasWorkRange) {
      metaParts.push(
        'Selected ' + Format.formatTimecode(item.rangeStartSeconds) + '–' + Format.formatTimecode(item.rangeEndSeconds)
      );
      el.uploadWorkArea.disabled = false;
      if (shouldSetDefaultRange) {
        el.uploadWorkArea.checked = Boolean(item.hasCustomWorkRange);
      }
      el.uploadWorkAreaText.textContent = item.kind === 'composition'
        ? 'Render Work Area (' + Format.formatTimecode(item.rangeStartSeconds) + '–' + Format.formatTimecode(item.rangeEndSeconds) + ')'
        : 'Render In/Out range (' + Format.formatTimecode(item.rangeStartSeconds) + '–' + Format.formatTimecode(item.rangeEndSeconds) + ')';
    } else {
      el.uploadWorkArea.checked = false;
      el.uploadWorkArea.disabled = true;
      el.uploadWorkAreaText.textContent = item.kind === 'composition' ? 'Render Work Area only' : 'Render In/Out range only';
    }

    el.hostSourceMeta.textContent = metaParts.join(' · ');
    updateAutoTitle(item.name);
    updateUploadReadyState();
  }

  function renderHostItemsDropdown(host) {
    el.hostItemSelect.innerHTML = '';

    if (!host || !host.inCep) {
      var prevOpt = document.createElement('option');
      prevOpt.value = '';
      prevOpt.textContent = 'Open inside Premiere Pro or After Effects';
      el.hostItemSelect.appendChild(prevOpt);
      return;
    }

    if (hostItems.length === 0) {
      var emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = host.host === 'AEFT' ? 'No compositions found in project' : 'No sequences found in project';
      el.hostItemSelect.appendChild(emptyOpt);
      return;
    }

    hostItems.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name + ' (' + Format.formatTimecode(item.durationSeconds) + ')';
      el.hostItemSelect.appendChild(opt);
    });

    el.hostItemSelect.value = selectedHostItemId;
  }

  async function refreshHostInfo() {
    var host = await Cep.getHostContext();
    currentHost = host;
    el.hostBadge.textContent = host.hostLabel || 'Browser Preview';
    hostItems = Array.isArray(host.items) ? host.items.slice() : [];
    if (host.activeItem && !hostItems.some(function (it) { return it.id === host.activeItem.id; })) {
      hostItems.unshift(host.activeItem);
    }

    if (!host.inCep) {
      el.hostSourceName.textContent = 'Standalone browser preview';
      el.hostSourceMeta.textContent = 'Open inside Premiere Pro or After Effects to render sequences and comps.';
      selectedHostItemId = '';
      renderHostItemsDropdown(host);
      applySelectedHostItem(null, true);
      return;
    }

    if (host.hostError) {
      el.hostSourceName.textContent = 'Host connection issue';
      el.hostSourceMeta.textContent = host.hostError;
      selectedHostItemId = '';
      renderHostItemsDropdown(host);
      applySelectedHostItem(null, true);
      return;
    }

    if (!host.hasProject) {
      el.hostSourceName.textContent = 'No project open';
      el.hostSourceMeta.textContent = 'Open a ' + host.hostLabel + ' project to select a sequence or composition.';
      selectedHostItemId = '';
      renderHostItemsDropdown(host);
      applySelectedHostItem(null, true);
      return;
    }

    if (hostItems.length === 0 || !host.activeItem) {
      el.hostSourceName.textContent = host.host === 'AEFT' ? 'No composition in project' : 'No sequence in project';
      el.hostSourceMeta.textContent = host.host === 'AEFT'
        ? 'Create or open a composition in After Effects, then click Refresh host.'
        : 'Create or open a sequence in Premiere Pro, then click Refresh host.';
      selectedHostItemId = '';
      renderHostItemsDropdown(host);
      applySelectedHostItem(null, true);
      return;
    }

    var detectedId = host.activeItem.id;
    var stillExists = hostItems.some(function (it) { return it.id === selectedHostItemId; });
    var switchedActiveInHost = detectedId && detectedId !== lastDetectedHostActiveId;
    var shouldResetRange = !stillExists || switchedActiveInHost;

    if (switchedActiveInHost || !stillExists) {
      selectedHostItemId = detectedId || hostItems[0].id;
    }
    lastDetectedHostActiveId = detectedId;

    renderHostItemsDropdown(host);
    applySelectedHostItem(getSelectedHostItem(), shouldResetRange);
  }

  function showProgressUI(stageText, percentOrNull, metaText, canPause, paused) {
    el.uploadProgressCard.hidden = false;
    el.uploadProgressCard.classList.add('aurora-border');
    el.uploadStageLabel.textContent = stageText;
    el.uploadStageLabel.classList.add('shiny-text');
    if (percentOrNull === null || percentOrNull === undefined) {
      el.uploadProgressBar.removeAttribute('value');
      el.uploadPercentLabel.textContent = '...';
    } else {
      el.uploadProgressBar.value = percentOrNull;
      el.uploadPercentLabel.textContent = percentOrNull + '%';
    }
    el.uploadProgressMeta.textContent = metaText || '';
    el.btnUploadPause.hidden = !canPause;
    el.btnUploadPause.textContent = paused ? 'Resume' : 'Pause';
  }

  function hideProgressUI() {
    el.uploadProgressCard.hidden = true;
    el.uploadProgressCard.classList.remove('aurora-border');
    el.uploadProgressBar.removeAttribute('value');
    el.uploadStageLabel.classList.remove('shiny-text');
    el.btnUploadPause.hidden = true;
  }

  function waitMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function renderFromHost(title, workAreaOnly, targetId, itemName) {
    var tempPath = Cep.getTempRenderPath(title, '.mp4');
    if (!tempPath) {
      throw new Error('Temporary render path unavailable outside CEP Node runtime.');
    }

    var state = {
      tempPath: tempPath,
      renderJobId: null,
      cancelled: false,
      tusHandle: null,
    };
    activeTransfer = state;
    updateUploadReadyState();

    showProgressUI(
      'Rendering ' + (itemName || 'cut') + '...',
      null,
      currentHost.host === 'AEFT' ? 'Rendering composition in After Effects...' : 'Queued in Adobe Media Encoder...',
      false,
      false
    );

    var startRes = await Cep.startHostRender(tempPath, workAreaOnly, targetId);
    if (!startRes || !startRes.ok) {
      throw new Error((startRes && startRes.error) || 'Host render failed.');
    }

    var jobData = startRes.data || {};
    state.renderJobId = jobData.jobId || null;
    if (jobData.outputPath) {
      state.tempPath = jobData.outputPath;
    }

    if (jobData.status === 'complete') {
      return state.tempPath;
    }

    while (!state.cancelled) {
      await waitMs(750);
      if (state.cancelled) {
        throw Object.assign(new Error('Render cancelled.'), { code: 'CANCELLED' });
      }
      var statusRes = await Cep.getHostRenderStatus(state.renderJobId);
      if (!statusRes || !statusRes.ok) {
        throw new Error((statusRes && statusRes.error) || 'Failed checking Adobe Media Encoder progress.');
      }
      var st = statusRes.data || {};
      if (st.outputPath) {
        state.tempPath = st.outputPath;
      }
      if (st.status === 'complete') {
        return state.tempPath;
      }
      if (st.status === 'cancelled') {
        throw Object.assign(new Error('Render cancelled.'), { code: 'CANCELLED' });
      }
      if (st.status === 'error') {
        throw new Error(st.error || 'Adobe Media Encoder reported an export error.');
      }
      if (st.fileSize > 0) {
        el.uploadProgressMeta.textContent = 'Encoding · ' + Format.formatBytes(st.fileSize) + ' written';
      }
    }

    throw Object.assign(new Error('Render cancelled.'), { code: 'CANCELLED' });
  }

  async function startUploadFlow() {
    if (activeTransfer) return;

    setUploadError('');
    el.uploadResultCard.hidden = true;

    var item = getSelectedHostItem();
    if (!currentHost || !currentHost.inCep || !currentHost.hasProject || !item) {
      setUploadError('Open a project and select a composition or sequence before rendering.');
      return;
    }

    var rawTitle = el.uploadTitleInput.value.trim();
    var folderId = el.uploadFolderSelect.value || null;
    var client = makeClient();
    var renderedTempPath = null;

    try {
      var workAreaOnly = Boolean(el.uploadWorkArea.checked && item.hasWorkRange);
      var hostTitle = rawTitle || item.name || 'Untitled Cut';
      var estDuration = workAreaOnly
        ? Math.max(0, Number(item.rangeEndSeconds || 0) - Number(item.rangeStartSeconds || 0))
        : Number(item.durationSeconds || 0);

      renderedTempPath = await renderFromHost(hostTitle, workAreaOnly, item.id, item.name);
      if (activeTransfer && activeTransfer.cancelled) {
        Cep.deleteFileSafe(renderedTempPath);
        return;
      }

      var fileInfo = Cep.statFile(renderedTempPath);
      if (!fileInfo) {
        throw new Error('Rendered video file could not be read from disk.');
      }

      var tusHandle = Uploader.startSignedTusUpload({
        api: client,
        cep: Cep,
        filePath: renderedTempPath,
        fileName: fileInfo.name,
        sizeBytes: fileInfo.sizeBytes,
        isTempFile: true,
        title: hostTitle,
        folderId: folderId,
        instantPlayback: Boolean(el.uploadInstantPlayback && el.uploadInstantPlayback.checked),
        estimatedDurationSeconds: estDuration,
        remainingBytes: quotaRemainingBytes,
        onPhase: function (phase, info) {
          var meta = info && info.sizeBytes ? Format.formatBytes(info.sizeBytes) : el.uploadProgressMeta.textContent;
          if (phase === 'signing') {
            showProgressUI('Signing upload...', null, meta, false, false);
          } else if (phase === 'uploading') {
            var currentVal = el.uploadProgressBar.hasAttribute('value') ? Number(el.uploadProgressBar.value || 0) : 0;
            showProgressUI('Uploading to CrewCut...', currentVal, meta, true, false);
          } else if (phase === 'paused') {
            var pausedVal = el.uploadProgressBar.hasAttribute('value') ? Number(el.uploadProgressBar.value || 0) : 0;
            showProgressUI('Upload paused', pausedVal, el.uploadProgressMeta.textContent || meta, true, true);
          } else if (phase === 'finalizing') {
            showProgressUI('Finalizing cut...', null, 'Preparing stream & review link...', false, false);
          }
        },
        onProgress: function (prog) {
          showProgressUI(
            'Uploading to CrewCut...',
            prog.percent,
            Format.formatBytes(prog.bytesUploaded) + ' / ' + Format.formatBytes(prog.bytesTotal),
            true,
            false
          );
        },
      });

      if (activeTransfer) {
        activeTransfer.tusHandle = tusHandle;
      }

      var result = await tusHandle.promise;
      lastUploadResult = result;
      hideProgressUI();
      el.resultCutTitle.textContent = result.title || 'Cut uploaded';
      el.resultReviewUrl.textContent = result.reviewUrl || '';
      el.uploadResultCard.hidden = false;
      announce('Upload complete. Review link ready for ' + (result.title || 'cut'));

      recentVideos.unshift({
        id: result.videoId,
        title: result.title,
        duration_s: estDuration || 0,
        size_bytes: result.sizeBytes,
        status: 'processing',
        created_at: new Date().toISOString(),
        folder_id: folderId,
        reviewToken: result.reviewToken,
        reviewUrl: result.reviewUrl,
      });
      selectedCutId = result.videoId;
      renderCutSelector(recentVideos);

      try {
        var freshCtx = await client.getContext();
        renderStorage(freshCtx.user);
        renderFolders(freshCtx.folders);
        renderCutSelector(freshCtx.recentVideos || recentVideos);
      } catch (_) {}
    } catch (err) {
      hideProgressUI();
      if (renderedTempPath) {
        Cep.deleteFileSafe(renderedTempPath);
      }
      if (!err || err.code !== 'CANCELLED') {
        setUploadError((err && err.message) || 'Upload failed.');
      } else {
        announce('Upload cancelled.');
      }
    } finally {
      activeTransfer = null;
      updateUploadReadyState();
    }
  }

  async function resolveReviewUrlForCut(cut) {
    if (!cut) return null;
    if (cut.reviewUrl) return cut.reviewUrl;
    var res = await makeClient().getOrCreateReviewLink(cut.id);
    cut.reviewUrl = res.reviewUrl;
    cut.reviewToken = res.reviewToken;
    return res.reviewUrl;
  }

  async function connectAndLoadContext(candidateConfig) {
    var client = Api.createApiClient({
      apiBaseUrl: candidateConfig.apiBaseUrl,
      apiKey: candidateConfig.apiKey,
    });

    var data = await client.getContext();
    config = Cep.saveConfig(candidateConfig);

    el.userEmail.textContent = (data.user && data.user.email) || 'Creator';
    el.userKeyMask.textContent = Format.maskApiKey(config.apiKey);
    el.userPlanBadge.textContent = Format.formatPlanName(data.user && data.user.plan);
    renderStorage(data.user);
    renderFolders(data.folders);
    renderCutSelector(data.recentVideos);
    showView('workspace');
    await refreshHostInfo();
    if (selectedCutId) {
      await loadCommentsForSelectedCut();
    }
  }

  function selectTab(targetTab) {
    var tabs = [el.tabUpload, el.tabFeedback];
    var panels = [el.panelUpload, el.panelFeedback];

    tabs.forEach(function (tab, idx) {
      var selected = tab === targetTab;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.setAttribute('tabindex', selected ? '0' : '-1');
      panels[idx].hidden = !selected;
    });

    if (targetTab === el.tabFeedback && selectedCutId && currentComments.length === 0) {
      loadCommentsForSelectedCut();
    }
  }

  function bindTabs() {
    var tabs = [el.tabUpload, el.tabFeedback];
    tabs.forEach(function (tab, idx) {
      tab.addEventListener('click', function () { selectTab(tab); });
      tab.addEventListener('keydown', function (e) {
        var nextIdx = null;
        if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') nextIdx = 0;
        else if (e.key === 'End') nextIdx = tabs.length - 1;
        if (nextIdx !== null) {
          e.preventDefault();
          tabs[nextIdx].focus();
          selectTab(tabs[nextIdx]);
        }
      });
    });
  }

  function bindEvents() {
    el.btnToggleKey.addEventListener('click', function () {
      var show = el.apiKeyInput.type === 'password';
      el.apiKeyInput.type = show ? 'text' : 'password';
      el.btnToggleKey.setAttribute('aria-pressed', String(show));
      el.btnToggleKey.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key');
    });

    el.apiKeyInput.addEventListener('blur', function () {
      if (el.apiKeyInput.value.trim().length > 0) {
        keyTouched = true;
        setKeyFieldValidity(true);
      }
    });

    el.apiKeyInput.addEventListener('input', function () {
      setAuthServerError('');
      if (keyTouched) {
        setKeyFieldValidity(true);
      }
    });

    el.authForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      keyTouched = true;
      setAuthServerError('');

      if (!setKeyFieldValidity(true)) {
        el.apiKeyInput.focus();
        return;
      }

      var nextConfig = {
        apiKey: el.apiKeyInput.value.trim(),
        apiBaseUrl: Format.normalizeBaseUrl(el.apiBaseInput.value, config.apiBaseUrl),
        appOrigin: Format.normalizeBaseUrl(el.appOriginInput.value, config.appOrigin),
      };

      el.btnLinkAccount.disabled = true;
      el.btnLinkAccount.textContent = 'Linking...';

      try {
        await connectAndLoadContext(nextConfig);
      } catch (err) {
        if (err instanceof Api.CrewCutApiError && err.code === 'PLAN_RESTRICTED') {
          config = Cep.saveConfig(nextConfig);
          el.restrictedPlanBadge.textContent = Format.formatPlanName(err.planId);
          showView('restricted');
        } else {
          setAuthServerError((err && err.message) || 'Could not link your CrewCut account.');
        }
      } finally {
        el.btnLinkAccount.disabled = false;
        el.btnLinkAccount.textContent = 'Link Account';
      }
    });

    el.btnOpenKeysPage.addEventListener('click', function () {
      var origin = Format.normalizeBaseUrl(el.appOriginInput.value, config.appOrigin);
      Cep.openExternalUrl(origin + '/account#integrations');
    });

    el.btnComparePlans.addEventListener('click', function () {
      Cep.openExternalUrl(config.appOrigin + '/billing/pricing');
    });

    function handleUnlink() {
      config = Cep.saveConfig(Object.assign({}, config, { apiKey: '' }));
      el.apiKeyInput.value = '';
      keyTouched = false;
      setKeyFieldValidity(false);
      setAuthServerError('');
      showView('auth');
      el.apiKeyInput.focus();
    }

    el.btnSwitchKey.addEventListener('click', handleUnlink);
    el.btnUnlink.addEventListener('click', handleUnlink);

    el.btnRefreshAll.addEventListener('click', async function () {
      if (!config.apiKey) {
        await refreshHostInfo();
        return;
      }
      el.btnRefreshAll.disabled = true;
      try {
        await connectAndLoadContext(config);
        announce('Workspace refreshed');
      } catch (err) {
        if (err instanceof Api.CrewCutApiError && err.code === 'PLAN_RESTRICTED') {
          el.restrictedPlanBadge.textContent = Format.formatPlanName(err.planId);
          showView('restricted');
        } else if (err instanceof Api.CrewCutApiError && err.code === 'UNAUTHORIZED') {
          setAuthServerError(err.message);
          showView('auth');
        } else {
          announce((err && err.message) || 'Refresh failed');
        }
      } finally {
        el.btnRefreshAll.disabled = false;
      }
    });

    el.btnRefreshHost.addEventListener('click', function () {
      refreshHostInfo();
    });

    el.hostItemSelect.addEventListener('change', function () {
      selectedHostItemId = el.hostItemSelect.value;
      titleEditedManually = false;
      applySelectedHostItem(getSelectedHostItem(), true);
    });

    el.uploadTitleInput.addEventListener('input', function () {
      titleEditedManually = el.uploadTitleInput.value.trim().length > 0;
    });

    el.btnStartUpload.addEventListener('click', startUploadFlow);

    el.btnUploadPause.addEventListener('click', function () {
      if (!activeTransfer || !activeTransfer.tusHandle) return;
      if (activeTransfer.tusHandle.isPaused()) {
        activeTransfer.tusHandle.resume();
      } else {
        activeTransfer.tusHandle.pause();
      }
    });

    el.btnUploadCancel.addEventListener('click', async function () {
      if (!activeTransfer) return;
      activeTransfer.cancelled = true;
      if (activeTransfer.renderJobId && !activeTransfer.tusHandle) {
        await Cep.cancelHostRender(activeTransfer.renderJobId);
      }
      if (activeTransfer.tusHandle) {
        await activeTransfer.tusHandle.cancel();
      }
      if (activeTransfer.tempPath) {
        Cep.deleteFileSafe(activeTransfer.tempPath);
      }
    });

    el.btnResultCopy.addEventListener('click', async function () {
      if (!lastUploadResult || !lastUploadResult.reviewUrl) return;
      var ok = await Cep.copyText(lastUploadResult.reviewUrl);
      el.btnResultCopy.textContent = ok ? 'Copied' : 'Copy Failed';
      setTimeout(function () { el.btnResultCopy.textContent = 'Copy Link'; }, 1800);
    });

    el.btnResultOpen.addEventListener('click', function () {
      if (lastUploadResult && lastUploadResult.reviewUrl) {
        Cep.openExternalUrl(lastUploadResult.reviewUrl);
      }
    });

    el.btnResultFeedback.addEventListener('click', async function () {
      if (lastUploadResult && lastUploadResult.videoId) {
        selectedCutId = lastUploadResult.videoId;
        el.feedbackCutSelect.value = selectedCutId;
      }
      selectTab(el.tabFeedback);
      await loadCommentsForSelectedCut();
    });

    el.feedbackCutSelect.addEventListener('change', function () {
      selectedCutId = el.feedbackCutSelect.value;
      loadCommentsForSelectedCut();
    });

    el.btnRefreshComments.addEventListener('click', loadCommentsForSelectedCut);

    el.btnFeedbackCopy.addEventListener('click', async function () {
      var cut = getSelectedCut();
      if (!cut) return;
      el.btnFeedbackCopy.disabled = true;
      try {
        var url = await resolveReviewUrlForCut(cut);
        var ok = await Cep.copyText(url);
        el.btnFeedbackCopy.textContent = ok ? 'Copied' : 'Failed';
        announce(ok ? ('Copied review link for ' + cut.title) : 'Could not copy review link');
        setTimeout(function () { el.btnFeedbackCopy.textContent = 'Copy Link'; }, 1800);
      } catch (err) {
        setFeedbackError((err && err.message) || 'Could not copy review link.');
      } finally {
        updateFeedbackControls();
      }
    });

    el.btnFeedbackOpen.addEventListener('click', async function () {
      var cut = getSelectedCut();
      if (!cut) return;
      el.btnFeedbackOpen.disabled = true;
      try {
        var url = await resolveReviewUrlForCut(cut);
        if (url) Cep.openExternalUrl(url);
      } catch (err) {
        setFeedbackError((err && err.message) || 'Could not open review link.');
      } finally {
        updateFeedbackControls();
      }
    });

    el.btnSyncMarkers.addEventListener('click', async function () {
      if (currentComments.length === 0) return;
      setFeedbackError('');
      el.btnSyncMarkers.disabled = true;
      el.btnSyncMarkers.textContent = 'Syncing...';

      try {
        var activeItem = getSelectedHostItem();
        var res = await Cep.syncMarkers(currentComments, activeItem ? activeItem.id : '');
        if (!res || !res.ok) {
          setFeedbackError((res && res.error) || 'Failed to sync markers.');
          return;
        }
        var data = res.data || {};
        currentComments.forEach(function (c) { syncedCommentIds.add(c.id); });
        var added = Number(data.added || 0);
        var skipped = Number(data.skipped || 0);
        var summary = added > 0
          ? ('Added ' + added + (added === 1 ? ' marker' : ' markers') + (skipped > 0 ? ' (' + skipped + ' already synced)' : ''))
          : ('All ' + skipped + (skipped === 1 ? ' marker' : ' markers') + ' already synced');
        el.syncStatusLine.textContent = summary;
        el.syncStatusLine.hidden = false;
        announce(summary);
        renderComments(currentComments);
      } finally {
        el.btnSyncMarkers.textContent = 'Sync Markers';
        updateFeedbackControls();
      }
    });
  }

  function bindSpotlightEffect() {
    document.addEventListener('pointermove', function (e) {
      var cards = document.querySelectorAll('.surface-card, .comment-card, .recessed-box');
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        if (x >= -40 && x <= rect.width + 40 && y >= -40 && y <= rect.height + 40) {
          card.style.setProperty('--mouse-x', x + 'px');
          card.style.setProperty('--mouse-y', y + 'px');
        }
      }
    }, { passive: true });
  }

  function initClickSparks() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest('button, .btn, .timecode-btn, .tab-btn');
      if (!btn || btn.disabled) return;

      var box = document.createElement('div');
      box.className = 'cc-spark-container';
      box.style.left = e.clientX + 'px';
      box.style.top = e.clientY + 'px';

      for (var i = 0; i < 8; i++) {
        var p = document.createElement('span');
        p.className = 'cc-spark-particle';
        var rad = (i / 8) * 2 * Math.PI;
        var dist = 14 + Math.random() * 12;
        p.style.setProperty('--tx', Math.cos(rad) * dist + 'px');
        p.style.setProperty('--ty', Math.sin(rad) * dist + 'px');
        box.appendChild(p);
      }

      document.body.appendChild(box);
      setTimeout(function () {
        if (box.parentNode) box.parentNode.removeChild(box);
      }, 420);
    });
  }

  async function init() {
    var env = Cep.getHostEnvironment();
    el.hostBadge.textContent = env.hostLabel;
    el.apiBaseInput.value = config.apiBaseUrl;
    el.appOriginInput.value = config.appOrigin;

    bindTabs();
    bindEvents();
    bindSpotlightEffect();
    initClickSparks();

    if (!config.apiKey) {
      showView('auth');
      await refreshHostInfo();
      return;
    }

    el.apiKeyInput.value = config.apiKey;
    try {
      await connectAndLoadContext(config);
    } catch (err) {
      if (err instanceof Api.CrewCutApiError && err.code === 'PLAN_RESTRICTED') {
        el.restrictedPlanBadge.textContent = Format.formatPlanName(err.planId);
        showView('restricted');
      } else {
        setAuthServerError((err && err.message) || 'Saved API key could not be verified.');
        showView('auth');
      }
    }
  }

  init();
})(typeof globalThis !== 'undefined' ? globalThis : window);
