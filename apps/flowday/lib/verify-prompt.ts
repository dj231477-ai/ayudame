// Funciones puras de verificación (sin 'server-only'): testeables en aislamiento.
// SPEC §C-13.4. El `type` es enum seguro (va en system); el nombre de tarea va como userData (§C-10.5).

const BLOCK_TYPE_DESC: Record<string, string> = {
  deep: 'trabajo profundo: pantalla con código/documento, cuaderno, escritorio con trabajo visible',
  admin: 'tareas administrativas: correo, gestión, documentos',
  body: 'cuerpo/ejercicio: ropa o contexto deportivo',
  rest: 'descanso: contexto de pausa',
  review: 'revisión: lectura, planificación, notas',
};

/** VERIFY_PROMPT (§C-13.4). */
export function buildVerifyPrompt(blockType: string): string {
  const desc = BLOCK_TYPE_DESC[blockType] ?? blockType;
  return `Eres el verificador de productividad de FlowDay.
Tipo de bloque: ${blockType} (${desc}).
Analiza la imagen y decide si muestra evidencia creíble y actual de trabajo en la tarea indicada en <user_data>.
Responde SOLO con JSON: {"verified": boolean, "confidence": number(0..1), "message": string<=80}.
Criterios: deep work → pantalla con código/documento, cuaderno, escritorio con trabajo visible; ejercicio → ropa/contexto deportivo; descanso → contexto de pausa; rechaza imágenes claramente ajenas o de galería/stock; ante duda razonable, verifica.`;
}

export interface VerifyParsed {
  verified: boolean;
  confidence: number;
  message: string;
}

/** Parseo tolerante del JSON del modelo (acepta fences ```json). */
export function parseVerifyResponse(text: string): VerifyParsed {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned) as Partial<VerifyParsed>;
    return {
      verified: Boolean(obj.verified),
      confidence:
        typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0,
      message: typeof obj.message === 'string' ? obj.message.slice(0, 80) : '',
    };
  } catch {
    return { verified: false, confidence: 0, message: '' };
  }
}
