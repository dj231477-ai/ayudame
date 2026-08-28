import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test-utils/msw/server';
import { sendWhatsAppText, fetchWhatsAppMedia } from './whatsapp';

// SPEC §C-13.10, AR-6: canal WhatsApp opt-in. Solo texto libre dentro de la ventana de 24 h,
// nunca plantillas. Backend-only: el token jamás llega al cliente (INV-4).
// Red simulada con MSW (§C-18.4).

const GRAPH = 'https://graph.facebook.com/v22.0';
const PHONE_ID = '123456';

beforeEach(() => {
  process.env.WHATSAPP_PHONE_NUMBER_ID = PHONE_ID;
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
});
afterEach(() => {
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
});

describe('sendWhatsAppText (§C-13.10)', () => {
  it('manda el mensaje al phone_number_id configurado y devuelve ok', async () => {
    let body: unknown;
    let auth: string | null = null;
    server.use(
      http.post(`${GRAPH}/${PHONE_ID}/messages`, async ({ request }) => {
        auth = request.headers.get('authorization');
        body = await request.json();
        return HttpResponse.json({ messages: [{ id: 'wamid.1' }] });
      }),
    );

    expect(await sendWhatsAppText('34600111222', 'hola')).toEqual({ ok: true });
    expect(auth).toBe('Bearer tok');
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '34600111222',
      type: 'text',
      text: { body: 'hola' },
    });
  });

  it('nunca usa plantillas: el tipo siempre es "text" (AR-6)', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`${GRAPH}/${PHONE_ID}/messages`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
    );
    await sendWhatsAppText('34600111222', 'x');
    expect(body.type).toBe('text');
    expect(body.template).toBeUndefined();
  });

  it('sin configuración no sale a la red y devuelve ok:false', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    // Sin handler declarado: cualquier petición rompería el test.
    expect(await sendWhatsAppText('34600111222', 'hola')).toEqual({ ok: false });
  });

  it('un error HTTP de Meta degrada a ok:false sin lanzar', async () => {
    server.use(http.post(`${GRAPH}/${PHONE_ID}/messages`, () => HttpResponse.text('nope', { status: 401 })));
    expect(await sendWhatsAppText('34600111222', 'hola')).toEqual({ ok: false });
  });

  it('un fallo de red degrada a ok:false sin lanzar', async () => {
    server.use(http.post(`${GRAPH}/${PHONE_ID}/messages`, () => HttpResponse.error()));
    expect(await sendWhatsAppText('34600111222', 'hola')).toEqual({ ok: false });
  });
});

describe('fetchWhatsAppMedia (§C-13.10)', () => {
  it('resuelve la URL temporal y descarga los bytes', async () => {
    server.use(
      http.get(`${GRAPH}/media-1`, () =>
        HttpResponse.json({ url: 'https://lookaside.fb.test/foto.jpg', mime_type: 'image/png' }),
      ),
      http.get('https://lookaside.fb.test/foto.jpg', () =>
        HttpResponse.arrayBuffer(new TextEncoder().encode('bytes-de-la-foto').buffer as ArrayBuffer),
      ),
    );

    const media = await fetchWhatsAppMedia('media-1');
    expect(media?.mimeType).toBe('image/png');
    expect(media?.bytes.toString()).toBe('bytes-de-la-foto');
  });

  it('sin mime_type asume image/jpeg', async () => {
    server.use(
      http.get(`${GRAPH}/media-1`, () => HttpResponse.json({ url: 'https://lookaside.fb.test/f.jpg' })),
      http.get('https://lookaside.fb.test/f.jpg', () => HttpResponse.arrayBuffer(new ArrayBuffer(3))),
    );
    expect((await fetchWhatsAppMedia('media-1'))?.mimeType).toBe('image/jpeg');
  });

  it('null si la metadata falla', async () => {
    server.use(http.get(`${GRAPH}/media-1`, () => HttpResponse.text('no', { status: 404 })));
    expect(await fetchWhatsAppMedia('media-1')).toBeNull();
  });

  it('null si la metadata no trae url (no intenta descargar nada)', async () => {
    server.use(http.get(`${GRAPH}/media-1`, () => HttpResponse.json({ mime_type: 'image/jpeg' })));
    expect(await fetchWhatsAppMedia('media-1')).toBeNull();
  });

  it('null si la descarga del fichero falla', async () => {
    server.use(
      http.get(`${GRAPH}/media-1`, () => HttpResponse.json({ url: 'https://lookaside.fb.test/f.jpg' })),
      http.get('https://lookaside.fb.test/f.jpg', () => HttpResponse.text('gone', { status: 410 })),
    );
    expect(await fetchWhatsAppMedia('media-1')).toBeNull();
  });

  it('sin configuración devuelve null sin tocar la red', async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(await fetchWhatsAppMedia('media-1')).toBeNull();
  });
});
