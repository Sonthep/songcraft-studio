import type { Metadata } from "next";
import { PianoRollPage } from "@/components/piano-roll/piano-roll-page";

/** Client-only data (IndexedDB); see studio layout. */
export const instant = false;

export const metadata: Metadata = { title: "Piano Roll" };

export default function Page() {
  return <PianoRollPage />;
}
