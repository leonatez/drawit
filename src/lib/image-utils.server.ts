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
