'use client';
import { createBrowserClient, type FlowDayClient } from '@flowday/core/auth';

/** Cliente Supabase de browser (anon key). SPEC §C-8.6. */
export function createClient(): FlowDayClient {
  return createBrowserClient();
}
