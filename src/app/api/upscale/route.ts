import { NextRequest, NextResponse } from 'next/server';
import { readPictureBase64, savePictureFile } from '@/lib/storage';
import { upscaleImage } from '@/lib/ai/gemini';
// sharp is a server-only module, imported dynamically below

export async function POST(req: NextRequest) {
  const { projectId, pictureId, storagePath, targetWidth, download } = await req.json();

  if (!storagePath) {
    return NextResponse.json({ error: 'storagePath required' }, { status: 400 });
  }

  const base64 = await readPictureBase64(storagePath).catch(() => null);
  if (!base64) return NextResponse.json({ error: 'file not found' }, { status: 404 });

  // Compute target height proportional to width
  const sharp = (await import('sharp')).default;
  const meta = await sharp(Buffer.from(base64, 'base64')).metadata();
  const origW = meta.width ?? 512;
  const origH = meta.height ?? 512;
  const targetHeight = Math.round((targetWidth / origW) * origH);

  const result = await upscaleImage(base64, targetWidth, targetHeight);

  if (!result.base64) {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  if (projectId && pictureId) {
    // Optionally persist the upscaled version
    await savePictureFile(projectId, `${pictureId}_upscaled`, Buffer.from(result.base64, 'base64'));
  }

  // Return the image for download
  const buf = Buffer.from(result.base64, 'base64');
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="upscaled.png"',
    },
  });
}
