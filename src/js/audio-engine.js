class AudioEngine {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.audioElement = null;
    this.isPlaying = false;
    this.currentTrackId = null;
    this.quality = 'medium';
    this.onTimeUpdate = null;
    this.onEnded = null;
    this.onLoad = null;

    this.bassFilter = null;
    this.trebleFilter = null;
    this.reverbWet = null;
    this.analyser = null;
    this.convolver = null;

    this.init();
  }

  setQuality(q) {
    this.quality = q;
  }

  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.buildChain();
  }

  buildChain() {
    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = 'lowshelf';
    this.bassFilter.frequency.value = 80;
    this.bassFilter.gain.value = 0;

    this.trebleFilter = this.ctx.createBiquadFilter();
    this.trebleFilter.type = 'highshelf';
    this.trebleFilter.frequency.value = 10000;
    this.trebleFilter.gain.value = 0;

    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.generateReverbIR(2.0, 3.0);

    this.reverbWet = this.ctx.createGain();
    this.reverbWet.gain.value = 0.15;

    const reverbDry = this.ctx.createGain();
    reverbDry.gain.value = 0.85;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.bassFilter.connect(this.trebleFilter);
    this.trebleFilter.connect(this.convolver);
    this.trebleFilter.connect(reverbDry);

    this.convolver.connect(this.reverbWet);

    this.reverbWet.connect(this.analyser);
    reverbDry.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  generateReverbIR(duration, decay) {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  async loadTrack(videoId, onCanPlay) {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.currentTrackId = videoId;
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = 'anonymous';
    this.audioElement.preload = 'auto';
    this.audioElement.src = `yt-audio://${videoId}?quality=${this.quality}`;

    return new Promise((resolve, reject) => {
      const handleCanPlay = () => {
        this.audioElement.removeEventListener('canplay', handleCanPlay);
        this.connectSource();
        if (onCanPlay) onCanPlay();
        resolve();
      };

    const handleError = (e) => {
      this.audioElement.removeEventListener('error', handleError);
      const errorDetail = this.audioElement.error ? `${this.audioElement.error.code}: ${this.audioElement.error.message}` : 'unknown error';
      console.error('Audio load error:', errorDetail, e?.message || '');
      reject(new Error(`Failed to load audio (${errorDetail})`));
    };

      this.audioElement.addEventListener('canplay', handleCanPlay);
      this.audioElement.addEventListener('error', handleError);
      this.audioElement.load();
    });
  }

  connectSource() {
    if (this.source) {
      this.source.disconnect();
    }
    this.source = this.ctx.createMediaElementSource(this.audioElement);
    this.source.connect(this.bassFilter);

    this.audioElement.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate) this.onTimeUpdate(this.audioElement.currentTime, this.audioElement.duration);
    });

    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      if (this.onEnded) this.onEnded();
    });
  }

  play() {
    if (this.audioElement && this.currentTrackId) {
      this.audioElement.play().catch(console.error);
      this.isPlaying = true;
    }
  }

  pause() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.isPlaying = false;
    }
  }

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  stop() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;
    this.currentTrackId = null;
  }

  seek(time) {
    if (this.audioElement) {
      this.audioElement.currentTime = time;
    }
  }

  setVolume(val) {
    if (this.audioElement) {
      this.audioElement.volume = Math.max(0, Math.min(1, val));
    }
  }

  setBass(gainDb) {
    if (this.bassFilter) {
      this.bassFilter.gain.value = gainDb;
    }
  }

  setTreble(gainDb) {
    if (this.trebleFilter) {
      this.trebleFilter.gain.value = gainDb;
    }
  }

  setReverb(wetPercent) {
    if (this.reverbWet) {
      const wet = wetPercent / 100;
      this.reverbWet.gain.value = wet * 0.7;
    }
  }

  getAnalyserData() {
    if (!this.analyser) return null;
    const freqData = new Uint8Array(this.analyser.frequencyBinCount);
    const timeData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(freqData);
    this.analyser.getByteTimeDomainData(timeData);
    return { freq: freqData, time: timeData, binCount: this.analyser.frequencyBinCount, sampleRate: this.ctx.sampleRate };
  }

  destroy() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }
    if (this.source) this.source.disconnect();
    if (this.ctx) this.ctx.close();
  }
}
