import { test, expect } from '@playwright/test';
import path from 'node:path';

// Flujo central (§C-13.3, §C-18.1): crear bloque -> activo -> awaiting_photo ->
// subir foto -> verify-photo (IA real, tier gratis de Gemini) -> verificado.
// Ya autenticado vía storageState (global-setup.ts) contra el proyecto Supabase
// de desarrollo (.env.local) — sin pasar por el login real de Google OAuth.

test('ciclo completo de un bloque hasta verificado', async ({ page }) => {
  const label = `E2E deep work ${Date.now()}`;

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /^Hola/ })).toBeVisible();

  // Crear bloque tipo 'deep' (la foto de fixture simula pantalla de código, §C-13.4).
  await page.getByPlaceholder('¿Qué vas a hacer?').fill(label);
  await page.locator('input[name="start_time"]').fill('06:00');
  await page.locator('input[name="end_time"]').fill('09:00');
  await page.locator('select[name="type"]').selectOption('deep');
  await page.getByRole('button', { name: 'Añadir bloque' }).click();

  const blockCard = page.locator('li', { hasText: label });
  await expect(blockCard).toBeVisible({ timeout: 10_000 });

  // pending -> active
  await blockCard.getByRole('button', { name: 'Iniciar' }).click();
  await expect(blockCard.getByRole('button', { name: 'Terminar' })).toBeVisible({ timeout: 10_000 });

  // active -> awaiting_photo
  await blockCard.getByRole('button', { name: 'Terminar' }).click();
  await expect(blockCard.locator('input[type="file"]')).toBeAttached({ timeout: 10_000 });

  // Sube la foto directo al <input> oculto (no hay picker de OS que automatizar).
  const fixture = path.resolve(__dirname, 'fixtures/evidence.jpg');
  await blockCard.locator('input[type="file"]').setInputFiles(fixture);

  // Sube a Storage + llama a /api/v1/verify-photo (IA real) -> puede tardar unos segundos.
  await expect(blockCard.getByText('✓ Verificado')).toBeVisible({ timeout: 30_000 });
});
