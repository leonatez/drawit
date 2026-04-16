import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { savePictureFile, loadAdminSettings } from '@/lib/storage';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const projectId = formData.get('projectId') as string;

  if (!file || !projectId) {
    return NextResponse.json({ error: 'file and projectId required' }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  // eslint-disable-next-line prefer-const
  let buffer: Buffer = Buffer.from(new Uint8Array(bytes));

  // Load admin settings to check compression
  const settings = await loadAdminSettings();

  // Get original dimensions first
  const meta = await sharp(buffer).metadata();
  const originalWidth = meta.width ?? 512;
  const originalHeight = meta.height ?? 512;

  // Apply compression if admin enabled
  if (settings.compress_images && originalWidth > settings.compress_width) {
    buffer = Buffer.from(await sharp(buffer)
      .resize({ width: settings.compress_width, withoutEnlargement: true })
      .png()
      .toBuffer());
  } else {
    // Normalize to PNG
    buffer = Buffer.from(await sharp(buffer).png().toBuffer());
  }

  const finalMeta = await sharp(buffer).metadata();
  const finalWidth = finalMeta.width ?? originalWidth;
  const finalHeight = finalMeta.height ?? originalHeight;

  const pictureId = nanoid();
  const storagePath = await savePictureFile(projectId, pictureId, buffer);

  return NextResponse.json({
    pictureId,
    storagePath,
    originalWidth,
    originalHeight,
    storedWidth: finalWidth,
    storedHeight: finalHeight,
    compressed: settings.compress_images && originalWidth > settings.compress_width,
  });
}
