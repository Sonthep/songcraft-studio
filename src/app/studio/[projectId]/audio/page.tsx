import type { Metadata } from "next";
import { AudioWorkspace } from "@/components/audio/audio-workspace";

/** Client-only data (IndexedDB); see studio layout. */
export const instant = false;

export const metadata: Metadata = { title: "Audio Workspace" };

export default function Page() {
  return <AudioWorkspace />;
}
