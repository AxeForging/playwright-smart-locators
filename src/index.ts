import { test as baseTest, expect } from '@playwright/test';
import { readCache, writeCache } from './cache';
import { SYSTEM_PROMPT } from './prompts';
import { callAI } from './ai-client';

export type { AIHealerOptions } from './types';
import type { AIHealerOptions } from './types';

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
                                const userPrompt = JSON.stringify({ framework: "Playwright", broken_locator: brokenLoc, current_dom: dom, known_good_dom: knownGoodDom });

                                const aiLocators = await callAI({
                                    provider: currentProvider,
                                    url: aiPipeUrl,
                                    apiKey: aiAdminKey,
                                    model: aiModel,
                                    systemPrompt: SYSTEM_PROMPT,
                                    userPrompt,
                                });

                                // Expand with lowercased variants for AI models that hallucinate casing (e.g. "Pixel-button" vs "pixel-button")
                                const expandedLocators: string[] = [];
                                for (const loc of aiLocators) {
                                    expandedLocators.push(loc);
                                    const lower = loc.toLowerCase();
                                    if (lower !== loc) expandedLocators.push(lower);
                                }

                                let healedLoc = "";
                                let actionSucceeded = false;
                                let firstError: any = null;

                                // Try the locators one by one
                                for (let loc of expandedLocators) {
                                    try {
                                        // Sanitize Qwen 7B's SASS-like hallucination: `button(class1 class2)` -> `button.class1.class2`
                                        if (loc.includes('(') && !loc.includes(':')) {
                                            loc = loc.replace(/\(([^)]+)\)/g, (match, p1) => '.' + p1.trim().replace(/\s+/g, '.'));
                                            // Ensure there are no double dots if p1 already started with a dot
                                            loc = loc.replace(/\.\./g, '.');
                                        }

                                        // Try to perform the original action with the new locator
                                        const originalAction = prop.toString();
                                        if (actionMethods.includes(originalAction)) {
                                            const pageLoc = page.locator(loc).first();
                                            const argsArray = [...args];
                                            let optionsObj = argsArray[argsArray.length - 1];
                                            if (typeof optionsObj === 'object' && optionsObj !== null && !Array.isArray(optionsObj)) {
                                                optionsObj = { ...optionsObj, timeout: 3000 };
                                                argsArray[argsArray.length - 1] = optionsObj;
                                            } else {
                                                argsArray.push({ timeout: 3000 });
                                            }

                                            // Call the method on the new locator
                                            await (pageLoc as any)[prop](...argsArray);
                                        } else {
                                            const locatorProxy: any = Reflect.apply(target, this, [loc, ...args]);
                                            await locatorProxy.waitFor({ state: 'visible', timeout: 3000 });
                                        }

                                        healedLoc = loc;
                                        actionSucceeded = true;
                                        console.log(`✅ [AI Auto-Heal] Fixed! Resuming with: ${healedLoc}`);
                                        break;
                                    } catch (e: any) {
                                        if (!firstError) firstError = e;
                                    }
                                }

                                if (!actionSucceeded) {
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

                                const existingHealed = testInfo.annotations.find(a => a.type === 'ai-healed');
                                let healedArray = [];
                                if (existingHealed) {
                                    try { healedArray = JSON.parse(existingHealed.description || "[]"); } catch (e) { }
                                }

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

                                (testInfo as any).annotations = newAnnotations;
                                return;
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
                        const err = new Error();
                        const stackLines = (err.stack || '').split('\n');
                        let callerFile = '';
                        let callerLine = '';

                        for (let i = 2; i < stackLines.length; i++) {
                            const line = stackLines[i];
                            if (line.includes('playwright-core') || line.includes('@playwright/test') || line.includes('node_modules') || line.includes('dist/index.js')) {
                                continue;
                            }

                            const match = line.match(/(?:\(|^|\s)([^()\s]+):(\d+):(?:\d+)\)?$/);
                            if (match) {
                                callerFile = match[1];
                                callerLine = match[2];
                                break;
                            }
                        }

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
