export interface CallAIOptions {
    provider: 'openai' | 'anthropic';
    url: string;
    apiKey: string;
    model: string;
    systemPrompt: string;
    userPrompt: string;
}

export async function callAI(opts: CallAIOptions): Promise<string[]> {
    const { provider, url, apiKey, model, systemPrompt, userPrompt } = opts;

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let requestBody: any;

    if (provider === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        requestBody = {
            model,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
            max_tokens: 1024
        };
    } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
        requestBody = {
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
        };
    }

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });
    } catch (e: any) {
        throw new Error(`\n❌ [Smart Locators] Network Error: Failed to connect to AI provider API at ${url}.\nReason: ${e.message}\nPlease verify that your AI server is running and accessible.`);
    }

    if (!response.ok) {
        throw new Error(`\n❌ [Smart Locators] API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let rawContent = "";

    if (provider === 'anthropic') {
        rawContent = data.content?.[0]?.text?.trim() || "";
    } else {
        rawContent = data.choices?.[0]?.message?.content?.trim() || "";
    }

    // Strip accidental markdown blocks if the small model ignores instructions
    rawContent = rawContent.replace(/^```json\n?/g, '').replace(/^```\n?/g, '').replace(/\n?```$/g, '').trim();

    // Parse the JSON
    let parsed: { locators?: string[] } = {};
    try {
        parsed = JSON.parse(rawContent);
    } catch (e) {
        throw new Error(`AI generated invalid JSON: ${rawContent}`);
    }

    const locators = parsed.locators || [];
    if (!locators.length) {
        throw new Error(`AI generated empty locator array: ${rawContent}`);
    }

    return locators;
}
