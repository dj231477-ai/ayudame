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

describe('getAIProvider (§C-10.3, INV-7)', () => {
  beforeEach(() => {
    mockUsage.mockReset();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('visión usa Gemini bajo cuota', async () => {
    mockUsage.mockResolvedValue(0);
    expect((await getAIProvider('vision')).provider).toBe('gemini');
  });

  it('visión cae a Claude si Gemini agotado y hay ANTHROPIC_API_KEY', async () => {
    mockUsage.mockResolvedValue(99_999);
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect((await getAIProvider('vision')).provider).toBe('claude');
  });

  it('visión agotada sin Claude ⇒ ai_vision_exhausted (NUNCA Ollama, INV-7)', async () => {
    mockUsage.mockResolvedValue(99_999);
    await expect(getAIProvider('vision')).rejects.toMatchObject({ code: 'ai_vision_exhausted' });
  });

  it('texto usa Groq bajo cuota', async () => {
    mockUsage.mockResolvedValue(0);
    expect((await getAIProvider('text')).provider).toBe('groq');
  });

  it('texto: Groq agotado ⇒ Cerebras', async () => {
    mockUsage.mockImplementation(async (provider) => (provider === 'groq' ? 9_999 : 0));
    expect((await getAIProvider('text')).provider).toBe('cerebras');
  });

  it('texto: Groq y Cerebras agotados ⇒ Ollama (best-effort)', async () => {
    mockUsage.mockResolvedValue(10_000_000);
    expect((await getAIProvider('text')).provider).toBe('ollama');
  });
});
