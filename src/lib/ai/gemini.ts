import { GoogleGenerativeAI, Part } from '@google/generative-ai';

const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
}

/** Build an inline image Part for Gemini */
function imagePart(base64: string, mimeType = 'image/png'): Part {
  return { inlineData: { data: base64, mimeType } };
}

// ─── Image upscaling ──────────────────────────────────────────────────────────

export async function upscaleImage(
  base64: string,
  targetWidth: number,
  targetHeight: number,
): Promise<{ base64: string | null; message: string }> {
  const genAI = getGenAI();

  const parts: Part[] = [
    imagePart(base64),
    {
      text: `Upscale and enhance this image to exactly ${targetWidth}x${targetHeight} pixels. Increase resolution and detail while preserving all content, colors, composition, and style. Output a crisp, high-quality image.`,
    },
  ];

  try {
    const model = genAI.getGenerativeModel({ model: IMAGE_MODEL });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        // @ts-expect-error
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    for (const part of result.response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return { base64: part.inlineData.data, message: 'Upscaled.' };
      }
    }
    return { base64: null, message: 'No image returned.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { base64: null, message: `Upscale error: ${msg}` };
  }
}
