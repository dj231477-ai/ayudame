import { vi } from 'vitest';

// =============================================================================
// Mock reutilizable del cliente Supabase (service_role) para tests de unidad de los
// módulos de lib/* y app/**. No toca ninguna base real: registra las mutaciones en `log`
// y devuelve resultados preconfigurados por tabla. Soporta:
//   - cadenas: .from(t).select().eq().eq().maybeSingle()/.single()/await
//   - mutaciones: .insert/.update/.upsert/.delete (registradas en log)
//   - RPC: .rpc(name, args)
//   - storage: .storage.from(bucket).createSignedUrl()
//   - auth.signOut()
// `tableResults[table]` puede ser un objeto { data, error } o un ARRAY consumido FIFO
// (para tablas leídas varias veces con resultados distintos en un mismo flujo).
// =============================================================================

export interface MockResult {
  data?: unknown;
  error?: unknown;
}

export interface MockConfig {
  tableResults?: Record<string, MockResult | MockResult[]>;
  rpcResults?: Record<string, MockResult>;
  signedUrl?: MockResult;
  /** Resultados de storage.from(bucket).list(prefix): por prefijo, array FIFO o único. */
  storageList?: Record<string, MockResult | MockResult[]>;
  storageRemove?: MockResult;
}

export interface LogEntry {
  table?: string;
  op: 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';
  name?: string;
  payload?: unknown;
  opts?: unknown;
  args?: unknown;
}

export interface MockClient {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  storage: { from: ReturnType<typeof vi.fn> };
  auth: { signOut: ReturnType<typeof vi.fn> };
  log: LogEntry[];
  removed: string[][];
}

const DEFAULT: MockResult = { data: null, error: null };

export function createMockClient(config: MockConfig = {}): MockClient {
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
    const passthrough = [
      'select', 'eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'order', 'limit', 'is', 'not', 'or', 'range',
    ];
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
    // thenable: `await db.from(t).select()...` resuelve al resultado de la tabla.
    b.then = (onF: (v: MockResult) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(nextResult(table)).then(onF, onR);
    return b;
  }

  const storageList = config.storageList ?? {};
  const listCursors: Record<string, number> = {};
  const removed: string[][] = [];

  function nextList(prefix: string): MockResult {
    const cfg = storageList[prefix];
    if (cfg === undefined) return { data: [], error: null };
    if (Array.isArray(cfg)) {
      const i = listCursors[prefix] ?? 0;
      listCursors[prefix] = i + 1;
      return cfg[Math.min(i, cfg.length - 1)] ?? { data: [], error: null };
    }
    return cfg;
  }

  return {
    from: vi.fn((table: string) => builder(table)),
    rpc: vi.fn((name: string, args: unknown) => {
      log.push({ op: 'rpc', name, args });
      return Promise.resolve(rpcResults[name] ?? DEFAULT);
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(() =>
          Promise.resolve(config.signedUrl ?? { data: { signedUrl: 'https://signed.example/x.jpg' }, error: null }),
        ),
        list: vi.fn((prefix: string) => Promise.resolve(nextList(prefix))),
        remove: vi.fn((paths: string[]) => {
          removed.push(paths);
          return Promise.resolve(config.storageRemove ?? { data: paths, error: null });
        }),
      })),
    },
    auth: { signOut: vi.fn(() => Promise.resolve({ error: null })) },
    log,
    removed,
  };
}
