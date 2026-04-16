import { NextRequest, NextResponse } from 'next/server';
import { savePictureFile } from '@/lib/storage';

export async function POST(req: NextRequest) {
  const { projectId, pictureId, base64 } = await req.json();
  if (!projectId || !pictureId || !base64) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }

  const buffer = Buffer.from(base64, 'base64');
  const storagePath = await savePictureFile(projectId, pictureId, buffer);

  return NextResponse.json({ ok: true, storagePath });
}
