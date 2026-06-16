// Gemini — visión (primario) + texto. SPEC §C-10.6.
import type { ProviderDispatch } from '../types';
import { fetchImageAsBase64, estimateTokens } from './shared';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { totalTokenCount?: number };
}

export const dispatchGemini: ProviderDispatch = async (model, prompt, req) => {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('gemini_no_api_key');

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (req.modality === 'vision' && req.imageUrl) {
    const img = await fetchImageAsBase64(req.imageUrl);
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }

  const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: req.maxTokens ?? 1024 },
    }),
  });
  if (!res.ok) throw new Error(`gemini_http_${res.status}`);

  const json = (await res.json()) as GeminiResponse;
  const text =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const tokens = json.usageMetadata?.totalTokenCount ?? estimateTokens(prompt + text);
  return { text, provider: 'gemini', model, tokens };
};
