# playwright-smart-locators

**AI-powered self-healing web locators for Playwright tests.** 

Stop spending hours manually updating broken CSS selectors in your E2E test scripts. `playwright-smart-locators` automatically intercepts Playwright `TimeoutError` exceptions, evaluates your broken locator against the live DOM (and historical cached DOMs), uses an AI LLM to deduce the correct intended element, executes the action, and then **rewrites your source code** to permanently fix the test file for you.

We experimented heavily with local 7B models (like **Qwen 2.5 Coder 7B**) via Ollama and Open WebUI to enable auto-healing for developers without API budgets. 

**Findings for Small Models:**
* Standard 7B models often struggle to grasp standard CSS class chaining (e.g. generating `button(nav-link)` instead of `button.nav-link`). The integrated Auto-Healer regex scrubber now traps and corrects this hallucination automatically.
* Small models struggle to differentiate between multiple identical UI elements. The Top-7 Sequential Fallback feature was specifically designed so if a local model's #1 choice is syntactically correct but functionally wrong (points to a different button), it will fallback internally to its 2nd through 7th confident choice.
* For optimal zero-flake auto-healing, **GPT-4o** or **Claude 3.5 Sonnet** are recommended as they almost never hallucinate invalid CSS structures.

## ✨ Features

- **Seamless Proxy Interceptor:** Wraps your existing Playwright execution environment transparently. No need to rewrite your test logic; it catches Playwright's native timeouts completely in the background.
- **Proactive DOM Caching:** Records a stripped snapshot of the "Known Good" DOM right before any successful click action. When an element breaks in the future, the AI compares the historical DOM against the current failing DOM to compute exactly what CSS/HTML properties were altered by developers.
- **Self-Healing Output File:** A new cleanly modified `*.spec-healed.ts` file is generated next to your original spec file with all the broken locators permanently fixed.
- **Page Object Model (POM) Parsing:** The interceptor dynamically parses the Javascript execution stack trace. If a locator breaks inside a Page Object class (e.g. `login.page.ts`), the AI Healer traces the exact execution boundary and rewrites the POM file natively!
- **Top-7 Fallback Engine:** The AI returns the top 7 most confident locators instead of just 1. The Healer engine executes them sequentially with a timeout, allowing smaller/weaker models to guess multiple times without failing the entire suite.
- **Syntactical Sanitization:** A heuristic regex scrubber automatically fixes SASS-like pseudo-class hallucinations (e.g. converting `tag(class1 class2)` into `tag.class1.class2`) commonly produced by highly quantized local models.
- **Automated Spec Rewriting:** Automatically creates a physically updated `spec-healed.ts` file parallel to your broken tests, swapping out your hardcoded failing locators with the newly calculated resilient locators. Copy-paste to permanently fix your build pipeline.

## 🛠 Usage

1. **Install the package:**
```bash
npm install -D playwright-smart-locators
```

2. **Wrap your `playwright.config.ts`:**
Import the custom auto-healer and point it to your Open WebUI or OpenAI compatible endpoint:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    reporter: [
        ['html'],
        ['playwright-smart-locators/dist/reporter'] // Required for Auto-Spec Rewriting
    ],
    use: {
        enableAutoHeal: true,
        aiModel: 'qwen2.5:7b',
        aiPipeUrl: process.env.AI_API_URL, // e.g., OpenAI or Anthropic endpoint
        aiAdminKey: process.env.AI_API_KEY, // e.g., 'sk-...'
        aiProvider: 'openai' // 'openai' (default) or 'anthropic'
    }
});
```

3. **Import `test` from the library:**
Replace standard Playwright `@playwright/test` imports in your spec files:
```diff
- import { test, expect } from '@playwright/test';
+ import { test, expect } from 'playwright-smart-locators';
```

## 🛠 Example Project

The repository includes an `example` testing suite configured with the Auto-Healer to demonstrate its capabilities. The example tests were created with scenarios against [github.com/axeforging/tacomex-8bit-shop](https://github.com/axeforging/tacomex-8bit-shop). To run the examples:

1. Navigate to the example: `cd example`
2. Install dependencies: `npm install`
3. Run the tests: `npx playwright test`

### Example Scenarios
The example includes 6 intentionally broken tests that the AI will auto-heal at runtime:
- **`tests/example.spec.ts`**: Contains 3 standard procedural Playwright tests.
- **`tests/pom.spec.ts`**: Contains 3 tests using the Page Object Model (POM) pattern, demonstrating how the Healer traverses the object boundary to rewrite `pages/login.page.ts` natively.

---

## 🚀 Execution Example

When `playwright-smart-locators` detects a broken spec, it prints the auto-healing process directly to the console so developers know exactly what action it is taking to save the test, and provides a final summary of exactly which source files it permanently rewrote:

```
Running 6 tests using 6 workers

