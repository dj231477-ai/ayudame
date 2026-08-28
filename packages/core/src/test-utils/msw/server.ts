import { setupServer } from 'msw/node';

// SPEC §C-18.4: servidor MSW compartido por la suite de @flowday/core.
// Sin handlers por defecto: cada test declara los suyos con `server.use(...)`.
export const server = setupServer();
