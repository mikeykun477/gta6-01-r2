// Port Vireo — sound. All synthesized with WebAudio: no audio files, no
// network. Engine hum, gunshots, siren, pickups and mission stings.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOn = false;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenT = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      this.engineOsc.connect(filt);
      filt.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
    } catch (e) { this.ctx = null; }
  }

  setEngine(speedRatio) {
    if (!this.ctx || this.muted) return;
    this.engineGain.gain.value = 0.02 + speedRatio * 0.05;
    this.engineOsc.frequency.value = 50 + speedRatio * 130;
  }

  engineOff() {
    if (this.engineGain) this.engineGain.gain.value = 0;
  }

  blip(freq, dur, type = 'sine', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  }

  shot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = 0.12;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.25;
    src.connect(g); g.connect(this.ctx.destination);
    src.start(t);
    this.blip(180, 0.08, 'square', 0.08);
  }

  punch() { this.blip(120, 0.08, 'square', 0.1); }
  pickup() { this.blip(880, 0.12, 'sine', 0.12); this.blip(1320, 0.14, 'sine', 0.08); }
  coin() { this.blip(1567, 0.1, 'sine', 0.12); }
  sting() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.12), i * 110)); }
  fail() { [330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'sawtooth', 0.07), i * 130)); }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = this.muted ? 0 : 0.035;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start();
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch (e) {}
      this.sirenOsc = null;
    }
  }

  updateSiren(dt) {
    if (this.sirenOsc && !this.muted) {
      this.sirenT += dt;
      this.sirenOsc.frequency.value = Math.sin(this.sirenT * 4.2) > 0 ? 780 : 590;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.sirenGain) this.sirenGain.gain.value = m ? 0 : 0.035;
    if (!m) this.engineOff();
  }
}
