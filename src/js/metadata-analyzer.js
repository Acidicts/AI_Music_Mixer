class MetadataAnalyzer {
  constructor() {
    this.sampleRate = 44100;
    this.bpm = 0;
    this.key = '--';
    this.energyBuffer = [];
    this.bpmValues = [];
    this.chroma = new Array(12).fill(0);
    this.isActive = false;
    this.analysisInterval = null;
    this.bpmConfidence = 0;

    this.keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    this.keyProfiles = {};
    for (let i = 0; i < 12; i++) {
      const shift = (12 - i) % 12;
      this.keyProfiles[this.keyNames[i]] = [...majorProfile.slice(shift), ...majorProfile.slice(0, shift)];
      this.keyProfiles[this.keyNames[i] + 'm'] = [...minorProfile.slice(shift), ...minorProfile.slice(0, shift)];
    }
  }

  setSampleRate(rate) {
    this.sampleRate = rate;
  }

  start(analyser) {
    this.isActive = true;
    this.analysisInterval = setInterval(() => this.analyze(analyser), 80);
  }

  stop() {
    this.isActive = false;
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  analyze(analyser) {
    if (!analyser) return;

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    this.detectBPM(freqData, timeData);
    this.detectKey(freqData, analyser.frequencyBinCount);
  }

  detectBPM(freqData, timeData) {
    let lowEnergy = 0;
    let totalEnergy = 0;
    const len = timeData.length;

    for (let i = 0; i < len; i++) {
      const val = Math.abs(timeData[i] - 128);
      totalEnergy += val;
      if (i < len * 0.3) lowEnergy += val;
    }

    for (let i = 0; i < 30; i++) {
      lowEnergy += freqData[i];
    }

    const avgEnergy = totalEnergy / len;
    this.energyBuffer.push({ time: performance.now(), value: avgEnergy, low: lowEnergy });
    if (this.energyBuffer.length > 300) this.energyBuffer.shift();

    if (this.energyBuffer.length < 60) return;

    const sampleMs = this.energyBuffer[this.energyBuffer.length - 1].time -
                     this.energyBuffer[0].time;
    if (sampleMs < 3000) return;

    const values = this.energyBuffer.map(e => e.low);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const normalized = values.map(v => v - mean);

    const minBpm = 60;
    const maxBpm = 180;
    const minLag = Math.floor((60000 / maxBpm) / 80);
    const maxLag = Math.ceil((60000 / minBpm) / 80);

    let bestLag = 0;
    let bestCorr = -Infinity;

    for (let lag = minLag; lag <= maxLag && lag < normalized.length / 2; lag++) {
      let corr = 0;
      let count = 0;
      for (let i = 0; i < normalized.length - lag; i++) {
        corr += normalized[i] * normalized[i + lag];
        count++;
      }
      corr = count > 0 ? corr / count : 0;

      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    if (bestLag > 0 && bestCorr > 1) {
      const rawBpm = 60000 / (bestLag * 80);
      const confidence = Math.min(1, bestCorr / 10);

      if (rawBpm >= minBpm && rawBpm <= maxBpm) {
        this.bpmValues.push({ bpm: rawBpm, confidence });
        if (this.bpmValues.length > 20) this.bpmValues.shift();

        const weightedSum = this.bpmValues.reduce((s, v) => s + v.bpm * v.confidence, 0);
        const totalConfidence = this.bpmValues.reduce((s, v) => s + v.confidence, 0);

        if (totalConfidence > 0) {
          const avgBpm = weightedSum / totalConfidence;
          this.bpm = Math.round(avgBpm);
          this.bpmConfidence = totalConfidence / this.bpmValues.length;
        }
      }
    }
  }

  detectKey(freqData, binCount) {
    const newChroma = new Array(12).fill(0);
    const a4 = 440;
    const midiA4 = 69;
    let totalEnergy = 0;

    for (let i = 0; i < binCount; i++) {
      const freq = (i * this.sampleRate) / (2 * binCount);
      if (freq < 80 || freq > 1600) continue;
      const amplitude = freqData[i] / 255;
      totalEnergy += amplitude;

      const midiNum = 12 * (Math.log(freq / a4) / Math.log(2)) + midiA4;
      const pitchClass = ((Math.round(midiNum) % 12) + 12) % 12;

      newChroma[pitchClass] += amplitude;

      const midiHalfBelow = midiNum - 0.5;
      const pitchBelow = ((Math.round(midiHalfBelow) % 12) + 12) % 12;
      newChroma[pitchBelow] += amplitude * 0.15;

      const midiOctaveAbove = midiNum + 12;
      const pitchOctave = ((Math.round(midiOctaveAbove) % 12) + 12) % 12;
      newChroma[pitchOctave] += amplitude * 0.1;
    }

    for (let i = 0; i < 12; i++) {
      this.chroma[i] = this.chroma[i] * 0.85 + newChroma[i] * 0.15;
    }

    if (totalEnergy < 0.3) return;

    const sum = this.chroma.reduce((s, v) => s + v, 0);
    if (sum < 0.5) return;
    const normalized = this.chroma.map(v => v / sum);

    let bestKey = 'C';
    let bestCorr = -Infinity;

    for (const [keyName, profile] of Object.entries(this.keyProfiles)) {
      let correlation = 0;
      const profileSum = profile.reduce((s, v) => s + v, 0);
      const normProfile = profile.map(v => v / profileSum);

      for (let i = 0; i < 12; i++) {
        correlation += normalized[i] * normProfile[i];
      }

      if (correlation > bestCorr) {
        bestCorr = correlation;
        bestKey = keyName;
      }
    }

    this.key = bestKey;
  }

  getBPM() {
    return this.bpm;
  }

  getKey() {
    return this.key;
  }

  reset() {
    this.bpm = 0;
    this.key = '--';
    this.energyBuffer = [];
    this.bpmValues = [];
    this.chroma = new Array(12).fill(0);
    this.bpmConfidence = 0;
  }
}
