-- =============================================================================
-- Migration 108_evidence_phase  [NORMATIVO — SPEC §C-7.2, §C-13.2/§C-13.3, D-10]
-- Doble foto por bloque (inicio + fin): distingue qué mitad del ciclo verificó cada fila.
-- 'end' es el default para no romper filas ya insertadas por el flujo de una sola foto
-- anterior a esta migración. verification_queue también necesita la columna: si una foto
-- de INICIO se encola por ai_vision_exhausted (§C-14.3), el drenado debe reprocesarla como
-- 'start' (awaiting_start_photo), no asumir 'end' (awaiting_photo) por defecto.
-- =============================================================================

alter table evidence add column phase text not null default 'end'
  check (phase in ('start', 'end'));

alter table verification_queue add column phase text not null default 'end'
  check (phase in ('start', 'end'));
