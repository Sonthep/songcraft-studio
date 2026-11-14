import { z } from "zod";
import { getDb } from "@/lib/persistence/db";

export const userSettingsSchema = z.object({
  metronomeVolume: z.number().min(0).max(1).default(0.6),
  melodyVolume: z.number().min(0).max(1).default(0.8),
  chordVolume: z.number().min(0).max(1).default(0.5),
  masterVolume: z.number().min(0).max(1).default(0.85),
  countInBars: z.number().int().min(0).max(2).default(1),
  autosaveDelayMs: z.number().int().min(300).max(10000).default(800),
  defaultGrid: z.string().default("1/16"),
  aiSuggestionMode: z.enum(["conservative", "creative", "experimental"]).default("conservative"),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_SETTINGS: UserSettings = userSettingsSchema.parse({});

const SETTINGS_KEY = "user";

export async function loadSettings(): Promise<UserSettings> {
  try {
    const db = await getDb();
    const raw = await db.get("settings", SETTINGS_KEY);
    return userSettingsSchema.parse(raw ?? {});
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: UserSettings): Promise<void> {
  const db = await getDb();
  await db.put("settings", userSettingsSchema.parse(s), SETTINGS_KEY);
}
