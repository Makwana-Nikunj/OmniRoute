/**
 * src/lib/db/projects.ts — First-class project/application entities.
 */

import { v4 as uuidv4 } from "uuid";
import { getDbInstance, rowToCamel } from "./core";
import { backupDbFile } from "./backup";

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectDbRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function listProjects(): ProjectRecord[] {
  const db = getDbInstance();
  const rows = db.prepare("SELECT * FROM projects ORDER BY name ASC").all() as ProjectDbRow[];
  return rows.map((r) => rowToCamel(r) as ProjectRecord);
}

export function getProject(id: string): ProjectRecord | null {
  if (!id) return null;
  const db = getDbInstance();
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectDbRow | undefined;
  if (!row) return null;
  return rowToCamel(row) as ProjectRecord;
}

export function createProject(data: {
  id?: string;
  name: string;
  description?: string | null;
}): ProjectRecord {
  const db = getDbInstance();
  const id = data.id || uuidv4();
  const now = new Date().toISOString();
  const name = data.name.trim();
  const description = data.description?.trim() ?? null;

  db.prepare(
    "INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, description, now, now);

  backupDbFile("pre-write");
  return {
    id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateProject(
  id: string,
  data: { name?: string; description?: string | null }
): ProjectRecord | null {
  const db = getDbInstance();
  const current = getProject(id);
  if (!current) return null;

  const now = new Date().toISOString();
  const name = data.name !== undefined ? data.name.trim() : current.name;
  const description = data.description !== undefined ? data.description : current.description;

  db.prepare("UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?").run(
    name,
    description,
    now,
    id
  );

  backupDbFile("pre-write");
  return {
    ...current,
    name,
    description,
    updatedAt: now,
  };
}

export function deleteProject(id: string): boolean {
  const db = getDbInstance();
  const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  // Clear project_id from combos referencing this project
  db.prepare("UPDATE combos SET project_id = NULL WHERE project_id = ?").run(id);
  backupDbFile("pre-write");
  return (result.changes ?? 0) > 0;
}
