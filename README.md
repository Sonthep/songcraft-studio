# SongCraft Studio

A personal songwriting workstation for **Thai, Isan and English** songs — Hip-Hop, Melodic Rap, R&B, Pop Ballad and emotional music. Write lyrics with syllable and rhyme analysis, sketch melodies and rap flows, hum ideas into MIDI, record takes, and hand everything off to a DAW (FL Studio etc.) or an external generator such as Suno.

It is **local-first**: songs, recordings and settings live in your browser (IndexedDB). No account is needed. AI features are optional and run through a server-side provider adapter.

> This is not a Suno clone and not a DAW replacement. Generated material is always an editable sketch; nothing is overwritten without your action.

---

## Quick start

Requirements: Node.js 20.9+ (tested with Node 24), npm, a Chromium-based browser, Firefox or Safari.

```bash
npm install
cp .env.example .env.local   # optional — only needed for AI features
npm run dev                  # http://localhost:3000
```

Open the dashboard, click **New song**, and start in the Lyrics Studio.

### Enabling AI (optional)

Put a key in `.env.local` (server-side only — it is never sent to the browser) and restart:

```bash
ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_MODEL=claude-opus-5-5   (default)
# AI_PROVIDER=none                  (force-disable AI)
```

The dashboard and Settings page show whether a provider is configured. Without one, every rule-based tool keeps working and AI buttons explain what is missing.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint (Next.js + React Compiler hook rules) |
| `npm test` | Unit tests (Vitest, 83 tests) |
| `npm run test:e2e` | Browser workflow test against a running server (see below) |
| `npm run check` | typecheck + lint + unit tests |

## Testing

**Unit tests** (`npm test`) cover:

- MIDI timing: ticks ↔ seconds, bar/beat math, straight and triplet grid snapping (`src/lib/music/timing.test.ts`)
- Note editing & quantization: add/move/resize/clamp, copy/paste/duplicate, rectangle select, quantize strength (`note-ops.test.ts`)
- Project persistence with fake IndexedDB: save/list/update/duplicate/delete incl. audio blobs, invalid data rejection, JSON import/export, MIDI export round-trip (`persistence.test.ts`)
- Thai syllable segmentation, tones and rhymes, including the อุดร / ออนซอน / สะออน / สั่นคลอน / กาพย์กลอน / อ้อนวอน / อาวรณ์ family (`thai.test.ts`)
- Syllable alignment: line segmentation, mixed Thai/English, ๆ, manual overrides, rhyme scheme (`syllables.test.ts`), and melody notes linked 1:1 to syllables (`generator.test.ts`)
- Audio analysis edge cases: YIN accuracy on tones, silence, empty input, noise, octave errors, note segmentation, tempo estimation, WAV encoding (`audio.test.ts`)
- Rap flow arrangement and conversion (`flow.test.ts`)
- Alliteration: Thai/English initial-sound mapping (ข/ค/ฆ, silent ห/อ, clusters), per-line grouping, same-initial-sound word search (`alliteration.test.ts`)

**End-to-end** (`scripts/e2e/workflows.mjs`, uses `playwright-core` with your installed Chrome and a fake microphone):

```bash
npm run build && npm start            # or npm run dev
BASE_URL=http://localhost:3000 npm run test:e2e
# set CHROME_PATH if Chrome is not at the default Windows location
```

It creates a song and exercises lyrics editing, rhyme lookup, syllable overrides, chords, melody generation, Piano Roll draw/undo/redo/delete, playback, MIDI export, hum-to-MIDI from a generated WAV, rap flow, recording a take, the audio workspace, WAV rendering, the Suno prompt, autosave across reload, and duplicate/delete — 27 checks, and it fails on any browser console error.

## Feature status

✅ implemented and verified (unit and/or e2e tests) · ⚙️ needs configuration · ⏳ not implemented

