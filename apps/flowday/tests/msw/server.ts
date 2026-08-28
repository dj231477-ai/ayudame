import { setupServer } from 'msw/node';

// SPEC §C-18.4: servidor MSW compartido por toda la suite de apps/flowday.
// Se arranca sin handlers por defecto a propósito: cada test declara los suyos con
// `server.use(...)`, así queda explícito en el propio test qué respuesta de red se está
// simulando en vez de heredarla de un fichero lejano.
export const server = setupServer();
