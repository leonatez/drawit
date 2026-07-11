import type { ResolvedMention } from '@/types';

const DEFAULT_MODELS = ['gemini/gemini-3.1-flash-image-preview'];

export interface ProviderEditInput {
  prompt: string;
  mentions: ResolvedMention[];
  /** Map of pictureId → current base64 image */
  pictureBase64Map: Record<string, string>;
  /** The primary target pictureId to edit */
  targetPictureId: string;
}

export interface ProviderEditResult {
  editedBase64: string | null;
  message: string;
}

/**
 * Splits a model id on the FIRST '/' only — VILAO's own model names contain
 * slashes (e.g. "gtm/gpt-image-2"), so `"vilao/gtm/gpt-image-2"` must parse to
 * provider "vilao", modelName "gtm/gpt-image-2", not `.split('/')` which would
 * break on the extra slash.
 */
export function parseModelId(id: string): { provider: string; modelName: string } | null {
  const idx = id.indexOf('/');
  if (idx === -1) return null;
  const provider = id.slice(0, idx);
  const modelName = id.slice(idx + 1);
  if (!provider || !modelName) return null;
  return { provider, modelName };
}

/** Parses the server-only `MODELS` env var into an ordered list; entry 0 is the default. */
export function getConfiguredModels(): string[] {
  const raw = process.env.MODELS;
  if (!raw) return DEFAULT_MODELS;
  const models = raw.split(',').map((m) => m.trim()).filter(Boolean);
  return models.length > 0 ? models : DEFAULT_MODELS;
}
