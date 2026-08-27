import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '@flowday/core/errors';
import { createMockClient, type MockClient } from '../tests/helpers/supabase-mock';

// SPEC §C-11.3, §C-13.3, §C-14.3, D-10, D-13. Flujo de verificación de foto: pre-cobro vía
// callAI, inserción de evidencia, transición de bloque según `phase` y streak, encolado al
// agotarse la visión, reembolso si falla el insert de evidencia, y completado de la tarea en
// Google Tasks. callAI, Google Tasks y Supabase están mockeados.

let mockClient: MockClient;
const callAI = vi.fn((..._a: unknown[]): Promise<unknown> => Promise.resolve(undefined));
const refundCredits = vi.fn((..._a: unknown[]) => Promise.resolve());
const completeTask = vi.fn((..._a: unknown[]): Promise<boolean> => Promise.resolve(true));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mockClient }));
vi.mock('@/lib/google/tasks', () => ({
  completeTask: (userId: string, taskId: string) => completeTask(userId, taskId),
}));
vi.mock('@flowday/core/ai/router', () => ({
  callAI: (userId: string, action: string, req: unknown) => callAI(userId, action, req),
}));
vi.mock('@flowday/core/credits/check', () => ({
  refundCredits: (userId: string, cost: number, logId: string) => refundCredits(userId, cost, logId),
}));

import { verifyPhoto } from './verify-photo';

const baseInput = {
  userId: 'u1',
  blockId: 'b1',
  photoPath: 'u1/b1/123.jpg',
  blockType: 'deep',
  taskName: 'Escribir el informe',
};

const OK_AI = { text: '{"verified":true,"confidence":0.9,"message":"ok"}', provider: 'gemini', usageLogId: 'ul1' };

beforeEach(() => {
  callAI.mockReset();
  refundCredits.mockClear();
  completeTask.mockClear();
  completeTask.mockResolvedValue(true);
  mockClient = createMockClient({
    tableResults: {
      credits: { data: { balance: 0.294 } },
      profiles: { data: { streak: 2, timezone: 'America/Bogota' } },
      evidence: [{ error: null }, { data: [] }], // insert (ok) luego select de updateStreak
    },
  });
});

