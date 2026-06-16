// Cerebras — overflow de texto. SPEC §C-10.6.
import type { ProviderDispatch } from '../types';
import { openAICompatibleChat } from './shared';

export const dispatchCerebras: ProviderDispatch = async (model, prompt, req) => {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error('cerebras_no_api_key');
  return openAICompatibleChat({
    provider: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey,
    model,
    prompt,
    ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
  });
};
