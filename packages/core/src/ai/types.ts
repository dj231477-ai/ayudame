// =============================================================================
// Tipos del router de IA  [NORMATIVO — SPEC §C-10.2]
// AIProviderName debe coincidir con el union de supabase/types (usage_log.provider).
// =============================================================================

export type AIModality = 'vision' | 'text';
export type AIProviderName = 'gemini' | 'groq' | 'cerebras' | 'ollama' | 'claude';

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