describe('verifyPhoto (§C-11.3)', () => {
  it('foto verificada: inserta evidencia, marca el bloque verified y devuelve el saldo', async () => {
    callAI.mockResolvedValue({
      text: '{"verified":true,"confidence":0.9,"message":"ok"}',
      provider: 'gemini',
      usageLogId: 'ul1',
    });
    const res = await verifyPhoto(baseInput);
    expect(res.verified).toBe(true);
    expect(res.confidence).toBe(0.9);
    expect(res.balance).toBe(0.294);
    expect(mockClient.log.find((l) => l.op === 'insert' && l.table === 'evidence')).toBeDefined();
    expect(mockClient.log.find((l) => l.op === 'update' && l.table === 'blocks')?.payload).toEqual({
      status: 'verified',
    });
  });

  it('foto rechazada: NO transiciona el bloque a verified', async () => {
    callAI.mockResolvedValue({
      text: '{"verified":false,"confidence":0.1,"message":"no"}',
      provider: 'gemini',
      usageLogId: 'ul2',
    });
    const res = await verifyPhoto(baseInput);
    expect(res.verified).toBe(false);
    expect(mockClient.log.find((l) => l.op === 'update' && l.table === 'blocks')).toBeUndefined();
  });

  it('visión agotada (no desde cola): encola en verification_queue y propaga sin cobrar', async () => {
    callAI.mockRejectedValue(new AppError('ai_vision_exhausted'));
    await expect(verifyPhoto(baseInput)).rejects.toThrow('ai_vision_exhausted');
    expect(mockClient.log.find((l) => l.op === 'insert' && l.table === 'verification_queue')).toBeDefined();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it('visión agotada DESDE la cola (fromQueue): NO re-encola', async () => {
    callAI.mockRejectedValue(new AppError('ai_vision_exhausted'));
    await expect(verifyPhoto({ ...baseInput, fromQueue: true })).rejects.toThrow('ai_vision_exhausted');
    expect(mockClient.log.find((l) => l.table === 'verification_queue')).toBeUndefined();
  });

  it('si falla el insert de evidencia: reembolsa el crédito y lanza internal (§C-9.6)', async () => {
    callAI.mockResolvedValue({
      text: '{"verified":true,"confidence":0.9,"message":"ok"}',
      provider: 'gemini',
      usageLogId: 'ul3',
    });
    mockClient = createMockClient({
      tableResults: { evidence: { error: { code: 'fail' } } },
    });
    await expect(verifyPhoto(baseInput)).rejects.toThrow('internal');
    expect(refundCredits).toHaveBeenCalledWith('u1', expect.any(Number), 'ul3');
  });

  it('si falla la URL firmada del Storage: lanza internal sin llamar a la IA', async () => {
    mockClient = createMockClient({ signedUrl: { data: null, error: { message: 'x' } } });
    await expect(verifyPhoto(baseInput)).rejects.toThrow('internal');
    expect(callAI).not.toHaveBeenCalled();
  });
});

// D-10, §C-13.2/§C-13.3: la foto de inicio lleva el bloque a `active` y NO cuenta para el streak.
describe('verifyPhoto phase="start" (D-10)', () => {
  it('verificada: transiciona a active, sin tocar el streak', async () => {
    callAI.mockResolvedValue(OK_AI);
    const res = await verifyPhoto({ ...baseInput, phase: 'start' });
    expect(res.verified).toBe(true);
    expect(mockClient.log.find((l) => l.op === 'update' && l.table === 'blocks')?.payload).toEqual({
      status: 'active',
    });
    // El streak vive en profiles: la fase de inicio no debe escribir ahí.
    expect(mockClient.log.find((l) => l.op === 'update' && l.table === 'profiles')).toBeUndefined();
  });

  it('registra la evidencia con phase="start" (INV-11, append-only)', async () => {
    callAI.mockResolvedValue(OK_AI);
    await verifyPhoto({ ...baseInput, phase: 'start' });
    const ev = mockClient.log.find((l) => l.op === 'insert' && l.table === 'evidence');
    expect((ev?.payload as { phase: string }).phase).toBe('start');
  });

  it('nunca completa la tarea de Google Tasks en la fase de inicio', async () => {
    callAI.mockResolvedValue(OK_AI);
    await verifyPhoto({ ...baseInput, phase: 'start', taskId: 'lista1:tarea1' });
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('rechazada: no transiciona a active', async () => {
    callAI.mockResolvedValue({ text: '{"verified":false,"confidence":0.1,"message":"no"}', provider: 'gemini', usageLogId: 'ul9' });
    await verifyPhoto({ ...baseInput, phase: 'start' });
    expect(mockClient.log.find((l) => l.op === 'update' && l.table === 'blocks')).toBeUndefined();
  });

  it('sin phase explícita usa "end" (compatibilidad con clientes previos a 2.1.2)', async () => {
    callAI.mockResolvedValue(OK_AI);
    await verifyPhoto(baseInput);
    const ev = mockClient.log.find((l) => l.op === 'insert' && l.table === 'evidence');
    expect((ev?.payload as { phase: string }).phase).toBe('end');
  });
});

// D-13: al verificar la foto de cierre se completa la tarea en Google Tasks (best-effort).
describe('verifyPhoto + Google Tasks (D-13)', () => {
  it('con taskId y foto de cierre verificada: completa la tarea', async () => {
    callAI.mockResolvedValue(OK_AI);
    await verifyPhoto({ ...baseInput, taskId: 'lista1:tarea1' });
    expect(completeTask).toHaveBeenCalledWith('u1', 'lista1:tarea1');
  });

  it('sin taskId no llama a Google Tasks', async () => {
    callAI.mockResolvedValue(OK_AI);
    await verifyPhoto(baseInput);
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('no completa la tarea si la foto fue rechazada', async () => {
    callAI.mockResolvedValue({ text: '{"verified":false,"confidence":0.1,"message":"no"}', provider: 'gemini', usageLogId: 'ul8' });
    await verifyPhoto({ ...baseInput, taskId: 'lista1:tarea1' });
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('un fallo de Google Tasks no revierte la verificación ya cobrada (INV-11)', async () => {
    callAI.mockResolvedValue(OK_AI);
    completeTask.mockRejectedValue(new Error('google caída'));
    const res = await verifyPhoto({ ...baseInput, taskId: 'lista1:tarea1' });
    expect(res.verified).toBe(true);
    expect(refundCredits).not.toHaveBeenCalled();
  });
});
