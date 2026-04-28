import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import { loadProject, savePictureFile, loadAdminSettings } from '@/lib/storage';
import { requireMember } from '@/lib/auth-guard';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const PYTHON = process.env.PYTHON_BIN ?? 'python3';
const SCRIPT = path.join(process.cwd(), 'scripts', 'remove_bg.py');

function isPathSafe(storagePath: string): boolean {
  const resolved = path.resolve(storagePath);
  const dataDir = path.resolve(process.cwd(), 'data');
  return resolved.startsWith(dataDir + path.sep) || resolved === dataDir;
}

export async function POST(req: NextRequest) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

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
    const tmpPng = path.join(os.tmpdir(), `drawit-rmbg-${newId}.png`);

    await execFileAsync(PYTHON, [
      SCRIPT,
      picture.storagePath,
      tmpPng,
      String(settings.rmbg_sat_thresh),
      String(settings.rmbg_val_thresh),
    ], { timeout: 60_000 });

    const resultBuf = await fs.readFile(tmpPng);
    await fs.rm(tmpPng, { force: true });

    // Verify it's valid PNG via sharp, get metadata
    const meta = await sharp(resultBuf).metadata();
    const storagePath = await savePictureFile(projectId, newId, resultBuf);

    return NextResponse.json({
      pictureId: newId,
      storagePath,
      originalWidth: meta.width ?? picture.originalWidth,
      originalHeight: meta.height ?? picture.originalHeight,
    });
  } catch (err) {
    console.error('[remove-bg]', err);
    return NextResponse.json({ error: 'Background removal failed' }, { status: 500 });
  }
}
