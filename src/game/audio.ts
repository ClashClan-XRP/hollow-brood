export class GameAudio {
  ctx: AudioContext | null = null;
  muted = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  bite() {
    this.tone(180, 0.09, "square", 0.07, -80);
  }
  wrap() {
    this.tone(420, 0.16, "triangle", 0.05, 220);
  }
  hit() {
    this.tone(140, 0.08, "sawtooth", 0.05, -90);
  }
  sting() {
    this.tone(90, 0.14, "square", 0.08, -40);
  }
  web() {
    this.tone(640, 0.2, "sine", 0.04, -300);
  }
  deposit() {
    this.tone(520, 0.18, "triangle", 0.06, 80);
  }
  hatch() {
    this.tone(300, 0.22, "sine", 0.05, 160);
  }
  lose() {
    this.tone(110, 0.5, "sawtooth", 0.07, -70);
  }
  wave() {
    this.tone(240, 0.28, "triangle", 0.05, 180);
  }
}
