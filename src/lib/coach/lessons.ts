import type { CoachTopic } from "@/lib/ai/schemas";

/** Built-in learning content (static curriculum, not AI output). */
export const LESSONS: Record<CoachTopic, { concept: string; exercises: Array<{ title: string; steps: string[] }> }> = {
  topline: {
    concept:
      "A topline is the sung melody plus lyric over a chord progression. Strong toplines anchor important words on chord tones and strong beats, and contrast sections by register and rhythm.",
    exercises: [
      { title: "Chord-tone skeleton", steps: ["Loop the chorus chords.", "Sing only chord tones (root, 3rd, 5th) on beat 1 of each bar.", "Fill the gaps with stepwise passing notes.", "Record it and compare with your current melody."] },
      { title: "One-note verse", steps: ["Sing the verse on a single pitch, focusing only on rhythm.", "Then allow exactly one pitch change per line.", "Keep the version where the stressed words feel most natural."] },
    ],
  },
  vocalRhythm: {
    concept:
      "Vocal rhythm is where syllables land against the beat. Stressed syllables on strong beats sound settled; anticipating the beat (landing slightly before it) adds push in R&B and pop.",
    exercises: [
      { title: "Clap the lyric", steps: ["Speak one line over a metronome.", "Clap on every stressed syllable.", "Move one stressed syllable an 8th note earlier and compare the feel."] },
      { title: "Rest placement", steps: ["Take a dense line.", "Insert a rest of one beat before the key word.", "Notice how the word gains emphasis."] },
    ],
  },
  melodicContour: {
    concept:
      "Contour is the shape of a melody over time: arches, descents, waves. Contrast between sections (lower, narrower verse; higher, wider chorus) creates lift. Large leaps are expressive but should usually be followed by steps in the opposite direction.",
    exercises: [
      { title: "Draw the shape", steps: ["Sketch the chorus contour as a line on paper.", "Make the verse shape deliberately lower and flatter.", "Rebuild the melody to fit both drawings."] },
      { title: "Leap and recover", steps: ["Find the emotional peak word.", "Approach it with a leap of a 4th or 5th.", "Recover with 2–3 descending steps."] },
    ],
  },
  hookWriting: {
    concept:
      "A hook is the most memorable, repeated idea: usually a short title phrase with a distinctive rhythm and an easy-to-sing vowel on the longest note. Repetition with slight variation is the main tool.",
    exercises: [
      { title: "Title test", steps: ["Write the song title as a 2–5 syllable phrase.", "Repeat it 3 times in the chorus with a different final line.", "Put the longest note on an open vowel (a, o, ɔ)."] },
      { title: "Rhythmic signature", steps: ["Give the hook phrase a rhythm the verse never uses (e.g. syncopated or triplet).", "Keep the pitches simple so the rhythm stands out."] },
    ],
  },
  chordProgressions: {
    concept:
      "Progressions create tension and release. Four-chord loops (vi–IV–I–V, I–V–vi–IV) are flexible because the melody carries the story; sevenths and suspensions add colour typical of R&B.",
    exercises: [
      { title: "Same melody, new chords", steps: ["Keep your chorus melody.", "Try the progression a third down (e.g. I → vi).", "Note which melody notes change character."] },
      { title: "Colour one chord", steps: ["Replace one triad with a maj7 or m7.", "Listen to how the melody note against it feels."] },
    ],
  },
  songStructure: {
    concept:
      "Structure orders sections to manage energy: verses tell, pre-choruses build, choruses release the main idea, bridges offer contrast. Getting to the first chorus within ~45–60 seconds is common in pop and R&B.",
    exercises: [
      { title: "Energy map", steps: ["Rate each section's energy from 1 to 5.", "Make sure the chorus is the highest and the bridge differs from both verse and chorus."] },
      { title: "Cut to the hook", steps: ["Time how long it takes to reach the first chorus at your BPM.", "If it is long, shorten the intro or the first verse."] },
    ],
  },
  rhymeSchemes: {
    concept:
      "Rhyme schemes (AABB, ABAB, XAXA) set expectations. In Thai, a rhyme needs the same vowel sound, vowel length and final consonant sound — spelling alone is not enough. Internal and multisyllabic rhymes add density, especially in rap.",
    exercises: [
      { title: "Swap the scheme", steps: ["Take a 4-line section.", "Rewrite it from AABB to ABAB (or vice versa) without changing the meaning."] },
      { title: "Rhyme chain", steps: ["Pick one vowel + final sound (e.g. /ɔɔn/).", "Use the Rhyme Finder to collect 8 words.", "Write 2 lines that use 3 of them internally."] },
    ],
  },
  rapFlow: {
    concept:
      "Flow is the rhythmic placement of syllables: density, rests, syncopation, triplets and where rhymes land. Switching patterns between sections keeps a verse alive.",
    exercises: [
      { title: "Pattern switch", steps: ["Arrange a verse in straight 16ths in the Rap Flow Studio.", "Re-arrange the second half as triplets.", "Preview both against the beat."] },
      { title: "Land the rhyme", steps: ["Place every end rhyme on beat 4.", "Then move half of them to the 'and' of 3 and compare."] },
    ],
  },
  vocalPhrasing: {
    concept:
      "Phrasing is how lines breathe: where breaths fall, which syllables stretch, how long phrases are. Parallel lines with similar syllable counts are easier to sing to repeated melodies.",
    exercises: [
      { title: "Breath marks", steps: ["Mark where you breathe in each line.", "Make sure no phrase is longer than two bars without a breath at your tempo."] },
      { title: "Syllable match", steps: ["Count syllables of parallel lines in the Lyrics Studio.", "Edit until they differ by at most 2, or make the difference intentional."] },
    ],
  },
};
