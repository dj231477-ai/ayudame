import 'server-only';
// Re-exporta el cliente service_role SOLO para backend (INV-4). 'server-only' garantiza
// que un import accidental desde un componente cliente falle el build.
export { createServiceClient } from '@flowday/core/auth';
