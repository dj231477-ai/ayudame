'use client';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorCard, Timer, PhotoCapture } from '@flowday/ui';
import type { BlockType } from '@flowday/core/supabase/types';
import { createClient } from '@/lib/supabase/client';
import { apiFetch, ApiError } from '@/lib/api/client';
import { useBlockTimer } from '@/hooks/useBlockTimer';
import type { Block } from '@/lib/types';

// Tablero del día: cubre el ciclo completo del bloque (§C-13.2/§C-13.3). DoD Fase 1.
const TYPES: readonly BlockType[] = ['deep', 'admin', 'body', 'rest', 'review'];
const DOT: Record<BlockType, string> = {
  deep: 'bg-deep',
  admin: 'bg-admin',
  body: 'bg-body',
  rest: 'bg-rest',
  review: 'bg-review',
};

export function DayBoard({
  userId,
  date,
  initialBlocks,
}: {
  userId: string;
  date: string;
  initialBlocks: Block[];
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function reload() {
    setError(null);
    try {
      const data = await apiFetch<{ blocks: Block[] }>(`/api/v1/blocks?date=${date}`);
      setBlocks(data.blocks);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    }
  }

  async function createBlock(form: FormData) {
    setError(null);
    setCreating(true);
    try {
      const created = await apiFetch<Block>('/api/v1/blocks', {
        method: 'POST',
        body: JSON.stringify({
          date,
          start_time: String(form.get('start_time')),
          end_time: String(form.get('end_time')),
          label: String(form.get('label')),
          type: String(form.get('type')),
        }),
      });
      setBlocks((b) => [...b, created].sort((a, z) => a.start_time.localeCompare(z.start_time)));
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function transition(id: string, status: Block['status']) {
    setError(null);
    try {
      const updated = await apiFetch<Block>(`/api/v1/blocks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setBlocks((b) => b.map((x) => (x.id === id ? updated : x)));
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    }
  }

  function markVerified(id: string) {
    setBlocks((b) => b.map((x) => (x.id === id ? { ...x, status: 'verified' } : x)));
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorCard message={error} onRetry={reload} /> : null}

      <form action={createBlock} className="grid grid-cols-2 gap-2">
        <input
          name="label"
          required
          placeholder="¿Qué vas a hacer?"
          className="col-span-2 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input name="start_time" type="time" required className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
        <input name="end_time" type="time" required className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" />
        <select name="type" className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={creating}>
          {creating ? 'Creando…' : 'Añadir bloque'}
        </Button>
      </form>

      {blocks.length === 0 ? (
        <EmptyState title="Sin bloques hoy" description="Crea tu primer bloque para empezar." />
      ) : (
        <ul className="space-y-3">
          {blocks.map((b) => (
            <li key={b.id}>
              <BlockRow
                userId={userId}
                block={b}
                onTransition={transition}
                onVerified={markVerified}
                onError={setError}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockRow({
  userId,
  block,
  onTransition,
  onVerified,
  onError,
}: {
  userId: string;
  block: Block;
  onTransition: (id: string, status: Block['status']) => void;
  onVerified: (id: string) => void;
  onError: (msg: string | null) => void;
}) {
  const remaining = useBlockTimer(block.date, block.status === 'active' ? block.end_time : null);
  const [busy, setBusy] = useState(false);

  async function uploadAndVerify(file: File) {
    onError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const path = `${userId}/${block.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('evidence-photos')
        .upload(path, file, { contentType: file.type });
      if (upErr) {
        onError('No se pudo subir la foto.');
        return;
      }
      const res = await apiFetch<{ verified: boolean; message: string }>('/api/v1/verify-photo', {
        method: 'POST',
        body: JSON.stringify({ block_id: block.id, photo_path: path }),
      });
      if (res.verified) onVerified(block.id);
      else onError(res.message || 'La foto no fue verificada. Intenta con otra.');
    } catch (e) {
      if (e instanceof ApiError) onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{block.label}</p>
          <p className="text-xs text-neutral-500">
            {block.start_time}–{block.end_time} · {block.type} · {block.status}
          </p>
        </div>
        <span className={`h-3 w-3 rounded-full ${DOT[block.type]}`} aria-hidden="true" />
      </div>

      {block.status === 'active' ? (
        <div className="mt-3">
          <Timer remainingSeconds={remaining} label="Tiempo restante" />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {block.status === 'pending' ? (
          <Button onClick={() => onTransition(block.id, 'active')}>Iniciar</Button>
        ) : null}
        {block.status === 'active' ? (
          <>
            <Button onClick={() => onTransition(block.id, 'awaiting_photo')}>Terminar</Button>
            <Button variant="ghost" onClick={() => onTransition(block.id, 'skipped')}>
              Saltar
            </Button>
          </>
        ) : null}
        {block.status === 'awaiting_photo' ? (
          <div className="w-full space-y-2">
            <PhotoCapture onCapture={uploadAndVerify} busy={busy} />
            <Button variant="ghost" onClick={() => onTransition(block.id, 'skipped')}>
              Saltar
            </Button>
          </div>
        ) : null}
        {block.status === 'verified' ? (
          <span className="text-sm font-medium text-green-600">✓ Verificado</span>
        ) : null}
        {block.status === 'skipped' ? (
          <span className="text-sm text-neutral-500">Saltado</span>
        ) : null}
      </div>
    </Card>
  );
}
