import { Page } from '@playwright/test';

export class LoginPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async navigate() {
        await this.page.goto('http://127.0.0.1:5173/');
    }

    async clickLogin() {
        console.log('Attempting to click broken POM locator: text="Sign In"');
        // Purposely broken locator to trigger Auto-Healing inside the POM!
        await this.page.locator('text="Sign In"').click();
    }

    async clickStartOrder() {
        console.log('Attempting to click broken POM locator: text="Begin Order"');
        // Purposely broken locator 
        await this.page.locator('text="Begin Order"').click();
    }

    async clickViewMenu() {
        console.log('Attempting to click broken POM locator: text="Check Menu"');
        // Purposely broken locator 
        await this.page.locator('text="Check Menu"').click();
    }
}
