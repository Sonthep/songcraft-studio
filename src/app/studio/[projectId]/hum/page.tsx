import type { Metadata } from "next";
import { HumToMelody } from "@/components/hum/hum-to-melody";

/** Client-only data (IndexedDB); see studio layout. */
export const instant = false;

export const metadata: Metadata = { title: "Hum to Melody" };

export default function Page() {
  return <HumToMelody />;
}
