import { test, expect } from '@axeforging/playwright-smart-locators';

test.describe('Auto-Healing React Application Scenarios', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the local test server
        await page.goto('http://127.0.0.1:5173/');
        // Wait for page to load
        await page.waitForSelector('.app-main', { timeout: 10000 });
    });

    test('Scenario 1: Text changed (Login Button)', async ({ page }) => {
        console.log('Attempting to click broken locator: text="Sign In"');
        // The real text is "Login" inside .navbar__login-btn

        const navPromise = page.waitForNavigation({ url: '**/login', timeout: 8000 }).catch(() => { });
        await page.locator('text="Sign In"').click();
        await navPromise;

        expect(page.url()).toContain('/login');
    });

    test('Scenario 2: Text changed (Start Order)', async ({ page }) => {
        console.log('Attempting to click broken locator: text="Begin Order"');
        // The real text is "Start Order" inside .pixel-button

        await page.locator('text="Begin Order"').click();

        expect(true).toBeTruthy();
    });

    test('Scenario 3: Text changed (View Menu)', async ({ page }) => {
        console.log('Attempting to click broken locator: text="Check Menu"');
        // The real text is "View Menu" 

        await page.locator('text="Check Menu"').click();

        expect(true).toBeTruthy();
    });
});
