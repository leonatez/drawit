import { NextRequest, NextResponse } from 'next/server';
import { readPictureFile } from '@/lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const storagePath = req.nextUrl.searchParams.get('path');
  if (!storagePath) {
    return NextResponse.json({ error: 'path required' }, { status: 400 });
  }

  try {
    const buf = await readPictureFile(storagePath);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
