// Helpers compartidos entre providers de IA. SPEC §C-10.
import type { AIProviderName, AIResponse } from '../types';

export interface FetchedImage {
  base64: string;
  mimeType: string;
}

/** Descarga la imagen (URL firmada efímera) y la codifica base64 para enviarla al proveedor. */
export async function fetchImageAsBase64(url: string): Promise<FetchedImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image_fetch_failed_${res.status}`);
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString('base64'), mimeType };
}

/** Estimación de tokens cuando el proveedor no la reporta (~4 chars/token). */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
}

/** Chat compatible con la API de OpenAI (Groq, Cerebras). */
export async function openAICompatibleChat(opts: {
  provider: AIProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens?: number;
}): Promise<AIResponse> {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: 'user', content: opts.prompt }],
      max_tokens: opts.maxTokens ?? 1024,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`${opts.provider}_http_${res.status}`);
  const json = (await res.json()) as OpenAIChatResponse;
  const text = json.choices?.[0]?.message?.content ?? '';
  const tokens = json.usage?.total_tokens ?? estimateTokens(opts.prompt + text);
  return { text, provider: opts.provider, model: opts.model, tokens };
}
