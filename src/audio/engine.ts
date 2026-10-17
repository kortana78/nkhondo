// Procedural WebAudio: Malawian-textured music (drums, kalimba plucks,
// guitar-ish fingerpicking) + full SFX set + Chichewa voice barks.
// No audio files shipped; everything is synthesised. Intensity layer for final 60s.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let muted = false;
let musicTimer: number | null = null;
let rainNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let step = 0;
let intensity = false;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = MUSIC_BASE * musicVol;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = SFX_BASE * sfxVol;
      sfxGain.connect(master);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setValueAtTime(m ? 0 : 0.8, ctx.currentTime);
}

const MUSIC_BASE = 0.34;
const SFX_BASE = 0.9;
let musicVol = 0.8;
let sfxVol = 0.9;

/** 0..1, persisted by the store; scales the music bus. */
export function setMusicVolume(v: number) {
  musicVol = Math.min(1, Math.max(0, v));
  if (musicGain && ctx) musicGain.gain.setValueAtTime(MUSIC_BASE * musicVol, ctx.currentTime);
}
/** 0..1, persisted by the store; scales the SFX bus. */
export function setSfxVolume(v: number) {
  sfxVol = Math.min(1, Math.max(0, v));
  if (sfxGain && ctx) sfxGain.gain.setValueAtTime(SFX_BASE * sfxVol, ctx.currentTime);
}
/** apply persisted volumes (call after ensureAudio creates the graph). */
export function applyVolumes(music: number, sfx: number) {
  setMusicVolume(music);
  setSfxVolume(sfx);
}
export function setIntensity(on: boolean) { intensity = on; }

/** call once from a user gesture */
export function ensureAudio() { ac(); if (ctx && master) master.gain.value = muted ? 0 : 0.8; }

// ---- music sequencer: 8th-note steps @ 116bpm, pentatonic (C D E G A) ----
const SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
// fingerpicked guitar-ish line (original pattern)
const LEAD = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 7, 5, 4, 2, 0];
const BASS = [130.8, 130.8, 196.0, 146.8];

function drum(c: AudioContext, t: number, low: boolean, vol: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(low ? 120 : 200, t);
  o.frequency.exponentialRampToValueAtTime(low ? 45 : 90, t + 0.12);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (low ? 0.28 : 0.14));
  o.connect(g); g.connect(musicGain!);
  o.start(t); o.stop(t + 0.3);
}
function pluck(c: AudioContext, t: number, f: number, vol: number, bright: number) {
  const o = c.createOscillator();
  const o2 = c.createOscillator();
  const g = c.createGain();
  o.type = 'triangle'; o2.type = 'sine';
  o.frequency.value = f; o2.frequency.value = f * 2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  const fl = c.createBiquadFilter();
  fl.type = 'lowpass'; fl.frequency.value = bright;
  o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(musicGain!);
  o.start(t); o2.start(t); o.stop(t + 0.55); o2.stop(t + 0.55);
}
function shaker(c: AudioContext, t: number, vol: number) {
  const len = 0.06;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(musicGain!);
  s.start(t);
}

export function startMusic() {
  const c = ac();
  if (!c || musicTimer != null) return;
  const stepDur = 60 / 116 / 2; // 8ths
  let nextT = c.currentTime + 0.1;
  musicTimer = window.setInterval(() => {
    if (!ctx || !musicGain) return;
    while (nextT < ctx.currentTime + 0.35) {
      const s = step % 16;
      // drum pattern: low on 0, 6, 8, 14 (+3 when intense); slap on 2,4,10,12
      if (s === 0 || s === 6 || s === 8 || s === 14) drum(ctx, nextT, true, 0.5);
      if (s === 2 || s === 4 || s === 10 || s === 12) drum(ctx, nextT, false, 0.28);
      if (intensity && (s === 3 || s === 11)) drum(ctx, nextT, true, 0.35);
      // kalimba/guitar lead
      const li = LEAD[s];
      pluck(ctx, nextT, SCALE[li % SCALE.length], 0.16, intensity ? 3200 : 2200);
      // bass each bar
      if (s % 4 === 0) pluck(ctx, nextT, BASS[(step / 4 | 0) % 4], 0.2, 900);
      if (intensity) shaker(ctx, nextT, s % 2 === 0 ? 0.10 : 0.05);
      nextT += stepDur;
      step++;
    }
  }, 90);
}
export function stopMusic() {
  if (musicTimer != null) { clearInterval(musicTimer); musicTimer = null; }
}

// ---- SFX ----
function env(g: GainNode, t: number, v: number, dur: number) {
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
}
function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
  const c = ac(); if (!c || !sfxGain) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, vol, dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur: number, vol: number, filterFreq: number, type: BiquadFilterType = 'lowpass', delay = 0) {
  const c = ac(); if (!c || !sfxGain) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
  const g = c.createGain(); env(g, t, vol, dur);
  s.connect(f); f.connect(g); g.connect(sfxGain);
  s.start(t);
}

