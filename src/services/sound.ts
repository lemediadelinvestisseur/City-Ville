import type { KeyValueStorage } from '@/core/save';

export type SoundName =
  'click' | 'coin' | 'harvest' | 'plant' | 'hammer' | 'supply' | 'place' | 'complete' | 'quest' | 'levelUp' | 'error';

const MUTE_KEY = 'city-ville:muted';

/**
 * Bruitages synthétisés en direct (Web Audio) : aucun fichier audio à charger.
 * Le contexte audio n'est créé qu'après un premier geste de l'utilisateur.
 */
export class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted: boolean;

  constructor(private readonly storage: KeyValueStorage) {
    this.muted = storage.getItem(MUTE_KEY) === '1';
    const unlock = () => {
      this.ensureContext();
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      this.storage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Préférence non persistée : sans gravité.
    }
  }

  private ensureContext(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const length = Math.floor(this.ctx.sampleRate * 0.3);
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  private tone(
    freq: number,
    at: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    slideTo?: number,
  ): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private burst(at: number, duration: number, volume: number, filterFreq: number): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  play(name: SoundName): void {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'click':
        this.tone(900, 0, 0.04, 'sine', 0.08);
        break;
      case 'coin':
        this.tone(988, 0, 0.07, 'square', 0.07);
        this.tone(1319, 0.065, 0.16, 'square', 0.07);
        break;
      case 'harvest':
        this.tone(523, 0, 0.09, 'triangle', 0.18);
        this.tone(784, 0.07, 0.14, 'triangle', 0.16);
        this.burst(0, 0.08, 0.12, 3000);
        break;
      case 'plant':
        this.tone(330, 0, 0.1, 'sine', 0.18, 495);
        break;
      case 'hammer':
        this.burst(0, 0.06, 0.4, 1800);
        this.tone(150, 0, 0.09, 'triangle', 0.25, 90);
        break;
      case 'supply':
        this.burst(0, 0.18, 0.18, 900);
        this.tone(392, 0.05, 0.12, 'triangle', 0.12, 523);
        break;
      case 'place':
        this.tone(440, 0, 0.12, 'triangle', 0.16, 660);
        this.burst(0.02, 0.1, 0.12, 600);
        break;
      case 'complete':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.07, 0.18, 'triangle', 0.16));
        break;
      case 'quest':
        this.tone(784, 0, 0.14, 'sine', 0.18);
        this.tone(1175, 0.12, 0.3, 'sine', 0.16);
        break;
      case 'levelUp':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.09, 0.24, 'square', 0.06));
        [1568, 2093].forEach((f, i) => this.tone(f, 0.5 + i * 0.08, 0.3, 'sine', 0.08));
        break;
      case 'error':
        this.tone(240, 0, 0.16, 'sawtooth', 0.06, 160);
        break;
    }
  }
}
