import { vi } from 'vitest';

// Mock encadenable del cliente Supabase para tests de @flowday/core. Excluido de la cobertura
// (ver vitest.config.ts: coverage.exclude 'src/test-utils/**'). Mismo contrato que el helper
// de la app: registra mutaciones en `log` y devuelve resultados por tabla (objeto o array FIFO).

export interface MockResult {
  data?: unknown;
  error?: unknown;
}

export interface MockConfig {
  tableResults?: Record<string, MockResult | MockResult[]>;
  rpcResults?: Record<string, MockResult>;
}

export interface LogEntry {
  table?: string;
  op: 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';
  name?: string;
  payload?: unknown;
  opts?: unknown;
  args?: unknown;
}

const DEFAULT: MockResult = { data: null, error: null };

export function createMockClient(config: MockConfig = {}) {
  const log: LogEntry[] = [];
  const tableResults = config.tableResults ?? {};
  const rpcResults = config.rpcResults ?? {};
  const cursors: Record<string, number> = {};

  function nextResult(table: string): MockResult {
    const cfg = tableResults[table];
    if (cfg === undefined) return DEFAULT;
    if (Array.isArray(cfg)) {
      const i = cursors[table] ?? 0;
      cursors[table] = i + 1;
      return cfg[Math.min(i, cfg.length - 1)] ?? DEFAULT;
    }
    return cfg;
  }

  function builder(table: string) {
    const passthrough = ['select', 'eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'order', 'limit', 'is'];
    const b: Record<string, unknown> = {};
    for (const m of passthrough) b[m] = vi.fn(() => b);
    b.insert = vi.fn((payload: unknown) => {
      log.push({ table, op: 'insert', payload });
      return b;
    });
    b.update = vi.fn((payload: unknown) => {
      log.push({ table, op: 'update', payload });
      return b;
    });
    b.upsert = vi.fn((payload: unknown, opts: unknown) => {
      log.push({ table, op: 'upsert', payload, opts });
      return b;
    });
    b.delete = vi.fn(() => {
      log.push({ table, op: 'delete' });
      return b;
    });
    b.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
    b.single = vi.fn(() => Promise.resolve(nextResult(table)));
    b.then = (onF: (v: MockResult) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(nextResult(table)).then(onF, onR);
    return b;
  }

  return {
    from: vi.fn((table: string) => builder(table)),
    rpc: vi.fn((name: string, args: unknown) => {
      log.push({ op: 'rpc', name, args });
      return Promise.resolve(rpcResults[name] ?? DEFAULT);
    }),
    log,
  };
}
