import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de usage para controlar la cuota diaria sin DB. SPEC §C-18.2.
vi.mock('./usage', () => ({
  getDailyUsage: vi.fn(),
  incrementUsage: vi.fn(),
  PROVIDER_LIMIT_UNIT: {
    gemini: 'requests',
    groq: 'requests',
    cerebras: 'tokens',
    minimax: 'requests',
  },
}));

// Mock de flags para controlar el fallback de pago (D-2/D-9) sin DB.
vi.mock('../flags', () => ({
  isFlagEnabled: vi.fn(),
}));

import { getAIProvider } from './router';
import { getDailyUsage } from './usage';
import { isFlagEnabled } from '../flags';
import { AppError } from '../errors';

const mockUsage = vi.mocked(getDailyUsage);
const mockFlag = vi.mocked(isFlagEnabled);

describe('getAIProvider (§C-10.3, INV-7, D-9)', () => {
  beforeEach(() => {
    mockUsage.mockReset();
    mockFlag.mockReset();
    mockFlag.mockResolvedValue(false);
  });

  // --- Visión ---------------------------------------------------------------

  it('visión siempre usa Gemini, sin importar cuota', async () => {
    mockUsage.mockResolvedValue(99_999); // cuota agotada: no importa
    const p = await getAIProvider('vision');
    expect(p.provider).toBe('gemini');
    expect(p.model).toBe('gemini-3.6-flash');
  });

  it('visión nunca usa Ollama (INV-7) — el proveedor ni existe ya (D-9)', async () => {
    mockUsage.mockResolvedValue(99_999);
    const p = await getAIProvider('vision');
    expect(p.provider).not.toBe('ollama');
  });

  // --- Texto ------------------------------------------------------------

  it('texto usa Groq bajo cuota', async () => {
    mockUsage.mockResolvedValue(0);
    expect((await getAIProvider('text')).provider).toBe('groq');
  });

  it('texto: Groq agotado ⇒ Cerebras', async () => {
    mockUsage.mockImplementation(async (provider) => (provider === 'groq' ? 9_999 : 0));
    expect((await getAIProvider('text')).provider).toBe('cerebras');
  });

  it('texto: Groq y Cerebras agotados, flag de pago ON ⇒ MiniMax M3 (D-9)', async () => {
    mockUsage.mockResolvedValue(10_000_000);
    mockFlag.mockResolvedValue(true);
    const p = await getAIProvider('text');
    expect(p.provider).toBe('minimax');
    expect(p.model).toBe('MiniMax-M3');
  });

  it('texto: Groq y Cerebras agotados, flag de pago OFF ⇒ ai_text_exhausted sin Ollama (D-9)', async () => {
    mockUsage.mockResolvedValue(10_000_000);
    mockFlag.mockResolvedValue(false);
    await expect(getAIProvider('text')).rejects.toThrow(AppError);
    await expect(getAIProvider('text')).rejects.toMatchObject({ code: 'ai_text_exhausted' });
  });
});
