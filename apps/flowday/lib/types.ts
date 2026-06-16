import type { BlockStatus, BlockType } from '@flowday/core/supabase/types';

// Forma de bloque que devuelve la API (§C-11.2).
export interface Block {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  label: string;
  type: BlockType;
  task_id: string | null;
  status: BlockStatus;
}
