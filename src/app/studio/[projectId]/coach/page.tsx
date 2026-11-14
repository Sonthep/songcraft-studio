import type { Metadata } from "next";
import { CoachPage } from "@/components/coach/coach-page";

/** Client-only data (IndexedDB); see studio layout. */
export const instant = false;

export const metadata: Metadata = { title: "Songwriting Coach" };

export default function Page() {
  return <CoachPage />;
}
