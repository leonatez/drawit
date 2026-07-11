import { generateEditMask } from '@/lib/image-utils.server';
import type { ProviderEditInput, ProviderEditResult } from './types';

const VILAO_TIMEOUT_MS = 120_000;

/** Node's Buffer is typed as ArrayBufferLike, which the DOM BlobPart type rejects — copy into a plain ArrayBuffer. */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * Sends an edit request to VILAO's OpenAI-compatible /v1/images/edits endpoint.
 * Sends the target picture plus every other referenced picture as additional
 * `image[]` entries (multi-image support — unverified against VILAO's real
 * backend; if it turns out to ignore/reject extra images, fall back to
 * target-only). Never throws — always resolves to a ProviderEditResult,
 * mirroring the Gemini provider's contract.
 */
export async function vilaoEditImage(
  input: ProviderEditInput,
  modelName: string,
): Promise<ProviderEditResult> {
  try {
    const targetBase64 = input.pictureBase64Map[input.targetPictureId];
    const boxMentions = input.mentions.filter((m) => m.type === 'box' && m.box).map((m) => m.box!);
    const maskBuf = boxMentions.length > 0
      ? await generateEditMask(targetBase64, boxMentions)
      : null;

    const otherPictureIds = [...new Set(
      input.mentions.map((m) => m.pictureId).filter((id) => id !== input.targetPictureId),
    )];
    const otherBase64s = otherPictureIds
      .map((id) => input.pictureBase64Map[id])
      .filter((b): b is string => Boolean(b));

    const url = process.env.VILAO_BASE_URL || 'https://api.vilao.ai/v1/images/edits';
    const fd = new FormData();
    fd.append('image[]', new Blob([toArrayBuffer(Buffer.from(targetBase64, 'base64'))], { type: 'image/png' }), 'target.png');
    otherBase64s.forEach((b64, i) => {
      fd.append('image[]', new Blob([toArrayBuffer(Buffer.from(b64, 'base64'))], { type: 'image/png' }), `reference-${i}.png`);
    });
    if (maskBuf) fd.append('mask', new Blob([toArrayBuffer(maskBuf)], { type: 'image/png' }), 'mask.png');
    fd.append('model', modelName);
    fd.append('prompt', input.prompt);
    fd.append('size', 'auto');

    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(VILAO_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${process.env.VILAO_API_KEY}` },
      body: fd, // do NOT set Content-Type — fetch derives the multipart boundary from the FormData body
    });

    if (!res.ok) {
      const raw = await res.text();
      let message = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error?.message) message = parsed.error.message; // exact provider message, verbatim
      } catch { /* not JSON — keep the raw body text */ }
      return { editedBase64: null, message: `VILAO: ${message}` };
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) return { editedBase64: null, message: 'VILAO returned no image.' };
    return { editedBase64: b64, message: 'Edit applied.' };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    const msg = err instanceof Error ? err.message : String(err);
    return {
      editedBase64: null,
      message: isTimeout
        ? `VILAO request timed out after ${VILAO_TIMEOUT_MS / 1000}s.`
        : `VILAO request failed: ${msg}`,
    };
  }
}
