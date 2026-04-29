import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { nanoid } from 'nanoid';
import { rmbg, createModnetModel, createBriaaiModel, createU2netpModel } from 'rmbg';
import sharp from 'sharp';
import { loadProject, readPictureFile, savePictureFile, loadAdminSettings } from '@/lib/storage';
import { requireMember } from '@/lib/auth-guard';

const VALID_MODELS = new Set(['modnet', 'briaai', 'u2netp']);

function getModelConfig(name: string) {
  if (name === 'briaai') return createBriaaiModel();
  if (name === 'u2netp') return createU2netpModel();
  return createModnetModel();
}

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
    const modelName = VALID_MODELS.has(settings.rmbg_model) ? settings.rmbg_model : 'modnet';

    const inputBuf = await readPictureFile(picture.storagePath);
    const resultBuf = await rmbg(inputBuf, { model: getModelConfig(modelName) }) as Buffer;

    const meta = await sharp(resultBuf).metadata();
    const newId = nanoid();
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
