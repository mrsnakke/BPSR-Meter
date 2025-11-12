export type LogLevel = 'silent' | 'info' | 'debug';

export interface Logger {
  info: (message: string) => void;
  debug: (message: string) => void;
}

export interface ClientConfig {
  api_url: string;
  api_key: string;
  enabled?: boolean;
  logger?: Logger;
  log_level?: LogLevel;
}

export interface ReportHPParams {
  monster_id: string | number;
  hp_pct: number;
  line: number;
  pos_x?: number;
  pos_y?: number;
  pos_z?: number;
  region?: string;
}

export interface ReportPayload extends Omit<ReportHPParams, 'monster_id'> {
  monster_id: number;
}

export interface ReportResponse {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface CacheEntry {
  timestamp: number;
  last_reported_hp: number | null;
  is_pending: boolean;
}