function jitter(v: number, amt = 0.12): number {
  return v * (1 + (Math.random() * 2 - 1) * amt);
}
export const sfx = {
  deploy() { tone(jitter(180), jitter(90), 0.18, 'sine', 0.5); tone(jitter(320), jitter(160), 0.1, 'triangle', 0.2); },
  bell() { tone(1568, 1568, 0.5, 'sine', 0.25); tone(2093, 2093, 0.4, 'sine', 0.15, 0.09); },
  bleat() { tone(jitter(700, 0.15), jitter(420, 0.15), 0.28, 'sawtooth', 0.16); tone(jitter(900, 0.15), jitter(500, 0.15), 0.22, 'square', 0.06, 0.03); },
  drumHit() { tone(jitter(150), jitter(60), 0.2, 'sine', 0.55); noise(0.08, 0.2, jitter(900, 0.2)); },
  drumRoll() { for (let i = 0; i < 5; i++) tone(jitter(150), jitter(70), 0.12, 'sine', 0.4, i * 0.07); },
  thud() { tone(jitter(90), 40, 0.25, 'sine', 0.6); noise(0.15, 0.4, jitter(500, 0.2)); },
  splash() { noise(0.25, 0.35, jitter(2500, 0.25), 'bandpass'); tone(jitter(600), jitter(900), 0.18, 'sine', 0.15); },
  whistle() { tone(jitter(1200, 0.08), jitter(1800, 0.08), 0.18, 'sine', 0.2); tone(jitter(1500, 0.08), jitter(2200, 0.08), 0.15, 'sine', 0.15, 0.12); },
  thunder() { noise(0.7, 0.5, jitter(300, 0.2)); tone(jitter(80), 30, 0.7, 'sine', 0.55); },
  slash() { noise(0.08, 0.22, jitter(2800, 0.25), 'highpass'); tone(jitter(500), jitter(250), 0.07, 'triangle', 0.18); },
  shoot() { tone(jitter(800), jitter(300), 0.08, 'square', 0.12); noise(0.05, 0.15, jitter(3200, 0.2), 'highpass'); },
  hit(light = false) {
    const v = light ? 0.18 : 0.3;
    noise(0.09, v, jitter(1400), 'lowpass');
    tone(jitter(220), jitter(110), 0.09, 'triangle', light ? 0.15 : 0.25);
  },
  heavy() { noise(0.14, 0.4, jitter(900)); tone(jitter(160), 55, 0.16, 'sine', 0.5); tone(jitter(320), jitter(120), 0.1, 'triangle', 0.25); },
  death() { tone(jitter(400), jitter(80), 0.25, 'sawtooth', 0.2); noise(0.2, 0.25, jitter(1000)); },
  brick() { noise(0.25, 0.5, jitter(700)); tone(jitter(140), 55, 0.3, 'sine', 0.5); },
  chips() { noise(0.12, 0.3, jitter(2200), 'highpass'); tone(jitter(900), jitter(400), 0.06, 'square', 0.12); },
  net() { noise(0.3, 0.3, jitter(2500), 'bandpass'); tone(jitter(500), jitter(900), 0.2, 'sine', 0.12); },
  knock() { tone(jitter(300), jitter(120), 0.15, 'square', 0.2); noise(0.1, 0.25, jitter(1800)); },
  blaze() { noise(0.45, 0.5, jitter(800)); tone(jitter(300), 55, 0.45, 'sawtooth', 0.4); tone(jitter(150), 40, 0.5, 'sine', 0.45, 0.05); },
  gust() { noise(0.65, 0.35, jitter(1800), 'bandpass'); noise(0.4, 0.2, jitter(3200), 'highpass', 0.1); },
  rainHit() { noise(0.15, 0.2, jitter(4000), 'highpass'); },
  cheer() {
    noise(0.9, 0.35, jitter(1200), 'bandpass');
    tone(jitter(523), jitter(523), 0.4, 'triangle', 0.12); tone(jitter(659), jitter(659), 0.4, 'triangle', 0.12, 0.08); tone(jitter(784), jitter(784), 0.6, 'triangle', 0.12, 0.16);
  },
  horn() { tone(jitter(392), jitter(392), 0.35, 'sawtooth', 0.2); tone(jitter(523), jitter(523), 0.5, 'sawtooth', 0.2, 0.3); },
  click() { tone(jitter(660, 0.05), jitter(660, 0.05), 0.05, 'square', 0.12); },
  hover() { tone(jitter(990, 0.05), jitter(990, 0.05), 0.03, 'sine', 0.05); },
  error() { tone(200, 140, 0.15, 'square', 0.15); },
  star() { tone(jitter(880), jitter(1320), 0.25, 'triangle', 0.25); },
  surge() { noise(0.5, 0.45, jitter(900)); tone(jitter(320), 70, 0.45, 'sine', 0.5); tone(jitter(160), 50, 0.5, 'triangle', 0.3, 0.05); },
  // mfiti: low whispers + owl hoots + magic hum
  whisper() { noise(0.6, 0.16, jitter(3000), 'bandpass'); tone(jitter(140), jitter(90), 0.55, 'sine', 0.2); tone(jitter(210), jitter(130), 0.5, 'triangle', 0.1, 0.1); },
  hoot() { tone(jitter(420, 0.06), jitter(340, 0.06), 0.22, 'sine', 0.3); tone(jitter(420, 0.06), jitter(300, 0.06), 0.3, 'sine', 0.3, 0.25); },
  hum() { tone(jitter(110), jitter(110), 0.7, 'sawtooth', 0.1); tone(jitter(165), jitter(165), 0.7, 'sine', 0.14, 0.05); },
  // zikwanje: metal shing + grunt + grass rustle
  shing() { noise(0.07, 0.3, jitter(5200, 0.2), 'highpass'); tone(jitter(1400), jitter(2400), 0.09, 'triangle', 0.2); },
  grunt() { tone(jitter(160, 0.15), jitter(100, 0.15), 0.16, 'sawtooth', 0.22); },
  rustle() { noise(0.22, 0.25, jitter(4500), 'highpass'); },
  // njuchi: rising buzz + death pop
  buzz() { tone(jitter(190, 0.1), jitter(230, 0.1), 0.4, 'sawtooth', 0.16); tone(jitter(285, 0.1), jitter(345, 0.1), 0.4, 'square', 0.05); },
  pop() { tone(jitter(500), jitter(1200), 0.06, 'square', 0.16); },
  sting() { tone(jitter(900), jitter(1400), 0.1, 'sawtooth', 0.14); },
  // mphezi: cast crackle + per-bolt strike + delayed thunder rumble
  crackle() { noise(0.3, 0.3, jitter(6000), 'highpass'); tone(jitter(2000), jitter(800), 0.15, 'square', 0.1); },
  bolt() { noise(0.12, 0.5, jitter(4500), 'highpass'); tone(jitter(180), 40, 0.3, 'sawtooth', 0.5); tone(jitter(1200), jitter(200), 0.12, 'square', 0.2); },
  thunderHit() { noise(0.9, 0.5, jitter(250, 0.2)); tone(jitter(70), 28, 0.9, 'sine', 0.55, 0.15); },
  sweep() { noise(0.14, 0.28, jitter(3200), 'bandpass'); tone(jitter(400), jitter(180), 0.12, 'triangle', 0.2); },
  harvest() {
    tone(jitter(523), jitter(523), 0.16, 'triangle', 0.22); tone(jitter(659), jitter(659), 0.16, 'triangle', 0.22, 0.09);
    tone(jitter(784), jitter(784), 0.3, 'triangle', 0.25, 0.18);
  },
};

