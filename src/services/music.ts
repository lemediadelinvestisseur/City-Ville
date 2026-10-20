import type { KeyValueStorage } from '@/core/save';

const MUSIC_KEY = 'city-ville:music';

/** Accords (fréquences en Hz) : progression douce le jour, plus feutrée la nuit. */
const DAY = [
  [261.63, 329.63, 392.0],
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [196.0, 246.94, 293.66],
];
const NIGHT = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [261.63, 329.63, 392.0],
  [196.0, 246.94, 293.66],
];
/** Gamme pentatonique pour la mélodie (do majeur). */
const MELODY = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

/**
 * Musique d'ambiance synthétisée (aucun fichier à charger) et sons de la
 * nature : vagues près de la mer, oiseaux près des forêts le jour, grillons
 * la nuit. Coupée quand le jeu passe en arrière-plan.
 */
export class Music {
  enabled: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private waves: GainNode | null = null;
  private timer = 0;
  private nextBar = 0;
  private bar = 0;
  private night = false;
  private forest = 0;

  constructor(private readonly storage: KeyValueStorage) {
    this.enabled = storage.getItem(MUSIC_KEY) !== '0';
    const unlock = () => {
      if (!this.enabled) return;
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.visibilityState === 'hidden') void this.ctx.suspend();
      else if (this.enabled) void this.ctx.resume();
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      this.storage.setItem(MUSIC_KEY, on ? '1' : '0');
    } catch {
      // Préférence non persistée : sans gravité.
    }
    if (on) {
      this.ensure();
      void this.ctx?.resume();
    } else if (this.ctx) void this.ctx.suspend();
  }

  /** Paysage autour de la caméra (0 à 1) et moment de la journée. */
  setAmbience(sea: number, forest: number, night: boolean): void {
    this.forest = forest;
    this.night = night;
    if (this.waves && this.ctx) this.waves.gain.setTargetAtTime(0.03 + sea * 0.09, this.ctx.currentTime, 1.5);
  }

  private ensure(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    this.startWaves();
    this.nextBar = this.ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 250);
  }

  /** Bruit filtré qui monte et descend doucement : le ressac. */
  private startWaves(): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      data[i] = last * 6;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    this.waves = ctx.createGain();
    this.waves.gain.value = 0.03;
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.12;
    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.025;
    swell.connect(swellGain).connect(this.waves.gain);
    source.connect(filter).connect(this.waves).connect(master);
    source.start();
    swell.start();
  }

  private note(freq: number, at: number, duration: number, type: OscillatorType, volume: number, attack = 0.02) {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  /** Programme les mesures à venir (une mesure ≈ 3,3 s). */
  private schedule(): void {
    const { ctx } = this;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const barSec = this.night ? 4 : 3.3;
    while (this.nextBar < ctx.currentTime + 1) {
      const at = this.nextBar;
      const chords = this.night ? NIGHT : DAY;
      const chord = chords[this.bar % chords.length] ?? DAY[0]!;
      for (const f of chord) this.note(f, at, barSec * 1.05, 'sine', 0.035, 0.6);
      this.note((chord[0] ?? 261.63) / 2, at, barSec, 'triangle', 0.05, 0.05);
      // Mélodie clairsemée, jamais deux fois la même.
      const beats = this.night ? 3 : 4;
      for (let b = 0; b < beats; b++) {
        if (Math.random() < (this.night ? 0.35 : 0.55)) {
          const f = MELODY[Math.floor(Math.random() * MELODY.length)] ?? 523.25;
          this.note(f, at + (b * barSec) / beats, 0.9, 'triangle', 0.035);
        }
      }
      this.nature(at, barSec);
      this.bar++;
      this.nextBar += barSec;
    }
  }

  /** Oiseaux le jour près des forêts, grillons la nuit. */
  private nature(at: number, span: number): void {
    if (this.night) {
      if (Math.random() < 0.6) {
        for (let i = 0; i < 6; i++) this.note(4400, at + i * 0.09, 0.04, 'square', 0.006, 0.005);
      }
      return;
    }
    if (Math.random() > 0.25 + this.forest * 0.6) return;
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const start = at + Math.random() * span;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const t = start + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2600 + Math.random() * 800, t);
      osc.frequency.exponentialRampToValueAtTime(3600 + Math.random() * 900, t + 0.07);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.02, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  dispose(): void {
    window.clearInterval(this.timer);
  }
}
