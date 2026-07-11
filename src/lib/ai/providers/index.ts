import { geminiEditImage } from './gemini-provider';
import { vilaoEditImage } from './vilao-provider';
import { parseModelId } from './types';
import type { ProviderEditInput, ProviderEditResult } from './types';

export type { ProviderEditInput, ProviderEditResult };
export { parseModelId, getConfiguredModels } from './types';

/** Dispatches an edit request to the provider encoded in `modelId` ("<provider>/<modelName>"). */
export async function editImageWithProvider(
  modelId: string,
  input: ProviderEditInput,
): Promise<ProviderEditResult> {
  const parsed = parseModelId(modelId);
  if (!parsed) {
    return { editedBase64: null, message: `Invalid model id: ${modelId}` };
  }
  const { provider, modelName } = parsed;

  if (provider === 'gemini') return geminiEditImage(input, modelName);
  if (provider === 'vilao') return vilaoEditImage(input, modelName);

  return { editedBase64: null, message: `Unsupported model provider: ${provider}` };
}
