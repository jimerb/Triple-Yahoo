// Isolated trial audio: explicit readiness is needed before the room moves sound.
export class TrialSound {
  constructor() { this.context = null; this.buffer = null; this.muted = false; this.active = new Set(); }
  async ready() {
    try {
      this.context ||= new (window.AudioContext || window.webkitAudioContext)();
      await Promise.race([this.context.resume(), new Promise(resolve => setTimeout(resolve, 800))]);
      if (this.context.state !== 'running') return false;
      if (!this.loading) this.loading = fetch('/sounds/dice-on-felt.wav').then(r => r.arrayBuffer()).then(b => this.context.decodeAudioData(b)).then(b => { this.buffer = b; }).catch(() => {});
      return true;
    } catch { return false; }
  }
  stop() { for (const s of this.active) { try { s.stop(); } catch {} } this.active.clear(); }
  setMuted(value) { this.muted = value; if (value) this.stop(); }
  play(cue) {
    if (this.muted || this.context?.state !== 'running') return;
    this.stop();
    const ctx = this.context;
    if (cue.type === 'roll' && this.buffer) {
      const source = ctx.createBufferSource(); source.buffer = this.buffer;
      const gain = ctx.createGain(); gain.gain.value = 0.28; source.connect(gain); gain.connect(ctx.destination);
      this.active.add(source); source.onended = () => { this.active.delete(source); gain.disconnect(); };
      source.start(0, 0.15, 1.9); return;
    }
    const source = ctx.createOscillator(), gain = ctx.createGain();
    source.frequency.value = cue.type === 'roll' ? 160 : cue.points === 0 ? 220 : 660;
    gain.gain.setValueAtTime(0.08, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    source.connect(gain); gain.connect(ctx.destination); this.active.add(source);
    source.onended = () => { this.active.delete(source); gain.disconnect(); }; source.start(); source.stop(ctx.currentTime + 0.16);
  }
}
