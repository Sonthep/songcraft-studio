import type { Metadata } from "next";
import { VocalRecorder } from "@/components/recorder/vocal-recorder";

/** Client-only data (IndexedDB); see studio layout. */
export const instant = false;

export const metadata: Metadata = { title: "Vocal Recorder" };

export default function Page() {
  return <VocalRecorder />;
}
