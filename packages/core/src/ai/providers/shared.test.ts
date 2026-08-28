import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-utils/msw/server';
import { openAICompatibleChat, fetchImageAsBase64, estimateTokens } from './shared';

// SPEC §C-10, D-27 (§C-10.6): helper compartido por Groq, Cerebras y MiniMax.
// Red simulada con MSW (§C-18.4).

const BASE = 'https://api.proveedor.test/v1';

interface ChatBody {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
}

function chatOk(body: ChatBody, capture?: (b: Record<string, unknown>) => void) {
  return http.post(`${BASE}/chat/completions`, async ({ request }) => {
    capture?.((await request.json()) as Record<string, unknown>);
    return HttpResponse.json(body);
  });
}

const OPTS = {
  provider: 'groq' as const,
  baseUrl: BASE,
  apiKey: 'k',
  model: 'openai/gpt-oss-20b',
  prompt: 'hola',
};

describe('estimateTokens', () => {
  it('estima ~4 caracteres por token, redondeando hacia arriba', () => {
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('123')).toBe(1);
    expect(estimateTokens('')).toBe(0);
  });
});

describe('openAICompatibleChat (§C-10)', () => {
  it('devuelve el texto y los tokens que reporta el proveedor', async () => {
    server.use(chatOk({ choices: [{ message: { content: 'respuesta' } }], usage: { total_tokens: 42 } }));
    const res = await openAICompatibleChat(OPTS);
    expect(res).toEqual({ text: 'respuesta', provider: 'groq', model: 'openai/gpt-oss-20b', tokens: 42 });
  });

  it('estima los tokens si el proveedor no los reporta', async () => {
    server.use(chatOk({ choices: [{ message: { content: 'abcd' } }] }));
    const res = await openAICompatibleChat(OPTS);
    // 'hola' + 'abcd' = 8 caracteres -> 2 tokens.
    expect(res.tokens).toBe(2);
  });

  it('texto vacío si la respuesta no trae content (no lanza)', async () => {
    server.use(chatOk({ choices: [] }));
    expect((await openAICompatibleChat(OPTS)).text).toBe('');
  });

  it('manda el prompt como string simple cuando no hay imagen', async () => {
    let body: Record<string, unknown> = {};
    server.use(chatOk({ choices: [{ message: { content: 'x' } }] }, (b) => (body = b)));
    await openAICompatibleChat(OPTS);
    expect((body.messages as Array<{ content: unknown }>)[0]?.content).toBe('hola');
  });

  it('con imageUrl manda contenido multimodal (D-2/D-9, solo MiniMax)', async () => {
    let body: Record<string, unknown> = {};
    server.use(chatOk({ choices: [{ message: { content: 'x' } }] }, (b) => (body = b)));
    await openAICompatibleChat({ ...OPTS, provider: 'minimax', imageUrl: 'https://firmada.test/f.jpg' });
    expect((body.messages as Array<{ content: unknown }>)[0]?.content).toEqual([
      { type: 'text', text: 'hola' },
      { type: 'image_url', image_url: { url: 'https://firmada.test/f.jpg' } },
    ]);
  });

  it('D-27: reasoning_effort solo viaja si se pide', async () => {
    let body: Record<string, unknown> = {};
    server.use(chatOk({ choices: [{ message: { content: 'x' } }] }, (b) => (body = b)));

    await openAICompatibleChat(OPTS);
    expect(body.reasoning_effort).toBeUndefined();

    await openAICompatibleChat({ ...OPTS, reasoningEffort: 'low' });
    expect(body.reasoning_effort).toBe('low');
  });

  it('max_tokens por defecto 1024, sobrescribible', async () => {
    let body: Record<string, unknown> = {};
    server.use(chatOk({ choices: [{ message: { content: 'x' } }] }, (b) => (body = b)));

    await openAICompatibleChat(OPTS);
    expect(body.max_tokens).toBe(1024);

    await openAICompatibleChat({ ...OPTS, maxTokens: 64 });
    expect(body.max_tokens).toBe(64);
  });

  it('D-27: un HTTP no-ok incluye el cuerpo en el error, no solo el status', async () => {
    server.use(
      http.post(`${BASE}/chat/completions`, () =>
        HttpResponse.text('{"error":{"code":"model_not_found"}}', { status: 404 }),
      ),
    );
    // Justo el caso de D-27: los modelos de Groq/Cerebras habían desaparecido y el error
    // sin cuerpo no dejaba ver por qué.
    await expect(openAICompatibleChat(OPTS)).rejects.toThrow(/groq_http_404: .*model_not_found/);
  });

  it('trunca el cuerpo del error a 200 caracteres', async () => {
    server.use(http.post(`${BASE}/chat/completions`, () => HttpResponse.text('x'.repeat(500), { status: 500 })));
    const err = await openAICompatibleChat(OPTS).catch((e: Error) => e);
    expect((err as Error).message.length).toBeLessThan(260);
  });
});

describe('fetchImageAsBase64 (§C-8.5)', () => {
  it('descarga la URL firmada y devuelve base64 + mime', async () => {
    server.use(
      http.get('https://firmada.test/f.jpg', () =>
        HttpResponse.arrayBuffer(new TextEncoder().encode('foto').buffer as ArrayBuffer, {
          headers: { 'content-type': 'image/png' },
        }),
      ),
    );
    const img = await fetchImageAsBase64('https://firmada.test/f.jpg');
    expect(img.mimeType).toBe('image/png');
    expect(Buffer.from(img.base64, 'base64').toString()).toBe('foto');
  });

  it('lanza si la descarga falla', async () => {
    server.use(http.get('https://firmada.test/f.jpg', () => HttpResponse.text('no', { status: 403 })));
    await expect(fetchImageAsBase64('https://firmada.test/f.jpg')).rejects.toThrow('image_fetch_failed_403');
  });
});
