// =============================================================================
// Supabase database types  [SPEC §C-5.2, §C-7]
// Refleja el esquema de packages/db. Regenerar con:
//   supabase gen types typescript --linked > packages/core/src/supabase/types.ts
// Mantenido a mano hasta que exista un proyecto Supabase vinculado.
// =============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Plan = 'free' | 'pro' | 'team';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';
export type BlockType = 'deep' | 'admin' | 'body' | 'rest' | 'review';
export type BlockStatus = 'pending' | 'active' | 'awaiting_photo' | 'verified' | 'skipped';
export type AIProviderName = 'gemini' | 'groq' | 'cerebras' | 'ollama' | 'claude';
export type UsageAction =
  | 'photo_verify'
  | 'chat_message'
  | 'daily_briefing'
  | 'weekly_analysis'
  | 'embedding';
export type PurchaseStatus = 'pending' | 'completed' | 'refunded';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          handle: string | null;
          plan: Plan;
          streak: number;
          timezone: string;
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          handle?: string | null;
          plan?: Plan;
          streak?: number;
          timezone?: string;
          locale?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      credits: {
        Row: {
          user_id: string;
          balance: number;
          total_purchased: number;
          total_spent: number;
          updated_at: string;
        };
        Insert: { user_id: string; balance?: number; total_purchased?: number; total_spent?: number };
        Update: Partial<Database['public']['Tables']['credits']['Insert']>;
        Relationships: [];
      };
      usage_log: {
        Row: {
          id: string;
          user_id: string;
          action: UsageAction;
          provider: AIProviderName;
          model: string | null;
          cost_real: number;
          cost_charged: number;
          margin: number;
          refunded: boolean;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: UsageAction;
          provider: AIProviderName;
          model?: string | null;
          cost_real: number;
          cost_charged: number;
          margin: number;
          refunded?: boolean;
          metadata?: Json | null;
        };
        Update: Partial<Database['public']['Tables']['usage_log']['Insert']>;
        Relationships: [];
      };
      credit_purchases: {
        Row: {
          id: string;
          user_id: string;
          package: string;
          amount_usd: number;
          credits_added: number;
          stripe_payment_id: string | null;
          status: PurchaseStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          package: string;
          amount_usd: number;
          credits_added: number;
          stripe_payment_id?: string | null;
          status?: PurchaseStatus;
        };
        Update: Partial<Database['public']['Tables']['credit_purchases']['Insert']>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
        };
        Update: Partial<Database['public']['Tables']['push_subscriptions']['Insert']>;
        Relationships: [];
      };
      ai_daily_usage: {
        Row: { provider: string; date: string; request_count: number; token_count: number };
        Insert: { provider: string; date?: string; request_count?: number; token_count?: number };
        Update: Partial<Database['public']['Tables']['ai_daily_usage']['Insert']>;
        Relationships: [];
      };
      monetization_events: {
        Row: { id: string; event_type: string; payload: Json | null; created_at: string };
        Insert: { id?: string; event_type: string; payload?: Json | null };
        Update: Partial<Database['public']['Tables']['monetization_events']['Insert']>;
        Relationships: [];
      };
      feature_flags: {
        Row: { key: string; value: Json; updated_at: string };
        Insert: { key: string; value: Json };
        Update: Partial<Database['public']['Tables']['feature_flags']['Insert']>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          user_id: string;
          plan: Plan;
          status: SubscriptionStatus;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          seats: number;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          plan?: Plan;
          status?: SubscriptionStatus;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          seats?: number;
          current_period_end?: string | null;
        };
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>;
        Relationships: [];
      };
      processed_events: {
        Row: { event_id: string; source: string; processed_at: string };
        Insert: { event_id: string; source: string };
        Update: Partial<Database['public']['Tables']['processed_events']['Insert']>;
        Relationships: [];
      };
      blocks: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          start_time: string;
          end_time: string;
          label: string;
          type: BlockType;
          task_id: string | null;
          status: BlockStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          start_time: string;
          end_time: string;
          label: string;
          type: BlockType;
          task_id?: string | null;
          status?: BlockStatus;
        };
        Update: Partial<Database['public']['Tables']['blocks']['Insert']>;
        Relationships: [];
      };
      evidence: {
        Row: {
          id: string;
          block_id: string;
          user_id: string;
          photo_path: string;
          verified: boolean;
          confidence: number | null;
          verification_msg: string | null;
          provider: string | null;
          usage_log_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          block_id: string;
          user_id: string;
          photo_path: string;
          verified?: boolean;
          confidence?: number | null;
          verification_msg?: string | null;
          provider?: string | null;
          usage_log_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['evidence']['Insert']>;
        Relationships: [];
      };
      habits: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          habit_key: string;
          completed: boolean;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          habit_key: string;
          completed?: boolean;
          completed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['habits']['Insert']>;
        Relationships: [];
      };
      challenges: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          start_date: string;
          end_date: string;
          created_at: string;
        };
        Insert: { id?: string; owner_id: string; name: string; start_date: string; end_date: string };
        Update: Partial<Database['public']['Tables']['challenges']['Insert']>;
        Relationships: [];
      };
      challenge_members: {
        Row: { challenge_id: string; user_id: string; joined_at: string };
        Insert: { challenge_id: string; user_id: string };
        Update: Partial<Database['public']['Tables']['challenge_members']['Insert']>;
        Relationships: [];
      };
      verification_queue: {
        Row: {
          id: string;
          user_id: string;
          block_id: string;
          photo_path: string;
          status: string;
          attempts: number;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          block_id: string;
          photo_path: string;
          status?: string;
          attempts?: number;
          last_error?: string | null;
        };
        Update: Partial<Database['public']['Tables']['verification_queue']['Insert']>;
        Relationships: [];
      };
      google_tokens: {
        Row: {
          user_id: string;
          refresh_token: string;
          access_token: string | null;
          expiry: string | null;
          scope: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          refresh_token: string;
          access_token?: string | null;
          expiry?: string | null;
          scope?: string | null;
        };
        Update: Partial<Database['public']['Tables']['google_tokens']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      public_profiles: {
        Row: { handle: string | null; full_name: string | null; streak: number | null };
      };
    };
    Functions: {
      deduct_credits: { Args: { p_user_id: string; p_amount: number }; Returns: number };
      refund_credits: {
        Args: { p_user_id: string; p_amount: number; p_usage_log_id: string | null };
        Returns: undefined;
      };
      add_credits: { Args: { p_user_id: string; p_amount: number }; Returns: undefined };
      grant_signup_stipend: { Args: { p_user_id: string; p_amount: number }; Returns: number };
      increment_ai_usage: { Args: { p_provider: string; p_tokens: number }; Returns: undefined };
      get_platform_metrics: { Args: Record<string, never>; Returns: Json };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
