import type { Metadata } from "next";
import { LyricsStudio } from "@/components/lyrics/lyrics-studio";

/** Client-only data (IndexedDB); see studio layout. */
export const instant = false;

export const metadata: Metadata = { title: "Lyrics Studio" };

export default function Page() {
  return <LyricsStudio />;
}