| Area | Status | Notes |
| --- | --- | --- |
| Projects: create, rename, duplicate, delete, genre filter, search, JSON export/import, backup | ✅ | IndexedDB; recordings are not included in JSON exports |
| Autosave (debounced) with save status, unsaved-change warning, undo/redo | ✅ | Typing coalesces into one undo step |
| Lyrics Studio: sections, line editing, syllables, end/internal rhymes (สัมผัสสระ), alliteration (สัมผัสอักษร), repetition, versions, export | ✅ | Thai/Isan/English/mixed; alliteration is matched by initial consonant sound |
| Manual syllable & rhyme overrides, custom rhyme dictionary | ✅ | Per-line overrides; dictionary entries with groups and phonetic overrides |
| Rhyme Finder (Thai / Isan / English, near & multisyllabic, same-initial-sound words, explanations) | ✅ | English uses the CMU Pronouncing Dictionary on the server |
| AI Lyrics Assistant (conservative / creative / experimental, 8 tasks) | ⚙️ | Suggestions are editable; applied only on click |
| AI Melody Designer — rule-based generator, 3+ candidates, phrase regeneration, controls | ✅ | Works without AI |
| AI Melody Designer — AI-guided phrase plans | ⚙️ | Model plans contour/emphasis; the same rules produce the notes |
| Hum to Melody (record/upload, YIN pitch tracking, confidence, quantize, octave fix) | ✅ | Monophonic input only |
| Piano Roll (grid incl. triplets, draw/move/resize, multi-select, copy/paste, undo, velocity lane, chord tones, lyrics on notes, loop region, MIDI import/export) | ✅ | Ticks at 480 PPQ internally |
| Chord Studio (presets, palette, parsing, voicings/inversions, audition, loop, rule-based ideas) | ✅ | |
| Rap Flow Studio (grid, drag & keyboard moves, patterns incl. triplet/double-time, density stats, beat preview, send to melody) | ✅ | |
| Rap Flow AI ideas | ⚙️ | Placements only; lyrics are never changed; invalid output is repaired and reported |
| Vocal Recorder (permissions, level meter, monitoring, metronome/chord backing, count-in, multiple takes, download) | ✅ | Latency warning shown; no zero-latency claim |
| Audio Workspace (import, waveform, loop region, trim to new clip, tempo estimate, pitch analysis) | ✅ | |
| Export: Standard MIDI (melody/chords/lyric events, tempo/time/key), WAV render, lyric sheet, metadata | ✅ | No .flp export |
| Suno prompt generator (editable, copy, tagged lyrics) | ✅ | AI refinement is ⚙️; no Suno API or automation |
| Songwriting Coach: measurements, rule-based checks, lessons & exercises | ✅ | AI coach is ⚙️ |
| Keyboard shortcuts, resizable/collapsible panels, mobile layout | ✅ | Shortcuts listed in Settings |
| Supabase cloud sync & authentication | ⏳ | Schema + RLS ready in `supabase/migrations`; no client adapter yet |
| Stem separation, full audio transcription, Python/CREPE pitch service | ⏳ | Pipeline is modular for a future adapter |
| Web MIDI input (live keyboard recording) | ⏳ | Capability is detected; MIDI files are supported |

## Architecture

