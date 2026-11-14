/**
 * Playback engine built on Tone.js. Tone is imported dynamically so this
 * module is safe to import during server rendering. A single Transport runs at
 * PPQ = 480 so project ticks map 1:1 to Tone ticks ("123i").
 */
import type * as ToneNS from "tone";
import type { ChordEvent, MidiNote } from "@/lib/project/schema";
import { voiceChord } from "@/lib/music/theory";
import { PPQ, ticksPerBar, ticksPerBeat, type TimeSignature } from "@/lib/music/timing";

type ToneModule = typeof ToneNS;

export interface PlaybackContent {
  bpm: number;
  timeSignature: TimeSignature;
  notes: MidiNote[];
  chords: ChordEvent[];
  /** Flow preview: percussion groove + syllable blips. */
  drums?: boolean;
  blips?: Array<{ tick: number; accent: boolean; pitch?: number }>;
  /** Length used to stop at the end when not looping. */
  endTick?: number;
}

export interface MixSettings {
  master: number;
  melody: number;
  chords: number;
  metronome: number;
  drums: number;
  melodyMuted: boolean;
  chordsMuted: boolean;
}

export const DEFAULT_MIX: MixSettings = {
  master: 0.85,
  melody: 0.8,
  chords: 0.5,
  metronome: 0.6,
  drums: 0.7,
  melodyMuted: false,
  chordsMuted: false,
};

interface Instruments {
  melody: ToneNS.PolySynth;
  chords: ToneNS.PolySynth;
  click: ToneNS.Synth;
  kick: ToneNS.MembraneSynth;
  snare: ToneNS.NoiseSynth;
  hat: ToneNS.MetalSynth;
  blip: ToneNS.Synth;
  buses: {
    master: ToneNS.Volume;
    melody: ToneNS.Volume;
    chords: ToneNS.Volume;
    metronome: ToneNS.Volume;
    drums: ToneNS.Volume;
  };
  dispose(): void;
}

function gainToDb(g: number): number {
  return g <= 0.0001 ? -Infinity : 20 * Math.log10(g);
}

function createInstruments(Tone: ToneModule, destination: ToneNS.InputNode): Instruments {
  const master = new Tone.Volume(0).connect(destination);
  const melodyBus = new Tone.Volume(0).connect(master);
  const chordBus = new Tone.Volume(0).connect(master);
  const metroBus = new Tone.Volume(0).connect(master);
  const drumBus = new Tone.Volume(0).connect(master);

  const melody = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.55, release: 0.35 },
  }).connect(melodyBus);
  melody.volume.value = -6;

  const chordFilter = new Tone.Filter(1800, "lowpass").connect(chordBus);
  const chords = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsawtooth", count: 3, spread: 18 },
    envelope: { attack: 0.08, decay: 0.3, sustain: 0.6, release: 0.8 },
  }).connect(chordFilter);
  chords.volume.value = -18;

  const click = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
  }).connect(metroBus);
  click.volume.value = -14;

  const kick = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6 }).connect(drumBus);
  kick.volume.value = -6;
  const snare = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.14, sustain: 0 } }).connect(drumBus);
  snare.volume.value = -14;
  const hat = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).connect(drumBus);
  hat.volume.value = -30;
  const blip = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.02 },
  }).connect(melodyBus);
  blip.volume.value = -8;

  const nodes: Array<{ dispose(): unknown }> = [melody, chordFilter, chords, click, kick, snare, hat, blip, melodyBus, chordBus, metroBus, drumBus, master];
  return {
    melody, chords, click, kick, snare, hat, blip,
    buses: { master, melody: melodyBus, chords: chordBus, metronome: metroBus, drums: drumBus },
    dispose: () => nodes.forEach((n) => n.dispose()),
  };
}

function applyMix(inst: Instruments, mix: MixSettings, metronomeOn: boolean) {
  inst.buses.master.volume.value = gainToDb(mix.master);
  inst.buses.melody.volume.value = mix.melodyMuted ? -Infinity : gainToDb(mix.melody);
  inst.buses.chords.volume.value = mix.chordsMuted ? -Infinity : gainToDb(mix.chords);
  inst.buses.metronome.volume.value = metronomeOn ? gainToDb(mix.metronome) : -Infinity;
  inst.buses.drums.volume.value = gainToDb(mix.drums);
}

