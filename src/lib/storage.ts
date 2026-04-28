import fs from 'fs/promises';
import path from 'path';
import type { Project, AdminSettings } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const ADMIN_SETTINGS_FILE = path.join(DATA_DIR, 'admin-settings.json');

// ─── Initialise directories ──────────────────────────────────────────────────

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureDataDirs() {
  await ensureDir(DATA_DIR);
  await ensureDir(PROJECTS_DIR);
}

// ─── Project ─────────────────────────────────────────────────────────────────

export function projectDir(projectId: string) {
  return path.join(PROJECTS_DIR, projectId);
}

export function picturesDir(projectId: string) {
  return path.join(projectDir(projectId), 'pictures');
}

export function versionsDir(projectId: string) {
  return path.join(projectDir(projectId), 'versions');
}

export async function saveProject(project: Project): Promise<void> {
  await ensureDir(projectDir(project.id));
  await ensureDir(picturesDir(project.id));
  await ensureDir(versionsDir(project.id));

  const file = path.join(projectDir(project.id), 'project.json');
  await fs.writeFile(file, JSON.stringify(project, null, 2), 'utf-8');
}

export async function loadProject(projectId: string): Promise<Project | null> {
  try {
    const file = path.join(projectDir(projectId), 'project.json');
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

/** Save a picture file (PNG buffer) and return its storage path */
export async function savePictureFile(
  projectId: string,
  pictureId: string,
  buffer: Buffer,
): Promise<string> {
  await ensureDir(picturesDir(projectId));
  const filename = `${pictureId}.png`;
  const filepath = path.join(picturesDir(projectId), filename);
  await fs.writeFile(filepath, buffer);
  return filepath;
}

/** Read a picture file as a Buffer — rejects paths outside data/ to prevent traversal */
export async function readPictureFile(storagePath: string): Promise<Buffer> {
  const resolved = path.resolve(storagePath);
  if (!resolved.startsWith(DATA_DIR + path.sep) && resolved !== DATA_DIR) {
    throw new Error('Forbidden path');
  }
  return fs.readFile(resolved);
}

/** Read a picture file as base64 */
export async function readPictureBase64(storagePath: string): Promise<string> {
  const buf = await readPictureFile(storagePath);
  return buf.toString('base64');
}

/** Delete a picture file */
export async function deletePictureFile(storagePath: string): Promise<void> {
  await fs.rm(storagePath, { force: true });
}

/** Save a vector SVG file and return its storage path */
export async function saveVectorFile(
  projectId: string,
  pictureId: string,
  svgContent: string,
): Promise<string> {
  await ensureDir(picturesDir(projectId));
  const filepath = path.join(picturesDir(projectId), `${pictureId}.svg`);
  await fs.writeFile(filepath, svgContent, 'utf-8');
  return filepath;
}

// ─── Version snapshots ───────────────────────────────────────────────────────

/** Save snapshot picture files for a version */
export async function saveVersionSnapshot(
  projectId: string,
  versionId: string,
  pictureDataMap: Record<string, string>, // pictureId -> base64
): Promise<void> {
  const vDir = path.join(versionsDir(projectId), versionId);
  await ensureDir(vDir);

  await Promise.all(
    Object.entries(pictureDataMap).map(([picId, b64]) =>
      fs.writeFile(path.join(vDir, `${picId}.png`), Buffer.from(b64, 'base64')),
    ),
  );
}

/** Read snapshot picture files for a version */
export async function readVersionSnapshot(
  projectId: string,
  versionId: string,
  pictureIds: string[],
): Promise<Record<string, string>> {
  const vDir = path.join(versionsDir(projectId), versionId);
  const result: Record<string, string> = {};

  await Promise.all(
    pictureIds.map(async (picId) => {
      try {
        const buf = await fs.readFile(path.join(vDir, `${picId}.png`));
        result[picId] = buf.toString('base64');
      } catch {
        // skip missing
      }
    }),
  );

  return result;
}

// ─── Project listing / deletion ──────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  pictureCount: number;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await ensureDataDirs();
  let dirs: string[];
  try {
    dirs = await fs.readdir(PROJECTS_DIR);
  } catch {
    return [];
  }

  const results = await Promise.all(
    dirs.map(async (dir): Promise<ProjectSummary | null> => {
      try {
        const file = path.join(PROJECTS_DIR, dir, 'project.json');
        const raw = await fs.readFile(file, 'utf-8');
        const p = JSON.parse(raw) as Project;
        return { id: p.id, name: p.name, updatedAt: p.updatedAt, pictureCount: p.pictures.length };
      } catch {
        return null;
      }
    }),
  );

  return (results.filter(Boolean) as ProjectSummary[]).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function deleteProject(projectId: string): Promise<void> {
  const dir = projectDir(projectId);
  await fs.rm(dir, { recursive: true, force: true });
}

// ─── Admin settings ──────────────────────────────────────────────────────────

const defaultSettings: AdminSettings = {
  compress_images: false,
  compress_width: 500,
  vec_n_colors: 12,
  vec_min_area: 8,
  vec_smoothing: 0.6,
  rmbg_model: 'modnet',
};

export async function loadAdminSettings(): Promise<AdminSettings> {
  await ensureDir(DATA_DIR);
  try {
    const raw = await fs.readFile(ADMIN_SETTINGS_FILE, 'utf-8');
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

export async function saveAdminSettings(settings: AdminSettings): Promise<void> {
  await ensureDir(DATA_DIR);
  await fs.writeFile(ADMIN_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}
