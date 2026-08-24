// =============================================================================
// Tipos del router de IA  [NORMATIVO — SPEC §C-10.2]
// AIProviderName debe coincidir con el union de supabase/types (usage_log.provider).
// =============================================================================

export type AIModality = 'vision' | 'text';
// Ollama descartado (D-9, §C-25): latencia inaceptable. MiniMax M3 es el único fallback de
// pago, tanto para visión (D-2, tras 50 usuarios) como para texto (D-9, sin ese umbral: sin
// Ollama no queda alternativa gratuita cuando Groq+Cerebras agotan cuota el mismo día).
export type AIProviderName = 'gemini' | 'groq' | 'cerebras' | 'minimax';

export interface AIProvider {
  provider: AIProviderName;
  model: string;
}

export interface AIRequest {
  modality: AIModality;
  system: string; // instrucción (sin datos de usuario)
  userData?: string; // datos de usuario (delimitados; §C-10.5)
  imageUrl?: string; // URL firmada de corta duración (visión)
  maxTokens?: number;
}

export interface AIResponse {
  text: string;
  provider: AIProviderName;
  model: string;
  tokens: number;
}

/** Firma común de cada provider en providers/<name>.ts. */
export type ProviderDispatch = (
  model: string,
  prompt: string,
  req: AIRequest,
) => Promise<AIResponse>;
