import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { annotateImageWithBox } from '@/lib/image-utils.server';
import type { ResolvedMention } from '@/types';

const IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
const VISION_MODEL = 'gemini-1.5-pro';

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
}

/** Build an inline image Part for Gemini */
function imagePart(base64: string, mimeType = 'image/png'): Part {
  return { inlineData: { data: base64, mimeType } };
}

// ─── Image editing ────────────────────────────────────────────────────────────

export interface EditImageInput {
  prompt: string;
  mentions: ResolvedMention[];
  /** Map of pictureId → current base64 image */
  pictureBase64Map: Record<string, string>;
  /** The primary target pictureId to edit */
  targetPictureId: string;
}

export interface EditImageResult {
  editedBase64: string | null;
  message: string;
}

/**
 * Send the image(s) to Gemini for AI-based editing.
 * For box mentions: the relevant picture is annotated with a bounding-box overlay.
 * For cross-picture references: both images are sent as context.
 * Returns the edited primary target image as base64.
 */
export async function editImage(input: EditImageInput): Promise<EditImageResult> {
  const genAI = getGenAI();

  // Build the parts array for Gemini
  const parts: Part[] = [];

  // Deduplicate pictures needed
  const pictureIdsNeeded = new Set<string>();
  pictureIdsNeeded.add(input.targetPictureId);
  for (const m of input.mentions) {
    pictureIdsNeeded.add(m.pictureId);
  }

  // Build context description and annotated images
  const contextLines: string[] = [
    `You are an AI image editor. Edit the primary image (Image 1) according to the instruction.`,
    ``,
  ];

  let imageIndex = 1;
  const pictureIndexMap: Record<string, number> = {};

  for (const picId of pictureIdsNeeded) {
    const base64 = input.pictureBase64Map[picId];
    if (!base64) continue;

    const isTarget = picId === input.targetPictureId;
    pictureIndexMap[picId] = imageIndex;

    // Find mentions for this picture to annotate
    const boxMentionsForPic = input.mentions.filter(
      m => m.type === 'box' && m.pictureId === picId && m.box,
    );

    let annotated = base64;
    if (boxMentionsForPic.length > 0) {
      // Annotate with each box
      for (const m of boxMentionsForPic) {
        const b = m.box!;
        annotated = await annotateImageWithBox(
          annotated,
          b.relX,
          b.relY,
          b.relW,
          b.relH,
          b.color,
          b.label,
        );
      }
      const labels = boxMentionsForPic.map(m => `@${m.box!.label}`).join(', ');
      contextLines.push(
        `Image ${imageIndex} (${isTarget ? 'PRIMARY – edit this' : 'reference'}): shows highlighted regions ${labels}.`,
      );
    } else {
      contextLines.push(
        `Image ${imageIndex} (${isTarget ? 'PRIMARY – edit this' : 'reference'}): full picture.`,
      );
    }

    parts.push(imagePart(annotated));
    imageIndex++;
  }

  // Translate @mentions in prompt into context descriptions
  let translatedPrompt = input.prompt;
  for (const m of input.mentions) {
    const idx = pictureIndexMap[m.pictureId];
    if (m.type === 'box') {
      translatedPrompt = translatedPrompt.replace(
        `@${m.label}`,
        `the highlighted region @${m.label} in Image ${idx}`,
      );
    } else {
      translatedPrompt = translatedPrompt.replace(
        `@${m.label}`,
        `Image ${idx}`,
      );
    }
  }

  contextLines.push('');
  contextLines.push(`Instruction: ${translatedPrompt}`);
  contextLines.push('');
  contextLines.push(
    'IMPORTANT: Output ONLY the edited version of Image 1 (the primary image). Preserve all areas outside the mentioned regions exactly as they are. Output a complete, realistic image.',
  );

  parts.push({ text: contextLines.join('\n') });

  try {
    const model = genAI.getGenerativeModel({ model: IMAGE_MODEL });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        // @ts-expect-error responseModalities is in the API but not typed in SDK yet
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const response = result.response;
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return { editedBase64: part.inlineData.data, message: 'Edit applied.' };
      }
    }

    // Fallback: try text-only vision model to at least get a description
    const textContent = response.text?.();
    return {
      editedBase64: null,
      message: textContent || 'No image was returned by AI.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { editedBase64: null, message: `AI error: ${msg}` };
  }
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
