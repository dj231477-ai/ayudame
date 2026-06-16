'use client';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '../Button';

// Captura de foto de evidencia (cámara trasera en móvil). SPEC §C-13.3 paso 5.
// Límite y MIME se validan también en backend/Storage (§C-7.3, §C-8.5).
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
