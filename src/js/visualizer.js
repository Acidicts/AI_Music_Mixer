class Visualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.animationId = null;
    this.audioEngine = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.width = rect.width;
    this.height = rect.height;
  }

  setAudioEngine(engine) {
    this.audioEngine = engine;
  }

  start() {
    this.draw();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  draw() {
    this.animationId = requestAnimationFrame(() => this.draw());

    const data = this.audioEngine?.getAnalyserData();
    if (!data) {
      this.drawIdle();
      return;
    }

    const { freq, time, binCount } = data;
    const w = this.width;
    const h = this.height;

    this.ctx.clearRect(0, 0, w, h);

    const gradient = this.ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(124, 58, 237, 0.15)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.05)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, w, h);

    const waveformH = h * 0.4;
    this.drawWaveform(time, w, waveformH, 0);
    this.drawFrequencyBars(freq, binCount, w, h * 0.6, waveformH);

    this.drawCenterDivider(w, h, waveformH);
  }

  drawIdle() {
    const w = this.width;
    const h = this.height;
    this.ctx.clearRect(0, 0, w, h);

    const gradient = this.ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(124, 58, 237, 0.08)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.03)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.strokeStyle = 'rgba(124, 58, 237, 0.15)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const y = h / 2 + Math.sin(x * 0.02 + Date.now() * 0.001) * 10;
      x === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }

  drawWaveform(timeData, w, h, offsetY) {
    const midY = offsetY + h / 2;
    const len = timeData.length;

    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(124, 58, 237, 0.8)';
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = 'rgba(124, 58, 237, 0.5)';
    this.ctx.shadowBlur = 8;

    for (let i = 0; i < len; i++) {
      const x = (i / len) * w;
      const y = midY + ((timeData[i] - 128) / 128) * (h * 0.8);
      i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  drawFrequencyBars(freqData, binCount, w, h, offsetY) {
    const barCount = Math.min(binCount, 64);
    const barW = w / barCount;
    const gap = 1;

    for (let i = 0; i < barCount; i++) {
      const value = freqData[i] / 255;
      const barH = value * h * 0.9;
      const x = i * barW + gap / 2;
      const y = offsetY + h - barH;

      const r = Math.round(80 + value * 175);
      const g = Math.round(40 + value * 100);
      const b = Math.round(180 + value * 75);

      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
      this.ctx.fillRect(x, y, barW - gap, barH);
    }
  }

  drawCenterDivider(w, h, waveformBottom) {
    this.ctx.strokeStyle = 'rgba(124, 58, 237, 0.2)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, waveformBottom);
    this.ctx.lineTo(w, waveformBottom);
    this.ctx.stroke();
  }
}
