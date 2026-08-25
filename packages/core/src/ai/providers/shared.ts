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

/** Chat compatible con la API de OpenAI (Groq, Cerebras, MiniMax). `imageUrl` activa contenido
 * multimodal (visión) en proveedores que lo soporten — MiniMax M3 (D-2/D-9); Groq/Cerebras
 * nunca lo reciben (solo texto, §C-10.3). */
export async function openAICompatibleChat(opts: {
  provider: AIProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens?: number;
  imageUrl?: string;
  /** D-27, §C-10.6: modelos de razonamiento (ej. gpt-oss) gastan tokens de `completion` en
   * pensar antes de responder — sin esto, `max_tokens` bajo corta antes de que `content`
   * llegue a escribirse, devolviendo texto vacío aunque la respuesta HTTP sea 200 OK. */
  reasoningEffort?: 'low' | 'medium' | 'high';
}): Promise<AIResponse> {
  const content = opts.imageUrl
    ? [
        { type: 'text', text: opts.prompt },
        { type: 'image_url', image_url: { url: opts.imageUrl } },
      ]
    : opts.prompt;

  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: 'user', content }],
      max_tokens: opts.maxTokens ?? 1024,
      temperature: 0.2,
      ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${opts.provider}_http_${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const json = (await res.json()) as OpenAIChatResponse;
  const text = json.choices?.[0]?.message?.content ?? '';
  const tokens = json.usage?.total_tokens ?? estimateTokens(opts.prompt + text);
  return { text, provider: opts.provider, model: opts.model, tokens };
}
