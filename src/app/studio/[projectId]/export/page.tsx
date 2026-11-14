import type { Metadata } from "next";
import { ExportPage } from "@/components/export/export-page";

/** Client-only data (IndexedDB); see studio layout. */
export const instant = false;

export const metadata: Metadata = { title: "Export & Suno" };

export default function Page() {
  return <ExportPage />;
}
