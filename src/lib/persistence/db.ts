import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Project } from "@/lib/project/schema";
import type { CustomRhymeEntry } from "@/lib/lyrics/custom-dictionary";
import type { UserSettings } from "@/lib/settings";

export interface StoredAudio {
  id: string;
  projectId: string;
  blob: Blob;
}

interface SongcraftDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { "by-updated": number; "by-genre": string };
  };
  audio: {
    key: string;
    value: StoredAudio;
    indexes: { "by-project": string };
  };
  customRhymes: {
    key: string;
    value: CustomRhymeEntry;
  };
  settings: {
    key: string;
    value: UserSettings;
  };
}

export const DB_NAME = "songcraft-studio";
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SongcraftDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<SongcraftDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }
  if (!dbPromise) {
    dbPromise = openDB<SongcraftDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const projects = db.createObjectStore("projects", { keyPath: "id" });
        projects.createIndex("by-updated", "updatedAt");
        projects.createIndex("by-genre", "genre");
        const audio = db.createObjectStore("audio", { keyPath: "id" });
        audio.createIndex("by-project", "projectId");
        db.createObjectStore("customRhymes", { keyPath: "id" });
        db.createObjectStore("settings");
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Test helper: forget the cached connection (used with fake-indexeddb resets). */
export function resetDbConnection(): void {
  dbPromise = null;
}
