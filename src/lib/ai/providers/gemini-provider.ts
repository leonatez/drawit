import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { annotateImageWithBox } from '@/lib/image-utils.server';
import type { ProviderEditInput, ProviderEditResult } from './types';

function getGenAI() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
}

/** Build an inline image Part for Gemini */
function imagePart(base64: string, mimeType = 'image/png'): Part {
  return { inlineData: { data: base64, mimeType } };
}

/**
 * Send the image(s) to Gemini for AI-based editing.
 * For box mentions: the relevant picture is annotated with a bounding-box overlay.
 * For cross-picture references: both images are sent as context.
 * Returns the edited primary target image as base64.
 */
export async function geminiEditImage(
  input: ProviderEditInput,
  modelName: string,
): Promise<ProviderEditResult> {
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
      (m) => m.type === 'box' && m.pictureId === picId && m.box,
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
      const labels = boxMentionsForPic.map((m) => `@${m.box!.label}`).join(', ');
      contextLines.push(
        `Image ${imageIndex} (${isTarget ? 'PRIMARY – edit this' : 'reference'}): the boxed regions ${labels} indicate where to apply the edit.`,
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
        `the boxed region @${m.label} in Image ${idx}`,
      );
    } else {
      translatedPrompt = translatedPrompt.replace(`@${m.label}`, `Image ${idx}`);
    }
  }

  contextLines.push('');
  contextLines.push(`Instruction: ${translatedPrompt}`);
  contextLines.push('');
  contextLines.push(
    'IMPORTANT: Output ONLY the edited version of Image 1 (the primary image). Do NOT include any colored box borders, bounding box outlines, label text, or annotation overlays in your output — those are shown only to indicate the edit region and must be completely absent from the result. Preserve all areas outside the boxed regions exactly as they are — no darkening, no brightening, no vignette, no color grading. Output a complete, realistic image.',
  );

  parts.push({ text: contextLines.join('\n') });

  try {
    const model = genAI.getGenerativeModel({ model: modelName });
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

    // No image part — inspect the response for the actual refusal reason before falling
    // back to a generic message (RED TEAM Finding 14: field names/shapes below are the SDK's
    // documented Gemini API conventions; not independently verified against this specific
    // preview model's real responses — flagged for manual verification in Phase 02).
    const fb = response.promptFeedback;
    if (fb?.blockReason) {
      return {
        editedBase64: null,
        message: `Blocked by Gemini safety filter: ${fb.blockReason}${fb.blockReasonMessage ? ' — ' + fb.blockReasonMessage : ''}`,
      };
    }
    const cand = response.candidates?.[0];
    if (cand?.finishReason && cand.finishReason !== 'STOP') {
      const cats = (cand.safetyRatings ?? [])
        .filter((r) => r.probability === 'HIGH' || r.probability === 'MEDIUM')
        .map((r) => r.category)
        .join(', ');
      return {
        editedBase64: null,
        message: `Gemini declined (${cand.finishReason})${cats ? ': flagged ' + cats : ''}. Try rephrasing or a different region.`,
      };
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
