class UserProfile {
  constructor() {
    this.storageKey = 'ai-music-mixer-profile';
    this.genreKeywords = {
      'synthwave': ['synthwave', 'retrowave', 'outrun', 'darksynth', 'new retro', 'cyberpunk'],
      'electronic': ['electronic', 'edm', 'house', 'techno', 'trance', 'dubstep', 'drum and bass', 'dnb', 'idm', 'ambient', 'chillstep'],
      'rock': ['rock', 'punk', 'grunge', 'alternative', 'indie rock', 'post-rock', 'hard rock'],
      'metal': ['metal', 'heavy metal', 'thrash', 'death metal', 'black metal', 'doom', 'metalcore'],
      'pop': ['pop', 'synth-pop', 'dream pop', 'art pop', 'k-pop', 'j-pop'],
      'hip hop': ['hip hop', 'rap', 'trap', 'drill', 'boom bap', 'cloud rap'],
      'r&b': ['r&b', 'soul', 'funk', 'neo-soul', 'motown'],
      'jazz': ['jazz', 'blues', 'swing', 'bebop', 'fusion', 'smooth jazz'],
      'classical': ['classical', 'orchestral', 'symphony', 'baroque', 'romantic'],
      'lo-fi': ['lo-fi', 'lofi', 'chillhop', 'study music'],
      'indie': ['indie', 'independent', 'bedroom pop'],
      'folk': ['folk', 'country', 'americana', 'bluegrass', 'singer-songwriter'],
      'reggae': ['reggae', 'dub', 'ska', 'dancehall'],
      'latin': ['latin', 'reggaeton', 'salsa', 'bossa nova', 'samba'],
      'experimental': ['experimental', 'avant-garde', 'noise', 'drone'],
    };

    this.data = this.load();
  }

