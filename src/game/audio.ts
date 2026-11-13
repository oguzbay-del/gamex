export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private bus: GainNode | null = null;
  private timer = 0;
  private step = 0;
  muted = false;

  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      const master = ctx.createGain();
      const music = ctx.createGain();
      const bus = ctx.createGain();
      master.gain.value = this.muted ? 0 : 1;
      music.gain.value = 0.045;
      bus.gain.value = 0.42;
      music.connect(master);
      bus.connect(master);
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.music = music;
      this.bus = bus;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
  }

  tick(dt: number) {
    if (!this.ctx || !this.music || this.muted) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.72;
    const scale = [196, 247, 294, 330, 370, 294, 247, 220];
    const freq = scale[this.step % scale.length]!;
    this.step += 1;
    this.tone(freq, 0.55, "sine", 0.18, freq, this.music, 0.04);
    if (this.step % 2 === 0) {
      this.tone(freq * 1.5, 0.4, "triangle", 0.05, freq * 1.5, this.music, 0.08);
    }
  }

  jump() {
    this.tone(380, 0.09, "square", 0.16, 620);
  }

  doubleJump() {
    this.tone(520, 0.1, "square", 0.16, 820);
  }

  coin() {
    this.tone(880, 0.06, "triangle", 0.18, 1320);
  }

  checkpoint() {
    this.tone(523, 0.12, "triangle", 0.16, 659);
    this.tone(784, 0.16, "sine", 0.1, 784);
  }

  die() {
    this.tone(240, 0.22, "sawtooth", 0.12, 70);
  }

  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => {
      window.setTimeout(() => this.tone(n, 0.18, "triangle", 0.16, n * 1.01), i * 90);
    });
  }

  land() {
    this.tone(140, 0.05, "sine", 0.1, 80);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo: number,
    dest?: AudioNode | null,
    attack = 0.008,
  ) {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest ?? this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }
}
