-- =============================================================================
-- Storage: bucket de evidencia  [NORMATIVO — SPEC §C-7.3 + §C-8.5]
-- Bucket PRIVADO. Estructura de ruta: evidence-photos/{user_id}/{block_id}/{timestamp}.jpg
-- Límite: 5 MB. MIME: JPEG/PNG/WebP.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence-photos', 'evidence-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Políticas de acceso [SPEC §C-8.5]: el usuario solo opera dentro de su carpeta {user_id}/...
-- El verificador (backend) lee vía URL firmada de corta duración con service_role (bypass RLS),
-- nunca expone URL pública (§C-8.5, S4).

create policy "evidence_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'evidence-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "evidence_select_own" on storage.objects
  for select
  using (
    bucket_id = 'evidence-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
