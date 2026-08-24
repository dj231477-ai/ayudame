// MiniMax M3 — fallback de pago, visión (D-2) y texto (D-9). SPEC §C-10.6, §C-25.
import type { ProviderDispatch } from '../types';
import { openAICompatibleChat } from './shared';

const BASE_URL = 'https://api.minimax.io/v1';

export const dispatchMinimax: ProviderDispatch = async (model, prompt, req) => {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('minimax_no_api_key');
  return openAICompatibleChat({
    provider: 'minimax',
    baseUrl: BASE_URL,
    apiKey,
    model,
    prompt,
    ...(req.modality === 'vision' && req.imageUrl ? { imageUrl: req.imageUrl } : {}),
    ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
  });
};
