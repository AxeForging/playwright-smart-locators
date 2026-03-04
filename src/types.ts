export type AIHealerOptions = {
    enableAutoHeal?: boolean;
    aiModel: string;
    aiPipeUrl: string;
    aiAdminKey: string;
    aiProvider?: 'openai' | 'anthropic';
};