```text
src/
  app/                    Next.js App Router pages and route handlers
    api/ai/*              lyrics, coach, flow, suno, melody-plan, status (server-only AI)
    api/phonetics         CMU pronunciations for English words
    api/rhymes/*          English rhymes; English words matching a Thai rhyme
    studio/[projectId]/*  workspace tools (lyrics, melody, hum, flow, piano-roll, record, audio, chords, coach, export)
  components/             UI (shadcn/ui primitives in components/ui)
  hooks/                  autosave, transport sync, recorder, analysis, shortcuts …
  stores/                 Zustand: project (undo/redo), editor, transport, layout, dictionary, assistant
  lib/
    music/                theory, timing (PPQ 480), note ops, progressions
    lyrics/               Thai phonology + segmentation, English helpers, rhyme model, analysis, rhyme finder
    melody/generator.ts   transparent rule-based melody generator
    flow/                 rap flow placement
    audio/                Tone.js engine, YIN pitch, hum segmentation, tempo, WAV, assets
    midi/                 MIDI export/import (@tonejs/midi)
    persistence/          IndexedDB repository (ProjectRepository interface)
    ai/schemas.ts         Zod request/response contracts (validated on client + server)
    server/               server-only: AI provider registry + Claude adapter, prompts, CMU dictionary
supabase/migrations/      PostgreSQL schema with Row Level Security
scripts/e2e/              browser workflow test
```

Key decisions:

- **Timing** is stored in ticks (480 PPQ); pixels are derived from zoom. The Tone.js transport runs at the same PPQ, so playback, MIDI export and the editor share one timeline.
- **Thai analysis** is rule-based. A dynamic-programming parser over Thai spelling patterns handles hidden vowels (คน, สบาย), clusters, silent letters (์), leading consonants (อักษรนำ), and tone rules. Rhymes compare vowel quality, vowel length and the final consonant *sound*, never string suffixes. Each syllable records the rule it used and a confidence value, and uncertain readings are flagged in the UI.
- **AI** goes through a provider registry (`src/lib/server/ai/provider.ts`). The Claude adapter uses structured outputs validated by Zod, adaptive thinking, explicit effort, and server-side refusal fallbacks. Keys never reach the browser. Adding another provider means writing one adapter module.
- **Persistence** is behind `ProjectRepository`. The IndexedDB implementation validates every save with Zod. A Supabase implementation can satisfy the same interface.

## Cloud sync (not yet enabled)

`supabase/migrations/20261114000000_init.sql` creates `profiles`, `projects`, `song_sections`, `lyrics_versions`, `melody_versions`, `midi_notes`, `chord_progressions`, `audio_assets`, `recording_takes`, `ai_generations` and `user_settings`, with indexes, RLS policies (owner-only access via `owns_project()`), and a private `audio` storage bucket scoped to `<user id>/…`. Apply it with `supabase db push`. The app does not yet contain a Supabase repository or auth UI. That is the next step and is not claimed as working.

## Deployment (Vercel)

1. Push the repo and import it in Vercel (framework: Next.js; defaults work).
2. Add `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) as environment variables if you want AI features.
3. Deploy. The API routes run as serverless functions. `/api/rhymes/*` and `/api/phonetics` load the 4.7 MB CMU dictionary on first request (a cold start of roughly a second).

Because data is local-first, each browser or device has its own songs. Use **Export project / Back up all projects** to move them.

## Known limitations

- **Thai/Isan phonology is approximate.** Loanwords, irregular spellings and linking syllables (ผลไม้ = phon-la-maai) can be misread. Isan tones vary by province and are estimated with Central Thai rules. Use line overrides or the custom dictionary to correct them.
- **The built-in vocabulary is small.** Rhyme results come from about 400 Thai words, about 24 Isan words with glosses, your lyrics and your custom dictionary. English rhymes include proper names from the CMU data and are not ranked by popularity.
- **The melody generator is rule-based, not a trained singing model.** Melodies follow chords and contour rules, and Thai tones are only a soft preference. Results are sketches to edit.
- **Hum to Melody needs clean monophonic audio.** It uses YIN (not pYIN or CREPE), and pitch tracking on full mixes is unreliable. Analysis is limited to 180 s per run.
- **Browser recording has device-dependent latency.** Takes may need a small timing nudge in a DAW.
- **The WAV render is a guide track** from simple built-in synths, not a production mix.
- **IndexedDB can be cleared** by the browser or the user. Request persistent storage in Settings and export backups.
- **AI quality depends on the provider.** All AI output is validated for shape, not for musical or linguistic correctness.