🤖 [AI Auto-Heal] Intercepted failure on: locator('text="Sign In"')
✅ [AI Auto-Heal] Fixed! Resuming with: .navbar__login-btn
  ✓  2 tests/pom.spec.ts:11:9 › POM Auto-Healing Scenarios › Scenario 1: Text changed (POM Login Button) (5.0s)

...

  6 passed (7.7s)

=========================================
🧠 Smart Locators Summary
=========================================
Total Locators Healed: 6
✨ Generated auto-healed spec: /home/oa/workspace/projects/ai-healing/ai-healer-lib/example/pages/login.page-healed.ts
✨ Generated auto-healed spec: /home/oa/workspace/projects/ai-healing/ai-healer-lib/example/tests/example.spec-healed.ts
```

---

## 🧠 The "Line of Thought" Lifecycle

1. **Record Phase:** During a green test suite, the library records a clean snapshot of the stripped DOM immediately before executing any successful locator action, caching it locally (`.ai-healer-cache.json`).
2. **Intercept Phase:** The next time a test runs, if a developer changed an element (e.g. `<button class="btn-primary">` to `<button class="btn-accent">`), the proxy intercepts Playwright's resulting `TimeoutError`.
3. **Contextual Evaluation:** The proxy transmits a strict context payload to the LLM containing the **Broken Locator**, the **Known Good DOM** (from cache), and the **Current Broken DOM**.
4. **Resolution:** The LLM evaluates the difference between the two DOM states to structurally identify the element, and calculates the most resilient new CSS selector according to a strict priority hierarchy.
5. **Execution & Rewrite:** The library bypasses the failure, executes the click using the healed locator, and the reporter scans your source file to rewrite the test code physically to disk.

---

## 🧪 Model Experiments & Insights

Our goal was to find a model that provided 100% syntactical CSS accuracy on dense, obfuscated React DOMs while operating with minimal financial or infrastructural overhead.

- `llama3.2:3b` - **Failed:** Demonstrated high hallucination rates on complex DOMs, generating fake nested layouts.
- `gpt-oss:20b` - **Excellent:** Operated flawlessly without DOM caching restrictions, but is financially expensive and demands immense GPU overhead for a lightweight CI/CD tool.
- `qwen2.5-coder:1.5b` and `qwen2.5:3b-instruct` - **Failed:** While cheap, small models struggle to obey strict JSON output rules, frequently hallucinating invalid CSS syntax combinations (`.class1(class2)`) or randomly wrapping outputs in un-parseable Markdown code block characters.
- `qwen2.5:7b` - **The Sweet Spot:** When paired with the **Proactive DOM Caching** (which structurally reduces the AI payload reasoning required from "Find this entirely new element" to "Find the diff of what changed in these two strings") and strict JSON prompt enforcement, this lightweight 7B parameter model achieved **100% perfect healing**. It offers the premium intelligence needed to parse nested React layouts at a fraction of the cost of 20B+ models.
