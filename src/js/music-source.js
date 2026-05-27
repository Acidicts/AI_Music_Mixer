class MusicSource {
  constructor() {
    this.cache = new Map();
  }

  async search(query) {
    const cacheKey = `search:${query.toLowerCase()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const results = await window.electronAPI.searchMusic(query);
      this.cache.set(cacheKey, results);
      setTimeout(() => this.cache.delete(cacheKey), 60000);
      return results;
    } catch (err) {
      console.error('Search error:', err);
      return [];
    }
  }

  async getTrackInfo(videoId) {
    const cacheKey = `info:${videoId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const info = await window.electronAPI.getTrackInfo(videoId);
      if (info) {
        this.cache.set(cacheKey, info);
      }
      return info;
    } catch (err) {
      console.error('Track info error:', err);
      return null;
    }
  }

  async searchAndPickFirst(query) {
    const results = await this.search(query);
    if (results && results.length > 0) {
      const first = results[0];
      const info = await this.getTrackInfo(first.videoId);
      return info || first;
    }
    return null;
  }

  async searchMultiple(queries) {
    const results = [];
    for (const q of queries) {
      const searchStr = typeof q === 'string' ? q : q.search_query;
      if (!searchStr) continue;
      const track = await this.searchAndPickFirst(searchStr);
      if (track) {
        results.push(track);
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return results;
  }

  async fetchSongMetadata(title, artist) {
    if (!window.electronAPI?.fetchSongMetadata) return null;
    const cacheKey = `meta:${title}|${artist}`.toLowerCase();
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    try {
      const result = await window.electronAPI.fetchSongMetadata(title, artist);
      if (result) {
        this.cache.set(cacheKey, result);
        setTimeout(() => this.cache.delete(cacheKey), 300000);
      }
      return result;
    } catch {
      return null;
    }
  }

  isAvailable() {
    return typeof window.electronAPI !== 'undefined';
  }
}
