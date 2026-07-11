// Server-only image processing utilities (use sharp)

/** Draw a bounding-box annotation on an image using an SVG overlay */
export async function annotateImageWithBox(
  imageBase64: string,
  relX: number,
  relY: number,
  relW: number,
  relH: number,
  color: string,
  label: string,
): Promise<string> {
  const sharp = (await import('sharp')).default;

  const buf = Buffer.from(imageBase64, 'base64');
  const meta = await sharp(buf).metadata();
  const imgW = meta.width ?? 512;
  const imgH = meta.height ?? 512;

  const bx = Math.round(relX * imgW);
  const by = Math.round(relY * imgH);
  const bw = Math.round(relW * imgW);
  const bh = Math.round(relH * imgH);

  const svgOverlay = `
<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="${color}" stroke-width="4"/>
  <rect x="${bx}" y="${Math.max(0, by - 22)}" width="${Math.max(bw, 60)}" height="22" fill="${color}" rx="4"/>
  <text x="${bx + 6}" y="${Math.max(16, by - 6)}" fill="white" font-size="13" font-weight="bold" font-family="monospace">@${label}</text>
</svg>`;

  const annotated = await sharp(buf)
    .composite([{ input: Buffer.from(svgOverlay), blend: 'over' }])
    .png()
    .toBuffer();

  return annotated.toString('base64');
}

/** Resize an image to max width, preserving aspect ratio */
export async function resizeImage(
  imageBuffer: Buffer,
  maxWidth: number,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(imageBuffer).metadata();
  if ((meta.width ?? 0) <= maxWidth) return imageBuffer;

  return sharp(imageBuffer)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * Builds an OpenAI/VILAO-style edit mask: opaque everywhere except a transparent
 * hole punched at each box (transparent = editable region). Coordinates are clamped
 * to the image bounds and degenerate (zero/negative-area) boxes are dropped rather
 * than composited, since raw SVG geometry from a resize-drag edge case could
 * otherwise produce an invalid rect.
 */
export async function generateEditMask(
  imageBase64: string,
  boxes: { relX: number; relY: number; relW: number; relH: number }[],
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const buf = Buffer.from(imageBase64, 'base64');
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('generateEditMask: could not read source image dimensions');
  }
  const w = meta.width;
  const h = meta.height;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

  const rects = boxes
    .map((b) => ({
      x: clamp(b.relX * w, w),
      y: clamp(b.relY * h, h),
      width: clamp(b.relW * w, w),
      height: clamp(b.relH * h, h),
    }))
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="white"/>`)
    .join('');

  const holes = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;

  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: Buffer.from(holes), blend: 'dest-out' }])
    .png()
    .toBuffer();
}
