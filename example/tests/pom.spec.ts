import { test, expect } from '@axeforging/playwright-smart-locators';
import { LoginPage } from '../pages/login.page';

test.describe('POM Auto-Healing Scenarios', () => {
    test.beforeEach(async ({ page }) => {
        const loginPage = new LoginPage(page);
        await page.goto('http://127.0.0.1:5173/');
        await page.waitForSelector('.app-main', { timeout: 10000 });
    });

    test('Scenario 1: Text changed (POM Login Button)', async ({ page }) => {
        const loginPage = new LoginPage(page);

        // This method contains the broken locator. 
        // The Auto-Healer must rewrite `login.page.ts`, NOT this spec file!
        const navPromise = page.waitForNavigation({ url: '**/login', timeout: 8000 }).catch(() => { });
        await loginPage.clickLogin();
        await navPromise;

        expect(page.url()).toContain('/login');
    });

    test('Scenario 2: Text changed (POM Start Order)', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.clickStartOrder();
        expect(true).toBeTruthy();
    });

    test('Scenario 3: Text changed (POM View Menu)', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.clickViewMenu();
        expect(true).toBeTruthy();
    });
});
