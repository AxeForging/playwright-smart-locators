import { defineConfig } from '@playwright/test';
import type { AIHealerOptions } from 'playwright-smart-locators';

export default defineConfig<AIHealerOptions>({
    testDir: './tests',
    fullyParallel: true,
    reporter: [
        ['list'],
        ['playwright-smart-locators/dist/reporter']
    ],
    use: {
        // Enable the auto healer
        enableAutoHeal: true,
        aiModel: 'qwen2.5:7b',

        // Replace with your actual AI Provider API URL and Admin API Key
        aiPipeUrl: process.env.AI_API_URL || 'https://localhost:11434/api/chat/completions',
        aiAdminKey: process.env.AI_API_KEY || 'sk-redacted',

        trace: 'on-first-retry',
    },
});