/** Schedule content on a transport. Returns a cleanup function. */
function scheduleContent(
  Tone: ToneModule,
  transport: ReturnType<ToneModule["getTransport"]>,
  inst: Instruments,
  content: PlaybackContent,
  opts: { metronome: boolean },
): () => void {
  const disposables: Array<{ dispose(): unknown }> = [];
  const ids: number[] = [];
  const midiToFreq = (m: number) => Tone.Frequency(m, "midi").toFrequency();

  const melodyEvents = content.notes.map((n) => ({
    time: `${n.startTick}i`,
    pitch: n.pitch,
    dur: `${n.durationTicks}i`,
    vel: n.velocity / 127,
  }));
  if (melodyEvents.length) {
    const part = new Tone.Part((time, ev: (typeof melodyEvents)[number]) => {
      inst.melody.triggerAttackRelease(midiToFreq(ev.pitch), ev.dur, time, ev.vel);
    }, melodyEvents).start(0);
    disposables.push(part);
  }

  const chordEvents = content.chords.map((c) => ({
    time: `${c.startTick}i`,
    pitches: voiceChord({ root: c.root, quality: c.quality, bass: c.bass }, c.octave, c.inversion, c.spread),
    dur: `${Math.max(1, c.durationTicks - 10)}i`,
  }));
  if (chordEvents.length) {
    const part = new Tone.Part((time, ev: (typeof chordEvents)[number]) => {
      inst.chords.triggerAttackRelease(ev.pitches.map(midiToFreq), ev.dur, time, 0.6);
    }, chordEvents).start(0);
    disposables.push(part);
  }

  const beat = ticksPerBeat(content.timeSignature);
  const bar = ticksPerBar(content.timeSignature);
  ids.push(
    transport.scheduleRepeat((time) => {
      if (!opts.metronome) return;
      const t = Math.round(transport.getTicksAtTime(time));
      const downbeat = t % bar < beat / 2;
      inst.click.triggerAttackRelease(downbeat ? "C6" : "G5", 0.03, time, downbeat ? 1 : 0.6);
    }, `${beat}i`, 0),
  );

  if (content.drums) {
    const eighth = beat / 2;
    ids.push(
      transport.scheduleRepeat((time) => {
        const t = Math.round(transport.getTicksAtTime(time));
        const inBar = ((t % bar) + bar) % bar;
        const beatIdx = Math.round(inBar / beat);
        const onBeat = Math.abs(inBar - beatIdx * beat) < 2;
        inst.hat.triggerAttackRelease("C6", 0.03, time, onBeat ? 0.5 : 0.3);
        if (onBeat && (beatIdx === 0 || beatIdx === 2)) inst.kick.triggerAttackRelease("C1", 0.2, time, 0.9);
        if (!onBeat && beatIdx === 2 && inBar > beat * 2) inst.kick.triggerAttackRelease("C1", 0.15, time, 0.6);
        if (onBeat && (beatIdx === 1 || beatIdx === 3)) inst.snare.triggerAttackRelease(0.12, time, 0.8);
      }, `${eighth}i`, 0),
    );
  }

  if (content.blips?.length) {
    const part = new Tone.Part((time, ev: { accent: boolean; pitch?: number }) => {
      inst.blip.triggerAttackRelease(midiToFreq(ev.pitch ?? (ev.accent ? 79 : 74)), 0.06, time, ev.accent ? 0.9 : 0.55);
    }, content.blips.map((b) => ({ time: `${b.tick}i`, accent: b.accent, pitch: b.pitch }))).start(0);
    disposables.push(part);
  }

  return () => {
    ids.forEach((id) => transport.clear(id));
    disposables.forEach((d) => d.dispose());
  };
}

export function contentEndTick(content: PlaybackContent): number {
  let end = content.endTick ?? 0;
  for (const n of content.notes) end = Math.max(end, n.startTick + n.durationTicks);
  for (const c of content.chords) end = Math.max(end, c.startTick + c.durationTicks);
  for (const b of content.blips ?? []) end = Math.max(end, b.tick + PPQ / 4);
  const bar = ticksPerBar(content.timeSignature);
  return Math.max(bar, Math.ceil(end / bar) * bar);
}

class AudioEngine {
  private Tone: ToneModule | null = null;
  private inst: Instruments | null = null;
  private cleanup: (() => void) | null = null;
  private content: PlaybackContent | null = null;
  private mix: MixSettings = { ...DEFAULT_MIX };
  private metronome = false;
  private loop = { enabled: false, start: 0, end: PPQ * 16 };
  private endEventId: number | null = null;
  private loadingPromise: Promise<ToneModule> | null = null;

  /** Load Tone and build instruments. Must be called from a user gesture before audio can start. */
  async ensureStarted(): Promise<ToneModule> {
    if (!this.loadingPromise) {
      this.loadingPromise = import("tone").then(async (Tone) => {
        await Tone.start();
        const transport = Tone.getTransport();
        transport.PPQ = PPQ;
        this.Tone = Tone;
        this.inst = createInstruments(Tone, Tone.getDestination());
        applyMix(this.inst, this.mix, this.metronome);
        if (this.content) this.reschedule();
        return Tone;
      });
      this.loadingPromise.catch(() => {
        this.loadingPromise = null;
      });
    }
    return this.loadingPromise;
  }

  get started(): boolean {
    return !!this.inst;
  }

  setContent(content: PlaybackContent) {
    this.content = content;
    if (this.inst) this.reschedule();
  }

  private reschedule() {
    const Tone = this.Tone;
    const inst = this.inst;
    const content = this.content;
    if (!Tone || !inst || !content) return;
    const transport = Tone.getTransport();
    this.cleanup?.();
    transport.bpm.value = content.bpm;
    transport.timeSignature = [content.timeSignature.numerator, content.timeSignature.denominator];
    // Clicks are always scheduled; the metronome bus volume gates whether they are heard.
    this.cleanup = scheduleContent(Tone, transport, inst, content, { metronome: true });
    this.applyLoop();
  }