export function setRaining(on: boolean) {
  const c = ac(); if (!c || !sfxGain) return;
  if (on && !rainNodes) {
    const len = 2;
    const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500;
    const g = c.createGain(); g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.10, c.currentTime + 1.5);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start();
    rainNodes = { src, gain: g };
  } else if (!on && rainNodes) {
    const { src, gain } = rainNodes;
    rainNodes = null;
    gain.gain.linearRampToValueAtTime(0.0, c.currentTime + 0.8);
    window.setTimeout(() => { try { src.stop(); } catch { /* noop */ } }, 1000);
  }
}

const BARKS: Record<string, string> = {
  mlonda: 'Ndili pano!',
  woweta: 'Bwerani!',
  watchtower: 'Mangani!', rain: 'Mvula!', roadblock: 'Tsekani!',
  harvest: 'Zokolola!', mafunde: 'Madzi!',
  moto: 'Moto!', mphepo: 'Mphepo!', fisi: 'Fisi!', makwerero: 'Kwerani!',
  mfiti: 'Usiku...', zikwanje: 'Tiyeni!', njuchi: 'Bzzzz!', mphezi: 'Mphezi!',
};
export function bark(card: string, enabled: boolean) {
  if (!enabled) return;
  try {
    const u = new SpeechSynthesisUtterance(BARKS[card] ?? 'Tiyeni!');
    u.lang = 'ny-MW';
    u.rate = 1.1; u.pitch = 1.0; u.volume = 0.7;
    window.speechSynthesis?.cancel();
    window.speechSynthesis?.speak(u);
  } catch { /* speech unsupported — subtitle bubble still shows */ }
}
