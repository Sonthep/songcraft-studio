import type { Metadata } from "next";
import { RhymesPage } from "@/components/lyrics/rhymes-page";

export const metadata: Metadata = { title: "Rhyme Finder" };

export default function Page() {
  return <RhymesPage />;
}
