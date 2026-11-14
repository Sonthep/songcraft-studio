import {
  AudioLines,
  AudioWaveform,
  Drum,
  FolderOpen,
  GraduationCap,
  Guitar,
  LayoutDashboard,
  Mic,
  PenLine,
  Piano,
  Settings,
  Share2,
  Sparkles,
  WholeWord,
  type LucideIcon,
} from "lucide-react";

export type StudioTool =
  | "lyrics"
  | "melody"
  | "hum"
  | "flow"
  | "piano-roll"
  | "record"
  | "audio"
  | "chords"
  | "coach"
  | "export";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Global route, or a studio tool resolved against the current project. */
  href?: string;
  tool?: StudioTool;
  description?: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Projects", icon: FolderOpen, href: "/projects" },
  { label: "Lyrics Studio", icon: PenLine, tool: "lyrics", description: "Write, segment syllables, see rhymes" },
  { label: "AI Melody Designer", icon: Sparkles, tool: "melody", description: "Generate editable vocal melody candidates" },
  { label: "Hum to Melody", icon: AudioWaveform, tool: "hum", description: "Turn humming into MIDI notes" },
  { label: "Rap Flow Studio", icon: Drum, tool: "flow", description: "Place syllables on the beat grid" },
  { label: "Piano Roll", icon: Piano, tool: "piano-roll", description: "Edit melody notes" },
  { label: "Vocal Recorder", icon: Mic, tool: "record", description: "Record takes over the backing" },
  { label: "Audio Workspace", icon: AudioLines, tool: "audio", description: "Reference tracks, trim, tempo" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export const TOOL_NAV: NavItem[] = [
  { label: "Chord Studio", icon: Guitar, tool: "chords", description: "Build and audition progressions" },
  { label: "Rhyme Finder", icon: WholeWord, href: "/rhymes", description: "Thai / Isan / English rhymes" },
  { label: "Songwriting Coach", icon: GraduationCap, tool: "coach", description: "Analysis and exercises" },
  { label: "Export & Suno", icon: Share2, tool: "export", description: "MIDI, WAV, lyrics, Suno prompts" },
];

export const TOOL_LABELS: Record<StudioTool, string> = {
  lyrics: "Lyrics Studio",
  melody: "AI Melody Designer",
  hum: "Hum to Melody",
  flow: "Rap Flow Studio",
  "piano-roll": "Piano Roll",
  record: "Vocal Recorder",
  audio: "Audio Workspace",
  chords: "Chord Studio",
  coach: "Songwriting Coach",
  export: "Export & Suno",
};

export function toolHref(projectId: string | null, tool: StudioTool): string {
  return projectId ? `/studio/${projectId}/${tool}` : `/projects?tool=${tool}`;
}

export const LAST_PROJECT_KEY = "songcraft:lastProject";
