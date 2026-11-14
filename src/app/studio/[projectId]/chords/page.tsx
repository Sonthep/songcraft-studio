import type { Metadata } from "next";
import { ChordStudio } from "@/components/chords/chord-studio";

/** Client-only data (IndexedDB); see studio layout. */
export const instant = false;

export const metadata: Metadata = { title: "Chord Studio" };

export default function Page() {
  return <ChordStudio />;
}
