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
    const isSvg = storagePath.endsWith('.svg');
    const headers: Record<string, string> = {
      'Content-Type': isSvg ? 'image/svg+xml' : 'image/png',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };
    if (isSvg) {
      // Prevent SVG script execution if opened directly in browser
      headers['Content-Security-Policy'] = "script-src 'none'";
    }
    return new NextResponse(buf as unknown as BodyInit, { headers });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
