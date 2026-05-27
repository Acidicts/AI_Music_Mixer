class QueueManager {
  constructor() {
    this.userQueue = [];
    this.aiQueue = [];
    this.history = [];
    this.nowPlaying = null;
    this.trackStartTime = 0;

    this.onTrackChange = null;
    this.onQueueChange = null;
    this.onTrackSkip = null;
    this.isProcessing = false;
  }

  addToUserQueue(track) {
    this.userQueue.push({ ...track, _source: 'user' });
    this.notifyQueueChange();
    this.processQueue();
  }

  addToAiQueue(tracks) {
    const maxAi = 20;
    const toAdd = tracks.slice(0, maxAi).map(t => ({ ...t, _source: 'ai' }));
    this.aiQueue.push(...toAdd);
    if (this.aiQueue.length > maxAi) {
      this.aiQueue = this.aiQueue.slice(-maxAi);
    }
    this.notifyQueueChange();
  }

  setAiQueue(tracks) {
    const maxAi = 20;
    this.aiQueue = tracks.slice(0, maxAi).map(t => ({ ...t, _source: 'ai' }));
    this.notifyQueueChange();
  }

  removeFromUserQueue(videoId) {
    this.userQueue = this.userQueue.filter(t => t.videoId !== videoId);
    this.notifyQueueChange();
  }

  removeFromAiQueue(videoId) {
    this.aiQueue = this.aiQueue.filter(t => t.videoId !== videoId);
    this.notifyQueueChange();
  }

  moveInUserQueue(from, to) {
    if (from < 0 || from >= this.userQueue.length || to < 0 || to >= this.userQueue.length) return;
    const [item] = this.userQueue.splice(from, 1);
    this.userQueue.splice(to, 0, item);
    this.notifyQueueChange();
  }

  moveInAiQueue(from, to) {
    if (from < 0 || from >= this.aiQueue.length || to < 0 || to >= this.aiQueue.length) return;
    const [item] = this.aiQueue.splice(from, 1);
    this.aiQueue.splice(to, 0, item);
    this.notifyQueueChange();
  }

  getNextTrack() {
    if (this.userQueue.length > 0) {
      return this.userQueue.shift();
    }
    if (this.aiQueue.length > 0) {
      return this.aiQueue.shift();
    }
    return null;
  }

  hasTracksQueued() {
    return this.userQueue.length > 0 || this.aiQueue.length > 0;
  }

  async processQueue() {
    if (this.isProcessing) return;
    if (this.nowPlaying) return;

    this.isProcessing = true;
    const next = this.getNextTrack();
    if (next) {
      this.nowPlaying = next;
      this.trackStartTime = Date.now();
      if (this.onTrackChange) this.onTrackChange(next);
    } else {
      this.nowPlaying = null;
      if (this.onTrackChange) this.onTrackChange(null);
    }
    this.isProcessing = false;
    this.notifyQueueChange();
  }

  onTrackEnded() {
    if (this.nowPlaying) {
      this.addToHistory(this.nowPlaying);
      if (this.onTrackSkip) this.onTrackSkip(this.nowPlaying, false);
    }
    this.nowPlaying = null;
    this.notifyQueueChange();
    this.processQueue();
  }

  skip() {
    if (this.nowPlaying) {
      this.addToHistory(this.nowPlaying);
      if (this.onTrackSkip) this.onTrackSkip(this.nowPlaying, true);
    }
    this.nowPlaying = null;
    this.notifyQueueChange();
    this.processQueue();
  }

  previous() {
    if (this.history.length === 0) return;

    if (this.nowPlaying) {
      const source = this.nowPlaying._source;
      if (source === 'user') {
        this.userQueue.unshift(this.nowPlaying);
      } else {
        this.aiQueue.unshift(this.nowPlaying);
      }
    }

    const prev = this.history.pop();
    this.nowPlaying = prev;
    this.trackStartTime = Date.now();
    if (this.onTrackChange) this.onTrackChange(prev);
    this.notifyQueueChange();
  }

  addToHistory(track) {
    this.history.push({ ...track });
    if (this.history.length > 10) this.history.shift();
  }

  getNowPlaying() {
    return this.nowPlaying;
  }

  getUserQueue() {
    return this.userQueue;
  }

  getAiQueue() {
    return this.aiQueue;
  }

  getHistory() {
    return this.history;
  }

  notifyQueueChange() {
    if (this.onQueueChange) {
      this.onQueueChange({
        nowPlaying: this.nowPlaying,
        userQueue: this.getUserQueue(),
        aiQueue: this.getAiQueue(),
        history: this.getHistory(),
      });
    }
  }

  isEmpty() {
    return !this.nowPlaying && this.userQueue.length === 0 && this.aiQueue.length === 0;
  }
}
