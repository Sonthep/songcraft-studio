import type { Metadata } from "next";
import { FlowStudio } from "@/components/flow/flow-studio";

/** Client-only data (IndexedDB); see studio layout. */
export const instant = false;

export const metadata: Metadata = { title: "Rap Flow Studio" };

export default function Page() {
  return <FlowStudio />;
}
