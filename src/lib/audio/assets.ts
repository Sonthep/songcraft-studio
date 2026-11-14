"use client";

import { repository } from "@/lib/persistence/repository";
import { uid } from "@/lib/project/factory";
import type { AudioAsset } from "@/lib/project/schema";
import { useProjectStore } from "@/stores/project-store";

/** Store a blob in IndexedDB and register its metadata on the open project (not undoable). */
export async function addAudioAsset(blob: Blob, meta: Omit<AudioAsset, "id" | "createdAt" | "sizeBytes" | "mimeType"> & { mimeType?: string }): Promise<AudioAsset> {
  const { project, update } = useProjectStore.getState();
  if (!project) throw new Error("No project open");
  const asset: AudioAsset = {
    id: uid("aud"),
    createdAt: Date.now(),
    sizeBytes: blob.size,
    mimeType: meta.mimeType || blob.type || "application/octet-stream",
    kind: meta.kind,
    name: meta.name,
    durationSec: meta.durationSec,
    offsetSec: meta.offsetSec ?? 0,
    notes: meta.notes ?? "",
  };
  await repository.putAudio(project.id, asset.id, blob);
  update((d) => void d.audioAssets.push(asset), { history: false });
  // Persist right away so the metadata never points at a missing blob after a reload.
  await useProjectStore.getState().save();
  return asset;
}

export async function deleteAudioAsset(id: string) {
  const { update } = useProjectStore.getState();
  update((d) => void (d.audioAssets = d.audioAssets.filter((a) => a.id !== id)), { history: false });
  await repository.removeAudio(id);
  await useProjectStore.getState().save();
}

export function renameAudioAsset(id: string, name: string) {
  useProjectStore.getState().update(
    (d) => {
      const a = d.audioAssets.find((x) => x.id === id);
      if (a) a.name = name.slice(0, 200) || a.name;
    },
    { history: false, coalesce: `asset-${id}` },
  );
}

const blobCache = new Map<string, Blob>();

export async function loadAudioBlob(id: string): Promise<Blob | null> {
  const hit = blobCache.get(id);
  if (hit) return hit;
  const b = await repository.getAudio(id);
  if (b) blobCache.set(id, b);
  return b;
}

export function extensionFor(mime: string): string {
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("flac")) return "flac";
  return "webm";
}