  getDefaultProfile() {
    return {
      version: 2,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      likedTracks: [],
      dislikedTracks: [],
      playHistory: [],
      genreAffinities: {},
      artistAffinities: {},
      totalPlayTime: 0,
      totalTracksPlayed: 0,
      totalSkips: 0,
      totalCompletions: 0,
      chatQueries: [],
    };
  }

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.version === 2) return data;
      }
    } catch {}
    return this.getDefaultProfile();
  }

  save() {
    this.data.lastUpdated = Date.now();
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch {}
  }

  trackPlayed(track, playDuration, totalDuration, wasSkipped, bpm, key) {
    const completionPct = totalDuration > 0 ? playDuration / totalDuration : 0;
    const completed = completionPct >= 0.8;

    this.data.playHistory.push({
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      playedAt: Date.now(),
      playDuration,
      totalDuration,
      completionPct,
      wasSkipped,
      completed,
      bpm: bpm || null,
      key: key || null,
    });

    if (this.data.playHistory.length > 500) {
      this.data.playHistory = this.data.playHistory.slice(-500);
    }

    this.data.totalTracksPlayed++;
    this.data.totalPlayTime += playDuration;

    if (wasSkipped) this.data.totalSkips++;
    if (completed) this.data.totalCompletions++;

    this.updateGenreAffinity(track, completed, wasSkipped);
    this.updateArtistAffinity(track, completed);

    this.save();
  }

  likeTrack(track) {
    if (!this.data.likedTracks.find(t => t.videoId === track.videoId)) {
      this.data.likedTracks.push({
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        likedAt: Date.now(),
      });
    }
    this.data.dislikedTracks = this.data.dislikedTracks.filter(t => t.videoId !== track.videoId);
    this.updateGenreAffinity(track, true, false, 3);
    this.updateArtistAffinity(track, true, 3);
    this.save();
  }

  dislikeTrack(track) {
    if (!this.data.dislikedTracks.find(t => t.videoId === track.videoId)) {
      this.data.dislikedTracks.push({
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        dislikedAt: Date.now(),
      });
    }
    this.data.likedTracks = this.data.likedTracks.filter(t => t.videoId !== track.videoId);
    this.updateGenreAffinity(track, false, true, 3);
    this.updateArtistAffinity(track, false, 3);
    this.save();
  }

  isLiked(videoId) {
    return this.data.likedTracks.some(t => t.videoId === videoId);
  }

  isDisliked(videoId) {
    return this.data.dislikedTracks.some(t => t.videoId === videoId);
  }

  recordChatQuery(query) {
    this.data.chatQueries.push({ query, timestamp: Date.now() });
    if (this.data.chatQueries.length > 100) {
      this.data.chatQueries = this.data.chatQueries.slice(-100);
    }
    this.extractPreferencesFromQuery(query);
    this.save();
  }

  extractPreferencesFromQuery(query) {
    const lower = query.toLowerCase();
    for (const [genre, keywords] of Object.entries(this.genreKeywords)) {
      if (keywords.some(k => lower.includes(k))) {
        this.data.genreAffinities[genre] = (this.data.genreAffinities[genre] || 0) + 1;
      }
    }
  }

  detectGenre(title, artist) {
    const text = `${title} ${artist}`.toLowerCase();
    const scores = {};

    for (const [genre, keywords] of Object.entries(this.genreKeywords)) {
      for (const kw of keywords) {
        if (text.includes(kw)) {
          scores[genre] = (scores[genre] || 0) + 1;
        }
      }
    }

    if (Object.keys(scores).length === 0) return 'unknown';
    return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  }

  updateGenreAffinity(track, positive, negative, weight = 1) {
    const genre = this.detectGenre(track.title, track.artist);
    if (genre === 'unknown') return;

    const current = this.data.genreAffinities[genre] || 0;
    const delta = positive ? weight : (negative ? -weight : 0.5);
    this.data.genreAffinities[genre] = Math.max(-10, Math.min(10, current + delta));
  }

  updateArtistAffinity(track, positive, weight = 1) {
    const artist = track.artist || 'Unknown';
    const current = this.data.artistAffinities[artist] || 0;
    const delta = positive ? weight : -weight;
    this.data.artistAffinities[artist] = current + delta;
  }

  getTopGenres(count = 5) {
    return Object.entries(this.data.genreAffinities)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, score]) => score > 0)
      .slice(0, count)
      .map(([genre, score]) => ({ genre, score }));
  }

  getTopArtists(count = 5) {
    return Object.entries(this.data.artistAffinities)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, score]) => score > 0)
      .slice(0, count)
      .map(([artist, score]) => ({ artist, score }));
  }

  getPreferredBpmRange() {
    const bpms = this.data.playHistory
      .filter(h => h.bpm && h.completed)
      .map(h => h.bpm);

    if (bpms.length < 3) return null;
    const sorted = [...bpms].sort((a, b) => a - b);
    return {
      min: sorted[Math.floor(sorted.length * 0.2)],
      max: sorted[Math.floor(sorted.length * 0.8)],
      avg: Math.round(bpms.reduce((s, b) => s + b, 0) / bpms.length),
    };
  }

  getPreferredKeys() {
    const keyCounts = {};
    this.data.playHistory
      .filter(h => h.key && h.key !== '--' && h.completed)
      .forEach(h => {
        keyCounts[h.key] = (keyCounts[h.key] || 0) + 1;
      });

    return Object.entries(keyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, count]) => ({ key, count }));
  }

  getSkipRate() {
    if (this.data.totalTracksPlayed === 0) return 0;
    return this.data.totalSkips / this.data.totalTracksPlayed;
  }

  getCompletionRate() {
    if (this.data.totalTracksPlayed === 0) return 0;
    return this.data.totalCompletions / this.data.totalTracksPlayed;
  }

  getProfileSummary() {
    const parts = [];
    const topGenres = this.getTopGenres(3);

    if (topGenres.length > 0) {
      const genreStr = topGenres.map(g => {
        const strength = g.score > 5 ? 'strongly' : g.score > 2 ? 'moderately' : 'slightly';
        return `${g.genre} (${strength})`;
      }).join(', ');
      parts.push(`Genres: ${genreStr}`);
    }

    const topArtists = this.getTopArtists(3);
    if (topArtists.length > 0) {
      parts.push(`Artists: ${topArtists.map(a => a.artist).join(', ')}`);
    }

    const bpmRange = this.getPreferredBpmRange();
    if (bpmRange) {
      parts.push(`BPM range: ~${bpmRange.min}-${bpmRange.max}`);
    }

    const keys = this.getPreferredKeys();
    if (keys.length > 0) {
      parts.push(`Common keys: ${keys.map(k => k.key).join(', ')}`);
    }

    const liked = this.data.likedTracks.length;
    const disliked = this.data.dislikedTracks.length;
    if (liked > 0 || disliked > 0) {
      parts.push(`Feedback: ${liked} likes, ${disliked} dislikes`);
    }

    const played = this.data.totalTracksPlayed;
    if (played > 0) {
      const hrs = Math.round(this.data.totalPlayTime / 3600);
      parts.push(`Played ${played} tracks (${hrs}h total)`);
    }

    if (parts.length === 0) return null;

    return 'USER MUSIC PROFILE (use this to personalize recommendations):\n' +
      parts.map(p => `- ${p}`).join('\n');
  }

  getProfileStats() {
    return {
      totalTracksPlayed: this.data.totalTracksPlayed,
      totalPlayTime: this.data.totalPlayTime,
      totalSkips: this.data.totalSkips,
      totalCompletions: this.data.totalCompletions,
      skipRate: this.getSkipRate(),
      completionRate: this.getCompletionRate(),
      likedCount: this.data.likedTracks.length,
      dislikedCount: this.data.dislikedTracks.length,
      topGenres: this.getTopGenres(5),
      topArtists: this.getTopArtists(5),
      bpmRange: this.getPreferredBpmRange(),
      preferredKeys: this.getPreferredKeys(),
      recentTracks: this.data.playHistory.slice(-10).reverse(),
    };
  }

  clearHistory() {
    this.data = this.getDefaultProfile();
    this.save();
  }
}
