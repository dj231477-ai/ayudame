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
    // D-27: el modelo actual (openai/gpt-oss-20b) es de razonamiento — 'low' evita que gaste
    // el budget de completion pensando antes de escribir la respuesta.
    reasoningEffort: 'low',
    ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
  });
};
