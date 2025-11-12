import type { ClientConfig, ReportHPParams, ReportResponse } from './types.js';
export * from './constants.js';
export * from './types.js';
export declare class BPTimerClient {
    private api_url;
    private api_key;
    private enabled;
    private logger;
    private log_level;
    private cache;
    constructor(config: ClientConfig);
    private log;
    reportHP(params: ReportHPParams): Promise<ReportResponse>;
    resetMonster(monster_id: string | number, line?: number): void;
    clearAll(): void;
    setEnabled(enabled: boolean): void;
    isEnabled(): boolean;
    testConnection(): Promise<ReportResponse>;
}
//# sourceMappingURL=index.d.ts.map