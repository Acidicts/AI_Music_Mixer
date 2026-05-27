class App {
  constructor() {
    this.audioEngine = new AudioEngine();
    this.visualizer = new Visualizer('visualizer');
    this.ollama = new OllamaClient();
    this.musicSource = new MusicSource();
    this.queueManager = new QueueManager();
    this.metadataAnalyzer = new MetadataAnalyzer();
    this.userProfile = new UserProfile();
    this.activeFilters = [];

    this.dom = {};
    this.isProcessingQuery = false;
    this.isProfileVisible = false;
    this.currentTrackPlayStarted = 0;
    this.lastProgressUpdate = 0;
    this.lastAiQueries = [];
    this.isRefilling = false;
    this.resumeInterval = null;



    this.fxPresets = {
      flat:     { reverb: 0, bass: 0, treble: 0 },
      bass:     { reverb: 5, bass: 8, treble: 0 },
      treble:   { reverb: 5, bass: 0, treble: 6 },
      reverb:   { reverb: 55, bass: 0, treble: 0 },
      loudness: { reverb: 5, bass: 4, treble: 3 },
      vocal:    { reverb: 12, bass: -3, treble: 5 },
      night:    { reverb: 30, bass: 6, treble: -4 },
    };

    this.init();
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.setupSplits();
    this.setupQueueCallbacks();
    this.setupAudioCallbacks();
    this.visualizer.setAudioEngine(this.audioEngine);
    this.visualizer.start();
    this.updateProfileInjection();
    this.renderProfilePanel();
    setTimeout(() => this.tryResume(), 1000);
  }

  cacheDom() {
    this.dom = {
      chatInput: document.getElementById('chat-input'),
      chatSend: document.getElementById('chat-send'),
      chatMessages: document.getElementById('chat-messages'),
      filterChips: document.querySelectorAll('.filter-chip'),
      albumArt: document.getElementById('album-art'),
      npTitle: document.getElementById('np-title'),
      npArtist: document.getElementById('np-artist'),
      bpmDisplay: document.getElementById('bpm-display'),
      keyDisplay: document.getElementById('key-display'),
      userQueueList: document.getElementById('user-queue-list'),
      aiQueueList: document.getElementById('ai-queue-list'),
      nowPlayingTrack: document.getElementById('now-playing-track'),
      likeBtn: document.getElementById('like-btn'),
      dislikeBtn: document.getElementById('dislike-btn'),
      profilePanel: document.getElementById('profile-panel'),
      profileCloseBtn: document.getElementById('profile-close-btn'),
      profileClearBtn: document.getElementById('profile-clear-btn'),

      ctrlPlayBtn: document.getElementById('ctrl-play-btn'),
      ctrlPrevBtn: document.getElementById('ctrl-prev-btn'),
      ctrlNextBtn: document.getElementById('ctrl-next-btn'),
      ctrlRewindBtn: document.getElementById('ctrl-rewind-btn'),
      ctrlForwardBtn: document.getElementById('ctrl-forward-btn'),
      ctrlProgressFill: document.getElementById('ctrl-progress-fill'),
      ctrlProgressTrack: document.getElementById('ctrl-progress-track'),
      ctrlProgressThumb: document.getElementById('ctrl-progress-thumb'),
      ctrlTimeCurrent: document.getElementById('ctrl-time-current'),
      ctrlTimeTotal: document.getElementById('ctrl-time-total'),
      ctrlAlbumArt: document.getElementById('ctrl-album-art'),
      ctrlTitle: document.getElementById('ctrl-title'),
      ctrlArtist: document.getElementById('ctrl-artist'),
      ctrlLikeBtn: document.getElementById('ctrl-like-btn'),
      ctrlBanBtn: document.getElementById('ctrl-ban-btn'),
      ctrlQueueBtn: document.getElementById('ctrl-queue-btn'),
      ctrlVolSlider: document.getElementById('ctrl-vol-slider'),
      ctrlVolBtn: document.getElementById('ctrl-vol-btn'),
      ctrlVolFill: document.getElementById('ctrl-vol-fill'),
    };
  }

  bindEvents() {
    this.dom.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleUserMessage();
      }
    });
    this.dom.chatSend.addEventListener('click', () => this.handleUserMessage());

    // Playback controls
    this.dom.ctrlPlayBtn.addEventListener('click', () => this.togglePlay());
    this.dom.ctrlPrevBtn.addEventListener('click', () => this.previousTrack());
    this.dom.ctrlNextBtn.addEventListener('click', () => this.skipTrack());
    this.dom.ctrlRewindBtn.addEventListener('click', () => {
      if (this.audioEngine.audioElement) {
        this.audioEngine.seek(Math.max(0, this.audioEngine.audioElement.currentTime - 10));
      }
    });
    this.dom.ctrlForwardBtn.addEventListener('click', () => {
      if (this.audioEngine.audioElement) {
        this.audioEngine.seek(Math.min(this.audioEngine.audioElement.duration || Infinity, this.audioEngine.audioElement.currentTime + 10));
      }
    });

    // Volume
    this.dom.ctrlVolSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100;
      this.audioEngine.setVolume(val);
      this.dom.ctrlVolFill.style.width = `${val * 100}%`;
      this.dom.ctrlVolBtn.textContent = val === 0 ? '🔇' : val < 0.3 ? '🔈' : val < 0.5 ? '🔉' : '🔊';
    });

    // Queue toggle (opens profile/queue panel)
    this.dom.ctrlQueueBtn.addEventListener('click', () => this.toggleProfile());

    // Like from control bar
    this.dom.ctrlLikeBtn.addEventListener('click', () => this.handleLike());

    // Ban = skip
    this.dom.ctrlBanBtn.addEventListener('click', () => {
      if (this.queueManager.getNowPlaying()) {
        this.handleDislike();
        this.skipTrack();
      }
    });

    this.setupProgressScrub();

    this.dom.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        this.updateFilters();
      });
    });

    this.dom.likeBtn.addEventListener('click', () => this.handleLike());
    this.dom.dislikeBtn.addEventListener('click', () => this.handleDislike());
    this.dom.profileCloseBtn.addEventListener('click', () => this.closeProfile());
    this.dom.profileClearBtn.addEventListener('click', () => {
      if (confirm('Clear all profile data? This cannot be undone.')) {
        this.userProfile.clearHistory();
        this.updateProfileInjection();
        this.renderProfilePanel();
        this.addMessage('📊 Profile data cleared. I\'ll learn your taste from scratch!', 'ai');
        this.closeProfile();
      }
    });
  }

  applyFxPreset(name) {
    const preset = this.fxPresets[name];
    if (!preset) return;
    this.audioEngine.setReverb(preset.reverb);
    this.audioEngine.setBass(preset.bass);
    this.audioEngine.setTreble(preset.treble);
  }

  updateFilters() {
    this.activeFilters = [];
    this.dom.filterChips.forEach(chip => {
      if (chip.classList.contains('active')) {
        this.activeFilters.push(chip.dataset.filter);
      }
    });
    this.ollama.setFilters(this.activeFilters);
  }

  setupQueueCallbacks() {
    this.queueManager.onTrackChange = (track) => {
      if (track) {
        this.currentTrackPlayStarted = Date.now();
        this.loadAndPlayTrack(track);
      } else {
        this.setIdleState();
      }
      this.renderQueue();
    };

    this.queueManager.onQueueChange = (state) => {
      this.renderQueue(state);
    };

    this.queueManager.onTrackSkip = (track, wasSkipped) => {
      const playDuration = (Date.now() - this.currentTrackPlayStarted) / 1000;
      const totalDuration = this.audioEngine.audioElement?.duration || 0;
      const bpm = this.metadataAnalyzer.getBPM() || null;
      const key = this.metadataAnalyzer.getKey() || null;

      this.userProfile.trackPlayed(track, playDuration, totalDuration, wasSkipped, bpm, key);
      this.updateProfileInjection();
      this.refillAiQueue();
    };
  }

  setupAudioCallbacks() {
    this.audioEngine.onTimeUpdate = (current, duration) => {
      this.updateProgress(current, duration);

      if (current > 0 && Math.floor(current) !== this.lastProgressUpdate) {
        this.lastProgressUpdate = Math.floor(current);
      }
      if (current > 0 && Math.floor(current) % 5 === 0 && current !== this._lastSave) {
        this._lastSave = current;
        this.saveResumeState(current);
      }
    };

    this.audioEngine.onEnded = () => {
      this.clearResumeState();
      this.queueManager.onTrackEnded();
      this.refillAiQueue();
    };
  }

  saveResumeState(position) {
    const track = this.queueManager.getNowPlaying();
    if (!track) return;
    try {
      localStorage.setItem('ai-mixer-resume', JSON.stringify({
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        position: position || 0,
        quality: this.audioEngine.quality || 'medium',
        wasPlaying: this.audioEngine.isPlaying,
        timestamp: Date.now(),
      }));
    } catch {}
  }

  clearResumeState() {
    try { localStorage.removeItem('ai-mixer-resume'); } catch {}
  }

  async tryResume() {
    let data;
    try {
      const raw = localStorage.getItem('ai-mixer-resume');
      if (!raw) return;
      data = JSON.parse(raw);
    } catch { return; }

    if (!data || !data.videoId || !data.title) return;
    if (Date.now() - data.timestamp > 3600000) {
      this.clearResumeState();
      return;
    }

    this.addMessage(`🔄 Resuming "${data.title}" from your last session...`, 'ai');
    const track = {
      videoId: data.videoId,
      title: data.title,
      artist: data.artist || 'Unknown',
      thumbnail: data.thumbnail || '',
      duration: '--:--',
      durationSeconds: 0,
    };

    this.queueManager.setAiQueue([track]);

    try {
      this.updateNowPlayingUI(track);
      await this.audioEngine.loadTrack(track.videoId, () => {
        this.audioEngine.setQuality(data.quality || 'medium');
        if (data.position > 0) this.audioEngine.seek(data.position);
        this.metadataAnalyzer.reset();
        this.metadataAnalyzer.setSampleRate(this.audioEngine.ctx.sampleRate);
        if (data.wasPlaying) {
          this.audioEngine.play();
          this.dom.ctrlPlayBtn.textContent = '⏸';
          this.metadataAnalyzer.start(this.audioEngine.analyser);
        }
        this.saveResumeState(data.position);
      });
    } catch (err) {
      console.error('Resume failed:', err);
      this.clearResumeState();
    }
  }

  setupSplits() {
    const SPLIT_KEYS = {
      'divider-main': { key: 'split-main', dir: 'v', container: 'main-grid', prev: 'left-col', next: 'right-col' },
      'divider-left': { key: 'split-left', dir: 'h', container: 'left-col', prev: 'left-top', next: 'left-bottom' },
      'divider-right': { key: 'split-right', dir: 'h', container: 'right-col', prev: 'right-top', next: 'right-bottom' },
    };

    const loadRatio = (key, def) => {
      try { const v = localStorage.getItem(key); return v ? parseFloat(v) : def; } catch { return def; }
    };

    const applySplit = (cfg, ratio) => {
      const prev = document.getElementById(cfg.prev);
      const next = document.getElementById(cfg.next);
      if (cfg.dir === 'v') {
        prev.style.flex = `${ratio}`;
        next.style.flex = `${1 - ratio}`;
      } else {
        prev.style.flex = `${ratio}`;
        next.style.flex = `${1 - ratio}`;
      }
    };

    for (const [id, cfg] of Object.entries(SPLIT_KEYS)) {
      const divider = document.getElementById(id);
      if (!divider) continue;
      const saved = loadRatio(cfg.key, cfg.dir === 'v' ? 0.5 : 0.45);
      applySplit(cfg, saved);

      let isDragging = false;
      const container = document.getElementById(cfg.container);

      divider.addEventListener('mousedown', (e) => {
        isDragging = true;
        divider.classList.add('active');
        document.body.style.cursor = cfg.dir === 'v' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = container.getBoundingClientRect();
        let ratio;
        if (cfg.dir === 'v') {
          ratio = (e.clientX - rect.left) / rect.width;
        } else {
          ratio = (e.clientY - rect.top) / rect.height;
        }
        ratio = Math.max(0.15, Math.min(0.85, ratio));
        applySplit(cfg, ratio);
        try { localStorage.setItem(cfg.key, ratio.toString()); } catch {}
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          divider.classList.remove('active');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }
  }

  setupProgressScrub() {
    const track = this.dom.ctrlProgressTrack;
    let isDragging = false;

    const seekFromEvent = (e) => {
      const rect = track.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const audio = this.audioEngine.audioElement;
      if (audio && audio.duration && isFinite(audio.duration)) {
        this.audioEngine.seek(pct * audio.duration);
      }
    };

    track.addEventListener('mousedown', (e) => {
      isDragging = true;
      seekFromEvent(e);
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) seekFromEvent(e);
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    track.addEventListener('touchstart', (e) => {
      isDragging = true;
      seekFromEvent(e);
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (isDragging) seekFromEvent(e);
    }, { passive: true });

    document.addEventListener('touchend', () => {
      isDragging = false;
    });
  }

  updateProfileInjection() {
    const summary = this.userProfile.getProfileSummary();
    this.ollama.setProfile(summary);
  }

  async refillAiQueue() {
    if (this.isRefilling) return;
    const aiLen = this.queueManager.getAiQueue().length;
    if (aiLen >= 3) return;
    if (this.lastAiQueries.length === 0) return;
    if (this.isProcessingQuery) return;

    this.isRefilling = true;
    const needed = 3 - aiLen;
    const queries = this.lastAiQueries.slice(0, needed);
    const tracks = await this.musicSource.searchMultiple(queries);
    if (tracks.length > 0) {
      this.queueManager.addToAiQueue(tracks);
    }
    this.isRefilling = false;
  }

  async handleUserMessage() {
    const text = this.dom.chatInput.value.trim();
    if (!text || this.isProcessingQuery) return;

    this.dom.chatInput.value = '';
    this.addMessage(text, 'user');
    this.isProcessingQuery = true;
    this.dom.chatSend.disabled = true;

    this.userProfile.recordChatQuery(text);
    this.updateProfileInjection();

    this.showTyping();

    const response = await this.ollama.sendMessage(text);
    this.hideTyping();

    this.addMessage(response.message, 'ai', response.search_queries);
    this.isProcessingQuery = false;
    this.dom.chatSend.disabled = false;
    this.dom.chatInput.focus();

    if (response.search_queries && response.search_queries.length > 0) {
      let validQueries = response.search_queries.filter(
        q => q.search_query && !q.search_query.includes('Artist -') && !q.search_query.includes('Genre -') && !q.search_query.includes('BPM')
      );

      if (this.activeFilters.length > 0) {
        const filterStr = this.activeFilters.join(' ');
        validQueries = validQueries.map(q => ({
          search_query: `${q.search_query} ${filterStr}`,
        }));
      }

      let tracks = [];
      if (validQueries.length > 0) {
        this.addMessage(`🔍 Searching for ${validQueries.length} tracks...`, 'ai');
        tracks = await this.musicSource.searchMultiple(validQueries);
      }

      if (tracks.length > 0) {
        this.lastAiQueries = validQueries;
        const primary = tracks[0];
        const suggestions = tracks.slice(1);
        this.queueManager.addToUserQueue(primary);
        if (suggestions.length > 0) this.queueManager.addToAiQueue(suggestions);
        this.addMessage(`✨ "${primary.title}" added to your requests + ${suggestions.length} AI suggestions!`, 'ai');
        if (!this.audioEngine.isPlaying && !this.queueManager.nowPlaying) {
          this.queueManager.processQueue();
        }
      } else {
        this.addMessage('😕 Could not find tracks for that. Try being more specific!', 'ai');
      }
    }
  }

  async loadAndPlayTrack(track) {
    try {
      this.updateNowPlayingUI(track);
      this.updateLikeDislikeButtons(track.videoId);
      console.log(`Loading track: "${track.title}" (${track.videoId})`);
      await this.audioEngine.loadTrack(track.videoId, () => {
        this.metadataAnalyzer.reset();
        this.metadataAnalyzer.setSampleRate(this.audioEngine.ctx.sampleRate);
        this.metadataAnalyzer.start(this.audioEngine.analyser);
        this.audioEngine.play();

        this.dom.ctrlPlayBtn.textContent = '⏸';
        this.updateProgress(0, this.audioEngine.audioElement.duration || 0);
        this.saveResumeState(0);
      });

      const meta = await this.musicSource.fetchSongMetadata(track.title, track.artist);
      if (meta) {
        if (meta.bpm) this.dom.bpmDisplay.textContent = meta.bpm;
        if (meta.key) this.dom.keyDisplay.textContent = meta.key;
        this._apiMeta = meta;
      }
    } catch (err) {
      console.error(`Failed to load track "${track.title}" (${track.videoId}):`, err.message || err);
      this.addMessage(`⚠️ Could not load "${track.title}". Skipping...`, 'ai');
      this.queueManager.skip();
    }
  }

  handleLike() {
    const track = this.queueManager.getNowPlaying();
    if (!track) return;

    this.userProfile.likeTrack(track);
    this.updateLikeDislikeButtons(track.videoId);
    this.updateProfileInjection();
    this.renderProfilePanel();
    this.addMessage(`👍 Noted — you like "${track.title}"`, 'ai');
  }

  handleDislike() {
    const track = this.queueManager.getNowPlaying();
    if (!track) return;

    this.userProfile.dislikeTrack(track);
    this.updateLikeDislikeButtons(track.videoId);
    this.updateProfileInjection();
    this.renderProfilePanel();
    this.addMessage(`👎 Got it — "${track.title}" isn't your thing`, 'ai');
  }

  updateLikeDislikeButtons(videoId) {
    this.dom.likeBtn.classList.toggle('active-like', this.userProfile.isLiked(videoId));
    this.dom.dislikeBtn.classList.toggle('active-dislike', this.userProfile.isDisliked(videoId));
  }

  toggleProfile() {
    this.isProfileVisible = !this.isProfileVisible;
    this.dom.profilePanel.classList.toggle('visible', this.isProfileVisible);
    this.dom.ctrlQueueBtn.classList.toggle('active', this.isProfileVisible);
    if (this.isProfileVisible) this.renderProfilePanel();
  }

  closeProfile() {
    this.isProfileVisible = false;
    this.dom.profilePanel.classList.remove('visible');
  }

  renderProfilePanel() {
    const stats = this.userProfile.getProfileStats();

    document.getElementById('ps-tracks').textContent = stats.totalTracksPlayed;
    document.getElementById('ps-hours').textContent = Math.round(stats.totalPlayTime / 3600) + 'h';
    document.getElementById('ps-completion').textContent = Math.round(stats.completionRate * 100) + '%';
    document.getElementById('ps-likes').textContent = stats.likedCount;

    const genreList = document.getElementById('profile-genre-list');
    if (stats.topGenres.length > 0) {
      const maxScore = Math.max(...stats.topGenres.map(g => g.score));
      genreList.innerHTML = stats.topGenres.map(g => `
        <span class="profile-tag">
          ${g.genre}
          <span class="tag-bar"><span class="tag-bar-fill" style="width:${(g.score / maxScore) * 100}%"></span></span>
          <span class="tag-strength">${Math.round(g.score * 10) / 10}</span>
        </span>
      `).join('');
    } else {
      genreList.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">Listen to more tracks to build genre preferences</span>';
    }

    const artistList = document.getElementById('profile-artist-list');
    if (stats.topArtists.length > 0) {
      artistList.innerHTML = stats.topArtists.map(a => `
        <span class="profile-tag">${a.artist} <span class="tag-strength">${Math.round(a.score * 10) / 10}</span></span>
      `).join('');
    } else {
      artistList.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">No artist data yet</span>';
    }

    const prefsContent = document.getElementById('profile-prefs-content');
    const prefs = [];
    if (stats.bpmRange) {
      prefs.push(`<div class="pref-item"><span class="pref-label">BPM Range</span><span class="pref-value">${stats.bpmRange.min}-${stats.bpmRange.max} (avg ${stats.bpmRange.avg})</span></div>`);
    }
    if (stats.preferredKeys.length > 0) {
      prefs.push(`<div class="pref-item"><span class="pref-label">Preferred Keys</span><span class="pref-value">${stats.preferredKeys.map(k => k.key).join(', ')}</span></div>`);
    }
    if (stats.totalTracksPlayed > 0) {
      prefs.push(`<div class="pref-item"><span class="pref-label">Skip Rate</span><span class="pref-value">${Math.round(stats.skipRate * 100)}%</span></div>`);
    }

    prefsContent.innerHTML = prefs.length > 0
      ? `<div class="pref-row">${prefs.join('')}</div>`
      : '<span>Not enough data yet — keep listening!</span>';
  }

  togglePlay() {
    if (!this.queueManager.nowPlaying && this.queueManager.hasTracksQueued()) {
      this.queueManager.processQueue();
      return;
    }

    const wasPlaying = this.audioEngine.isPlaying;
    this.audioEngine.togglePlay();
    this.dom.ctrlPlayBtn.textContent = this.audioEngine.isPlaying ? '⏸' : '▶';
    if (wasPlaying) {
      this.saveResumeState(this.audioEngine.audioElement?.currentTime || 0);
    }

    if (this.audioEngine.isPlaying) {
      this.metadataAnalyzer.start(this.audioEngine.analyser);
    } else {
      this.metadataAnalyzer.stop();
    }
  }

  skipTrack() {
    this.saveResumeState(0);
    this.audioEngine.stop();
    this.metadataAnalyzer.stop();
    this.closeProfile();
    this.setIdleState();
    this.queueManager.skip();
  }

  previousTrack() {
    const history = this.queueManager.getHistory();
    if (history.length === 0) return;
    this.saveResumeState(0);
    this.audioEngine.stop();
    this.metadataAnalyzer.stop();
    this.closeProfile();
    this.setIdleState();
    this.queueManager.previous();
  }

  updateNowPlayingUI(track) {
    this.dom.albumArt.src = track.thumbnail || '';
    this.dom.npTitle.textContent = track.title || 'Unknown Track';
    this.dom.npArtist.textContent = track.artist || '';
    this.dom.ctrlAlbumArt.src = track.thumbnail || '';
    this.dom.ctrlTitle.textContent = track.title || 'No track';
    this.dom.ctrlArtist.textContent = track.artist || '';
    this.dom.ctrlLikeBtn.classList.toggle('liked', this.userProfile.isLiked(track.videoId));
  }

  updateProgress(current, duration) {
    const pct = duration > 0 ? (current / duration) * 100 : 0;
    this.dom.ctrlProgressFill.style.width = `${pct}%`;
    this.dom.ctrlProgressThumb.style.left = `${pct}%`;
    this.dom.ctrlTimeCurrent.textContent = this.formatTime(current);
    this.dom.ctrlTimeTotal.textContent = this.formatTime(duration);

    if (!this._apiMeta) {
      const bpm = this.metadataAnalyzer.getBPM();
      const key = this.metadataAnalyzer.getKey();
      if (bpm > 0) this.dom.bpmDisplay.textContent = bpm;
      this.dom.keyDisplay.textContent = key;
    }
  }

  formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  renderQueue(state) {
    if (!state) return;

    const { nowPlaying, userQueue, aiQueue } = state;

    if (nowPlaying) {
      this.dom.nowPlayingTrack.innerHTML = `
        <div class="now-playing-item">
          <img src="${nowPlaying.thumbnail || ''}" alt="" onerror="this.style.display='none'" />
          <div class="np-info">
            <div class="np-title">${nowPlaying.title || 'Unknown'}</div>
            <div class="np-artist">${nowPlaying.artist || ''}</div>
          </div>
        </div>
      `;
      this.updateLikeDislikeButtons(nowPlaying.videoId);
    } else {
      this.dom.nowPlayingTrack.innerHTML = `<span class="queue-empty">Nothing playing</span>`;
      this.dom.likeBtn.classList.remove('active-like');
      this.dom.dislikeBtn.classList.remove('active-dislike');
    }

    this.renderDraggableList(this.dom.userQueueList, userQueue, 'user');
    this.renderDraggableList(this.dom.aiQueueList, aiQueue, 'ai');
  }

  renderDraggableList(listEl, items, type) {
    const move = type === 'user' ? 'moveInUserQueue' : 'moveInAiQueue';
    const remove = type === 'user' ? 'removeFromUserQueue' : 'removeFromAiQueue';

    listEl.innerHTML = items.map((t, i) => `
      <li class="queue-item" draggable="true" data-index="${i}">
        <span class="qi-drag">⠿</span>
        <img src="${t.thumbnail || ''}" alt="" onerror="this.style.display='none'" />
        <div class="qi-info">
          <div class="qi-title">${t.title || 'Unknown'}</div>
          <div class="qi-artist">${t.artist || ''}</div>
        </div>
        <span class="qi-duration">${t.duration || ''}</span>
        <button class="qi-remove" data-videoid="${t.videoId}">✕</button>
      </li>
    `).join('') || `<li class="queue-empty" style="padding:4px 0;">${type === 'user' ? 'No requests yet' : 'AI queue empty — ask the DJ for music!'}</li>`;

    listEl.querySelectorAll('.qi-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.queueManager[remove](btn.dataset.videoid);
      });
    });

    let dragIndex = null;
    listEl.querySelectorAll('.queue-item[draggable]').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        dragIndex = parseInt(item.dataset.index);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        const overIndex = parseInt(item.dataset.index);
        if (overIndex !== dragIndex) {
          item.classList.add('drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const toIndex = parseInt(item.dataset.index);
        if (dragIndex !== null && dragIndex !== toIndex) {
          this.queueManager[move](dragIndex, toIndex);
        }
        dragIndex = null;
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        listEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        dragIndex = null;
      });
    });
  }

  setIdleState() {
    this.dom.ctrlPlayBtn.textContent = '▶';
    this.dom.bpmDisplay.textContent = '--';
    this.dom.keyDisplay.textContent = '--';
    this.dom.ctrlProgressFill.style.width = '0%';
    this.dom.ctrlTimeCurrent.textContent = '0:00';
    this.dom.ctrlTimeTotal.textContent = '0:00';
    this.dom.likeBtn.classList.remove('active-like');
    this.dom.dislikeBtn.classList.remove('active-dislike');
    this.metadataAnalyzer.stop();
  }

  addMessage(text, type, searchQueries) {
    const div = document.createElement('div');
    div.className = `msg msg-${type}`;

    const avatar = document.createElement('span');
    avatar.className = 'msg-avatar';
    avatar.textContent = type === 'ai' ? '🎧' : '👤';

    const content = document.createElement('div');
    content.className = 'msg-content';

    const name = document.createElement('span');
    name.className = 'msg-name';
    name.textContent = type === 'ai' ? 'AI Mix Master' : 'You';
    content.appendChild(name);

    const p = document.createElement('p');
    if (type === 'ai') {
      p.innerHTML = renderMarkdown(text);
    } else {
      p.textContent = text;
    }
    content.appendChild(p);

    if (searchQueries && searchQueries.length > 0) {
      searchQueries.forEach(sq => {
        const songDiv = document.createElement('div');
        songDiv.className = 'song-result';
        songDiv.textContent = `🔍 ${sq.search_query || sq}`;
        content.appendChild(songDiv);
      });
    }

    div.appendChild(avatar);
    div.appendChild(content);
    this.dom.chatMessages.appendChild(div);
    this.dom.chatMessages.scrollTop = this.dom.chatMessages.scrollHeight;
  }

  showTyping() {
    const div = document.createElement('div');
    div.className = 'msg msg-ai';
    div.id = 'typing-indicator';
    div.innerHTML = `
      <span class="msg-avatar">🎧</span>
      <div class="msg-content">
        <span class="msg-name">AI Mix Master</span>
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    this.dom.chatMessages.appendChild(div);
    this.dom.chatMessages.scrollTop = this.dom.chatMessages.scrollHeight;
  }

  hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
