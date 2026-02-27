import { test as baseTest, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), '.smart-locators-cache.json');

function readCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        }
    } catch (e) { }
    return {};
}

function writeCache(data: any) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    } catch (e) { }
}
export type AIHealerOptions = {
    enableAutoHeal?: boolean;
    aiModel: string;
    aiPipeUrl: string;
    aiAdminKey: string;
    aiProvider?: 'openai' | 'anthropic';
};



export const test = baseTest.extend<AIHealerOptions & { _autoCacheDom: void }>({
    enableAutoHeal: [false, { option: true }],
    aiModel: ['auto-heal-frameworks', { option: true }],
    aiPipeUrl: ['http://localhost:8080/api/chat/completions', { option: true }],
    aiAdminKey: ['', { option: true }],
    aiProvider: ['openai', { option: true }],

    page: async ({ page, enableAutoHeal, aiPipeUrl, aiAdminKey, aiModel, aiProvider }, use, testInfo) => {
        if (!enableAutoHeal) {
            await use(page);
            return;
        }

        const locatorProxyHandler = {
            get(target: any, prop: string, receiver: any) {
                // Read properties assigned to this specific proxy instance
                const callerFile = (this as any).callerFile || '';
                const callerLine = (this as any).callerLine || '';

                const originalMethod = target[prop];
                const actionMethods = ['click', 'fill', 'check', 'dblclick', 'hover'];

                if (typeof originalMethod === 'function' && actionMethods.includes(prop)) {
                    return async (...args: any[]) => {
                        let preActionDom = "";
                        const urlObj = new URL(page.url());
                        const normalizedUrl = urlObj.pathname + urlObj.search;

                        try {
                            preActionDom = await page.evaluate(() => {
                                const clone = document.body.cloneNode(true) as HTMLElement;
                                clone.querySelectorAll('svg, script, style').forEach(el => el.remove());
                                return clone.innerHTML;
                            });
                        } catch (e) { }

                        try {
                            const options = args[0] || {};
                            options.timeout = 3000; // Fail fast for AI intercept
                            args[0] = options;
                            const result = await originalMethod.apply(target, args);

                            // If the action succeeded, this is a known good DOM for this URL
                            const cache = readCache();
                            cache[normalizedUrl] = { timestamp: Date.now(), dom: preActionDom };
                            writeCache(cache);

                            return result;
                        } catch (error: any) {
                            if (error.message.includes('Timeout') || error.message.includes('waiting for locator')) {
                                const brokenLoc = target.toString();
                                console.log(`\n🤖 [AI Auto-Heal] Intercepted failure on: ${brokenLoc}`);

                                const cache = readCache();
                                const cacheEntry = cache[normalizedUrl];
                                let knownGoodDom = "";
                                if (cacheEntry && cacheEntry.dom) {
                                    if (Date.now() - cacheEntry.timestamp < 7 * 24 * 60 * 60 * 1000) { // 7 days expiration
                                        knownGoodDom = cacheEntry.dom;
                                    }
                                } else if (typeof cacheEntry === 'string') {
                                    knownGoodDom = cacheEntry;
                                }

                                const dom = preActionDom || await page.evaluate(() => {
                                    const clone = document.body.cloneNode(true) as HTMLElement;
                                    clone.querySelectorAll('svg, script, style').forEach(el => el.remove());
                                    return clone.innerHTML;
                                });

                                const currentProvider = aiProvider || 'openai';

                                const systemPrompt = `You are a strict, machine-to-machine Self-Healing UI Locator API.\nThe user will provide a JSON payload with: 'framework', 'broken_locator', 'current_dom', and optionally 'known_good_dom'.\nCompare 'known_good_dom' to 'current_dom' to find exactly how the element changed.\nReturn your top 7 most confident Playwright locator STRINGS for the correct element.\n\nRULES:\n1. Respond with ONLY valid JSON.\n2. The JSON must have exactly one key "locators" which is an ARRAY of exactly 7 strictly ordered string selectors.\n3. STRICT PRIORITY (Good Practices first): ID > data-testid > unique text > combination of distinct CSS classes > layout-based DOM paths.\n4. ABSOLUTELY NO PARENTHESES. To chain classes, use dots: ".class1.class2". BAD: ".class1(class2)".\n5. DO NOT use Playwright pseudo-classes like :has-text or :contains. Just return standard CSS selectors.\n6. IMPORTANT: Carefully analyze the semantic meaning of the 'broken_locator'. If it searches for "Sign In", look for "Login" or similar text/href/classes in the new DOM.\n\nEXAMPLE INPUT:\n{"framework":"Playwright","broken_locator":"text=\\"Old Button\\"","current_dom":"<button class=\\"xyz-btn abc-primary\\">New Button</button>"}\nEXAMPLE OUTPUT:\n{"locators":[".xyz-btn.abc-primary", ".xyz-btn", "button.xyz-btn", "button", ".abc-primary", "button.abc-primary", "*[class*=\\"xyz-btn\\"]"]}`;
                                const userPrompt = JSON.stringify({ framework: "Playwright", broken_locator: brokenLoc, current_dom: dom, known_good_dom: knownGoodDom });

                                let headers: Record<string, string> = { 'Content-Type': 'application/json' };
                                let requestBody: any;

                                if (aiProvider === 'anthropic') {
                                    headers['x-api-key'] = aiAdminKey;
                                    headers['anthropic-version'] = '2023-06-01';
                                    requestBody = {
                                        model: aiModel,
                                        system: systemPrompt,
                                        messages: [{ role: "user", content: userPrompt }],
                                        max_tokens: 1024
                                    };
                                } else {
                                    headers['Authorization'] = `Bearer ${aiAdminKey}`;
                                    requestBody = {
                                        model: aiModel,
                                        messages: [
                                            { role: "system", content: systemPrompt },
                                            { role: "user", content: userPrompt }
                                        ]
                                    };
                                }

                                let response;
                                try {
                                    response = await fetch(aiPipeUrl, {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify(requestBody)
                                    });
                                } catch (e: any) {
                                    throw new Error(`\n❌ [Smart Locators] Network Error: Failed to connect to AI provider API at ${aiPipeUrl}.\nReason: ${e.message}\nPlease verify that your AI server is running and accessible.`);
                                }

                                if (!response.ok) {
                                    throw new Error(`\n❌ [Smart Locators] API Error: ${response.status} ${response.statusText}`);
                                }

                                const data = await response.json();
                                let rawContent = "";

                                if (currentProvider === 'anthropic') {
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

                                const aiLocators = parsed.locators || [];
                                if (!aiLocators.length) {
                                    throw new Error(`AI generated empty locator array: ${rawContent}`);
                                }

                                let healedLoc = "";
                                let actionSucceeded = false;
                                let firstError: any = null;

                                // Try the locators one by one
                                for (let loc of aiLocators) {
                                    try {
                                        // Sanitize Qwen 7B's SASS-like hallucination: `button(class1 class2)` -> `button.class1.class2`
                                        if (loc.includes('(') && !loc.includes(':')) {
                                            loc = loc.replace(/\(([^)]+)\)/g, (match, p1) => '.' + p1.trim().replace(/\s+/g, '.'));
                                            // Ensure there are no double dots if p1 already started with a dot
                                            loc = loc.replace(/\.\./g, '.');
                                        }

                                        // Try to perform the original action with the new locator
                                        // IMPORTANT: set a small timeout for the healing attempts so we don't stall forever on array fallbacks
                                        const originalAction = prop.toString();
                                        if (actionMethods.includes(originalAction)) { // Check if it's one of the action methods
                                            const pageLoc = page.locator(loc).first();
                                            const argsArray = [...args];
                                            let optionsObj = argsArray[argsArray.length - 1]; // usually is options
                                            if (typeof optionsObj === 'object' && optionsObj !== null && !Array.isArray(optionsObj)) {
                                                optionsObj = { ...optionsObj, timeout: 3000 };
                                                argsArray[argsArray.length - 1] = optionsObj;
                                            } else {
                                                argsArray.push({ timeout: 3000 });
                                            }

                                            // Call the method on the new locator
                                            await (pageLoc as any)[prop](...argsArray);
                                        } else {
                                            // Fallback for actions that don't take timeout easily or return something immediately 
                                            const locatorProxy: any = Reflect.apply(target, this, [loc, ...args]);
                                            await locatorProxy.waitFor({ state: 'visible', timeout: 3000 });
                                        }

                                        healedLoc = loc;
                                        actionSucceeded = true;
                                        console.log(`✅ [AI Auto-Heal] Fixed! Resuming with: ${healedLoc}`);
                                        break; // Success! Break out of the loop
                                    } catch (e: any) {
                                        if (!firstError) firstError = e;
                                        // continue to the next locator
                                    }
                                }

                                if (!actionSucceeded) {
                                    // If we failed all 3 locators, purge the cache and throw
                                    const latestCache = readCache();
                                    if (latestCache[normalizedUrl]) {
                                        console.log(`❌ [AI Auto-Heal] All ${aiLocators.length} locators failed. Invalidating aged DOM cache for ${normalizedUrl}`);
                                        delete latestCache[normalizedUrl];
                                        writeCache(latestCache);
                                    }
                                    throw firstError || new Error("All auto-heal locators failed");
                                }

                                // Update the reporter annotations
                                const newAnnotations = testInfo.annotations.filter(a => a.type !== 'ai-healed');

                                // Recover the previously parsed array if it exists
                                const existingHealed = testInfo.annotations.find(a => a.type === 'ai-healed');
                                let healedArray = [];
                                if (existingHealed) {
                                    try { healedArray = JSON.parse(existingHealed.description || "[]"); } catch (e) { }
                                }

                                // NOTE: Playwright doesn't expose the original file/line of the failing locator directly
                                // We could potentially parse the stack trace of the original error, but that's complex
                                // For now, we'll just record the healed locator.
                                healedArray.push({
                                    file: callerFile,
                                    line: callerLine,
                                    oldLocator: brokenLoc,
                                    newLocator: healedLoc,
                                    timestamp: new Date().toISOString()
                                });

                                newAnnotations.push({
                                    type: 'ai-healed',
                                    description: JSON.stringify(healedArray)
                                });

                                // Replace the internal annotations array
                                (testInfo as any).annotations = newAnnotations;
                                return; // Successfully executed within the loop, exit the proxy interception
                            }
                            throw error;
                        }
                    };
                }
                return Reflect.get(target, prop);
            }
        };

        const pageProxy = new Proxy(page, {
            get(target: any, prop: string) {
                const originalMethod = target[prop];
                if (typeof originalMethod === 'function' && ['locator', 'getByRole', 'getByTestId', 'getByText', 'getByLabel'].includes(prop)) {
                    return (...args: any[]) => {
                        // Capture the exact caller file and line dynamically!
                        const err = new Error();
                        const stackLines = (err.stack || '').split('\n');
                        let callerFile = '';
                        let callerLine = '';

                        for (let i = 2; i < stackLines.length; i++) {
                            const line = stackLines[i];
                            // Ignore internal proxy, playwright core, and smart locators itself
                            if (line.includes('playwright-core') || line.includes('@playwright/test') || line.includes('node_modules') || line.includes('dist/index.js')) {
                                continue;
                            }

                            // Extract file path and line number from stack (e.g. at Object.<anonymous> (/path/to/file.ts:15:30))
                            const match = line.match(/(?:\(|^|\s)([^()\s]+):(\d+):(?:\d+)\)?$/);
                            if (match) {
                                callerFile = match[1];
                                callerLine = match[2];
                                break;
                            }
                        }

                        // Pass caller details into the factory binding
                        const boundHandler = Object.assign({}, locatorProxyHandler, { callerFile, callerLine });
                        return new Proxy(originalMethod.apply(target, args), boundHandler);
                    };
                }
                return Reflect.get(target, prop);
            }
        });

        await use(pageProxy);
    }
});

export { expect };
