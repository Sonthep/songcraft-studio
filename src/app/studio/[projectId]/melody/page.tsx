import type { Metadata } from "next";
import { MelodyDesigner } from "@/components/melody/melody-designer";

/** Client-only data (IndexedDB); see studio layout. */
export const instant = false;

export const metadata: Metadata = { title: "AI Melody Designer" };

export default function Page() {
  return <MelodyDesigner />;
}
