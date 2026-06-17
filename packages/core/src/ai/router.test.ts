import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de usage para controlar la cuota diaria sin DB. SPEC §C-18.2.
vi.mock('./usage', () => ({
  getDailyUsage: vi.fn(),
  incrementUsage: vi.fn(),
  PROVIDER_LIMIT_UNIT: {
    gemini: 'requests',
    groq: 'requests',
    cerebras: 'tokens',
    ollama: 'requests',
    claude: 'requests',
  },
}));

import { getAIProvider } from './router';
import { getDailyUsage } from './usage';

const mockUsage = vi.mocked(getDailyUsage);
const FOUNDER_ID = 'founder-uuid-test';

describe('getAIProvider (§C-10.3, INV-7)', () => {
  beforeEach(() => {
    mockUsage.mockReset();
    delete process.env.FOUNDER_USER_ID;
  });

  // --- Visión ---------------------------------------------------------------

  it('visión siempre usa Gemini, sin importar cuota', async () => {
    mockUsage.mockResolvedValue(99_999); // cuota agotada: no importa
    const p = await getAIProvider('vision');
    expect(p.provider).toBe('gemini');
    expect(p.model).toBe('gemini-2.5-flash');
  });

  it('visión siempre Gemini también para el fundador (INV-7)', async () => {
    process.env.FOUNDER_USER_ID = FOUNDER_ID;
    mockUsage.mockResolvedValue(0);
    expect((await getAIProvider('vision', FOUNDER_ID)).provider).toBe('gemini');
  });

  it('visión nunca usa Ollama (INV-7)', async () => {
    mockUsage.mockResolvedValue(99_999);
    const p = await getAIProvider('vision');
    expect(p.provider).not.toBe('ollama');
  });

  // --- Texto fundador -------------------------------------------------------

  it('texto fundador ⇒ Ollama qwen3:8b directo', async () => {
    process.env.FOUNDER_USER_ID = FOUNDER_ID;
    const p = await getAIProvider('text', FOUNDER_ID);
    expect(p.provider).toBe('ollama');
    expect(p.model).toBe('qwen3:8b');
    expect(mockUsage).not.toHaveBeenCalled(); // no consume cuota cloud
  });

  it('texto fundador sin FOUNDER_USER_ID en env ⇒ router normal', async () => {
    // FOUNDER_USER_ID no definido: el UUID no activa el atajo
    mockUsage.mockResolvedValue(0);
    expect((await getAIProvider('text', FOUNDER_ID)).provider).toBe('groq');
  });

  // --- Texto usuarios -------------------------------------------------------

  it('texto usuario usa Groq bajo cuota', async () => {
    mockUsage.mockResolvedValue(0);
    expect((await getAIProvider('text', 'other-user')).provider).toBe('groq');
  });

  it('texto usuario: Groq agotado ⇒ Cerebras', async () => {
    mockUsage.mockImplementation(async (provider) => (provider === 'groq' ? 9_999 : 0));
    expect((await getAIProvider('text', 'other-user')).provider).toBe('cerebras');
  });

  it('texto usuario: Groq y Cerebras agotados ⇒ Ollama qwen3:8b (best-effort)', async () => {
    mockUsage.mockResolvedValue(10_000_000);
    const p = await getAIProvider('text', 'other-user');
    expect(p.provider).toBe('ollama');
    expect(p.model).toBe('qwen3:8b');
  });

  it('texto sin userId ⇒ router normal (no activa fundador)', async () => {
    process.env.FOUNDER_USER_ID = FOUNDER_ID;
    mockUsage.mockResolvedValue(0);
    expect((await getAIProvider('text')).provider).toBe('groq');
  });
});
