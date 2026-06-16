// Groq — texto primario. SPEC §C-10.6.
import type { ProviderDispatch } from '../types';
import { openAICompatibleChat } from './shared';

export const dispatchGroq: ProviderDispatch = async (model, prompt, req) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('groq_no_api_key');
  return openAICompatibleChat({
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey,
    model,
    prompt,
    ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
  });
};