  private applyLoop() {
    const Tone = this.Tone;
    if (!Tone || !this.content) return;
    const transport = Tone.getTransport();
    if (this.endEventId !== null) transport.clear(this.endEventId);
    this.endEventId = null;
    if (this.loop.enabled && this.loop.end > this.loop.start) {
      transport.setLoopPoints(`${this.loop.start}i`, `${this.loop.end}i`);
      transport.loop = true;
    } else {
      transport.loop = false;
      const end = contentEndTick(this.content);
      this.endEventId = transport.scheduleOnce((time) => {
        transport.stop(time);
        transport.ticks = 0;
      }, `${end}i`);
    }
  }

  setLoop(enabled: boolean, start: number, end: number) {
    this.loop = { enabled, start: Math.max(0, start), end: Math.max(start + 1, end) };
    this.applyLoop();
  }

  setMetronome(on: boolean) {
    this.metronome = on;
    if (this.inst) applyMix(this.inst, this.mix, on);
  }

  setMix(mix: Partial<MixSettings>) {
    this.mix = { ...this.mix, ...mix };
    if (this.inst) applyMix(this.inst, this.mix, this.metronome);
  }

  async play(fromTick?: number) {
    const Tone = await this.ensureStarted();
    const transport = Tone.getTransport();
    if (fromTick !== undefined) transport.ticks = Math.max(0, Math.round(fromTick));
    transport.start();
  }

  pause() {
    this.Tone?.getTransport().pause();
  }

  stop() {
    const transport = this.Tone?.getTransport();
    if (!transport) return;
    transport.stop();
    transport.ticks = 0;
    this.inst?.melody.releaseAll();
    this.inst?.chords.releaseAll();
  }

  seek(tick: number) {
    const transport = this.Tone?.getTransport();
    if (!transport) return;
    transport.ticks = Math.max(0, Math.round(tick));
  }

  /** Current transport position in ticks (0 when audio has not started). */
  getTicks(): number {
    return this.Tone ? this.Tone.getTransport().ticks : 0;
  }

  isPlaying(): boolean {
    return this.Tone?.getTransport().state === "started";
  }

  /** Audition a single note immediately (piano keyboard click, note draw). */
  async previewNote(pitch: number, durationSec = 0.3, velocity = 0.8) {
    const Tone = await this.ensureStarted();
    this.inst?.melody.triggerAttackRelease(Tone.Frequency(pitch, "midi").toFrequency(), durationSec, undefined, velocity);
  }

  async previewChord(pitches: number[], durationSec = 1.2) {
    const Tone = await this.ensureStarted();
    this.inst?.chords.triggerAttackRelease(
      pitches.map((p) => Tone.Frequency(p, "midi").toFrequency()),
      durationSec,
      undefined,
      0.7,
    );
  }

  /** Play count-in clicks outside the transport; resolves when finished. */
  async countIn(bars: number, bpm: number, ts: TimeSignature): Promise<void> {
    const Tone = await this.ensureStarted();
    if (bars <= 0 || !this.inst) return;
    const beatSec = (60 / bpm) * (4 / ts.denominator);
    const beats = bars * ts.numerator;
    const now = Tone.now() + 0.05;
    for (let i = 0; i < beats; i++) {
      const accent = i % ts.numerator === 0;
      // Count-in clicks bypass the metronome mute so the performer always hears them.
      this.inst.blip.triggerAttackRelease(accent ? "C6" : "G5", 0.04, now + i * beatSec, accent ? 1 : 0.6);
    }
    await new Promise((r) => setTimeout(r, (beats * beatSec + 0.05) * 1000));
  }

  /** Audio context for recorder monitoring/analysis. */
  async rawContext(): Promise<AudioContext> {
    const Tone = await this.ensureStarted();
    return Tone.getContext().rawContext as AudioContext;
  }

  dispose() {
    this.cleanup?.();
    this.inst?.dispose();
    this.inst = null;
  }
}

export const audioEngine = new AudioEngine();

/** Render content to an AudioBuffer offline (for WAV export). */
export async function renderOffline(content: PlaybackContent, mix: MixSettings, tailSec = 2): Promise<AudioBuffer> {
  const Tone = await import("tone");
  const endTick = contentEndTick(content);
  const durationSec = (endTick / PPQ) * (60 / content.bpm) + tailSec;
  if (durationSec > 600) throw new Error("Render is limited to 10 minutes.");
  const buffer = await Tone.Offline(({ transport, destination }) => {
    transport.PPQ = PPQ;
    transport.bpm.value = content.bpm;
    transport.timeSignature = [content.timeSignature.numerator, content.timeSignature.denominator];
    const inst = createInstruments(Tone, destination);
    applyMix(inst, mix, false);
    scheduleContent(Tone, transport, inst, content, { metronome: false });
    transport.start(0);
  }, durationSec, 2, 44100);
  const raw = buffer.get();
  if (!raw) throw new Error("Offline render produced no audio.");
  return raw;
}
