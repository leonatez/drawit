import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import { loadProject, saveVectorFile, loadAdminSettings } from '@/lib/storage';

const execFileAsync = promisify(execFile);

const PYTHON = '/home/linh-nguyen/miniconda3/bin/python3';
const SCRIPT = path.join(process.cwd(), 'scripts', 'vectorize.py');

function isPathSafe(storagePath: string): boolean {
  const resolved = path.resolve(storagePath);
  const dataDir = path.resolve(process.cwd(), 'data');
  return resolved.startsWith(dataDir);
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, pictureId } = await req.json();
    if (!projectId || !pictureId) {
      return NextResponse.json({ error: 'projectId and pictureId required' }, { status: 400 });
    }

    const project = await loadProject(projectId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const picture = project.pictures.find((p) => p.id === pictureId);
    if (!picture) return NextResponse.json({ error: 'Picture not found' }, { status: 404 });

    if (!isPathSafe(picture.storagePath)) {
      return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 });
    }

    const settings = await loadAdminSettings();
    const newId = nanoid();
    const tmpSvg = path.join(os.tmpdir(), `drawit-vec-${newId}.svg`);

    await execFileAsync(PYTHON, [
      SCRIPT,
      picture.storagePath,
      tmpSvg,
      String(settings.vec_n_colors),
      String(settings.vec_min_area),
      String(settings.vec_smoothing),
    ], { timeout: 60_000 });

    const svgContent = await fs.readFile(tmpSvg, 'utf-8');
    await fs.rm(tmpSvg, { force: true });

    const storagePath = await saveVectorFile(projectId, newId, svgContent);

    return NextResponse.json({
      pictureId: newId,
      storagePath,
      originalWidth: picture.originalWidth,
      originalHeight: picture.originalHeight,
    });
  } catch (err) {
    console.error('[vectorize]', err);
    return NextResponse.json({ error: 'Vectorization failed' }, { status: 500 });
  }
}
