import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

// SPEC §C-18.4: MSW activo en toda la suite de @flowday/core.
// Estricto: una petición de red no declarada rompe el test en vez de salir a internet.
// Aquí no hay excepciones — a diferencia de apps/flowday, core no tiene tests de integración
// contra servicios reales.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
