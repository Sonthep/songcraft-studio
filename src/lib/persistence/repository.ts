import { projectSchema, projectExportSchema, type Project, type ProjectExport } from "@/lib/project/schema";
import { duplicateProject, uid } from "@/lib/project/factory";
import { getDb } from "./db";

export interface ProjectSummary {
  id: string;
  title: string;
  genre: string;
  mood: string;
  language: Project["language"];
  bpm: number;
  key: number;
  scale: Project["scale"];
  sectionCount: number;
  lineCount: number;
  noteCount: number;
  takeCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Storage contract. The local IndexedDB implementation is the default.
 * A Supabase implementation can satisfy the same interface (see supabase/migrations).
 */
export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project | null>;
  save(project: Project): Promise<Project>;
  remove(id: string): Promise<void>;
  duplicate(id: string): Promise<Project>;
  putAudio(projectId: string, assetId: string, blob: Blob): Promise<void>;
  getAudio(assetId: string): Promise<Blob | null>;
  removeAudio(assetId: string): Promise<void>;
}

export function summarize(p: Project): ProjectSummary {
  return {
    id: p.id,
    title: p.title,
    genre: p.genre,
    mood: p.mood,
    language: p.language,
    bpm: p.bpm,
    key: p.key,
    scale: p.scale,
    sectionCount: p.sections.length,
    lineCount: p.sections.reduce((n, s) => n + s.lines.filter((l) => l.text.trim()).length, 0),
    noteCount: p.notes.length,
    takeCount: p.audioAssets.length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export class LocalProjectRepository implements ProjectRepository {
  async list(): Promise<ProjectSummary[]> {
    const db = await getDb();
    const all = await db.getAll("projects");
    return all.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Project | null> {
    const db = await getDb();
    const raw = await db.get("projects", id);
    if (!raw) return null;
    const parsed = projectSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Stored project "${id}" failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`);
    }
    return parsed.data;
  }

  async save(project: Project): Promise<Project> {
    const toSave: Project = { ...project, updatedAt: Date.now() };
    const parsed = projectSchema.parse(toSave);
    const db = await getDb();
    await db.put("projects", parsed);
    return parsed;
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(["projects", "audio"], "readwrite");
    await tx.objectStore("projects").delete(id);
    const audioIdx = tx.objectStore("audio").index("by-project");
    let cursor = await audioIdx.openCursor(IDBKeyRange.only(id));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  async duplicate(id: string): Promise<Project> {
    const src = await this.get(id);
    if (!src) throw new Error("Project not found");
    const copy = duplicateProject(src);
    return this.save(copy);
  }

  async putAudio(projectId: string, assetId: string, blob: Blob): Promise<void> {
    const db = await getDb();
    await db.put("audio", { id: assetId, projectId, blob });
  }

  async getAudio(assetId: string): Promise<Blob | null> {
    const db = await getDb();
    const rec = await db.get("audio", assetId);
    return rec?.blob ?? null;
  }

  async removeAudio(assetId: string): Promise<void> {
    const db = await getDb();
    await db.delete("audio", assetId);
  }
}

export const repository: ProjectRepository = new LocalProjectRepository();

export function exportProject(project: Project): ProjectExport {
  return { format: "songcraft-project", version: 1, exportedAt: Date.now(), project };
}

/**
 * Validate and import a project export. The imported project receives a new id
 * so it never overwrites an existing project. Audio assets are not part of the
 * JSON export, so their metadata is dropped.
 */
export function parseProjectImport(json: unknown): Project {
  const parsed = projectExportSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Not a valid SongCraft project file (${issue?.path.join(".") || "root"}: ${issue?.message ?? "invalid"})`);
  }
  const now = Date.now();
  return {
    ...parsed.data.project,
    id: uid("prj"),
    audioAssets: [],
    createdAt: now,
    updatedAt: now,
  };
}
