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

const RMBG_BIN = process.env.RMBG_BIN ?? 'rmbg';
const VALID_MODELS = new Set(['modnet', 'briaai', 'u2netp']);

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
    const model = VALID_MODELS.has(settings.rmbg_model) ? settings.rmbg_model : 'modnet';

    const newId = nanoid();
    const tmpOut = path.join(os.tmpdir(), `drawit-rmbg-${newId}.png`);

    await execFileAsync(RMBG_BIN, [
      picture.storagePath,
      '-o', tmpOut,
      '-m', model,
    ], { timeout: 120_000 });

    const resultBuf = await fs.readFile(tmpOut);
    await fs.rm(tmpOut, { force: true });

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
