// Claude — fallback de visión (opcional). SPEC §C-10.3, §C-10.6.
import type { ProviderDispatch } from '../types';
import { fetchImageAsBase64, estimateTokens } from './shared';

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export const dispatchClaude: ProviderDispatch = async (model, prompt, req) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('claude_no_api_key');

  const content: Array<Record<string, unknown>> = [];
  if (req.modality === 'vision' && req.imageUrl) {
    const img = await fetchImageAsBase64(req.imageUrl);
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
    });
  }
  content.push({ type: 'text', text: prompt });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 1024,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw new Error(`claude_http_${res.status}`);

  const json = (await res.json()) as ClaudeResponse;
  const text =
    json.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('') ?? '';
  const tokens =
    (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0) ||
    estimateTokens(prompt + text);
  return { text, provider: 'claude', model, tokens };
};
