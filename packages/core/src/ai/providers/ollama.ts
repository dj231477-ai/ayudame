// Ollama — respaldo de texto best-effort (NUNCA visión, INV-7). SPEC §C-10.6, E2/E3.
import type { ProviderDispatch } from '../types';
import { estimateTokens } from './shared';

interface OllamaResponse {
  response?: string;
  eval_count?: number;
  prompt_eval_count?: number;
}

export const dispatchOllama: ProviderDispatch = async (model, prompt, req) => {
  if (req.modality === 'vision') {
    // Defensa en profundidad: la visión jamás se sirve desde Ollama (INV-7).
    throw new Error('ollama_vision_forbidden');
  }
  const base = process.env.OLLAMA_BASE_URL;
  if (!base) throw new Error('ollama_no_base_url');

  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.2 } }),
  });
  if (!res.ok) throw new Error(`ollama_http_${res.status}`);

  const json = (await res.json()) as OllamaResponse;
  const text = json.response ?? '';
  const tokens =
    (json.eval_count ?? 0) + (json.prompt_eval_count ?? 0) || estimateTokens(prompt + text);
  return { text, provider: 'ollama', model, tokens };
};
