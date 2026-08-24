'use client';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '../Button';

// Captura de foto de evidencia (cámara trasera en móvil). SPEC §C-13.3 paso 5.
// Límite y MIME se validan también en backend/Storage (§C-7.3, §C-8.5).
// Guía de privacidad visible siempre antes de capturar (§C-13.9, [NORMATIVO]):
// minimiza qué datos personales puede contener la foto que se envía a IA de terceros.
const PRIVACY_TIP =
  'Por tu seguridad: no muestres tu rostro ni el de otras personas, documentos de identidad, ' +
  'matrículas, direcciones o pantallas con información bancaria o médica. Enfoca solo lo ' +
  'necesario para mostrar la tarea.';

export interface PhotoCaptureProps {
  onCapture: (file: File) => void;
  disabled?: boolean;
  busy?: boolean;
}

export function PhotoCapture({ onCapture, disabled, busy }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    onCapture(file);
  };

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{PRIVACY_TIP}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handle}
      />
      {preview ? (
        <img src={preview} alt="Vista previa de evidencia" className="w-full rounded-xl" />
      ) : null}
      <Button
        variant="primary"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Verificando…' : preview ? 'Tomar otra foto' : 'Tomar foto'}
      </Button>
    </div>
  );
}
