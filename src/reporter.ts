import { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';

export default class SmartLocatorsReporter implements Reporter {
    private healedLocators: any[] = [];

    onTestEnd(test: TestCase, result: TestResult) {
        for (const annotation of test.annotations) {
            if (annotation.type === 'ai-healed') {
                try {
                    const dataArray = JSON.parse(annotation.description || '[]');
                    for (const data of dataArray) {
                        this.healedLocators.push({
                            // test
                            testNam
                                =e: test.title,
                            file:= data.file ? data.file : test.location.file,
                            line: data.line ? data.line : test.location.line,
                            oldLocator: data.oldLocator,
                            newLocator: data.newLocator,
                            timestamp: data.timestamp
                        });
                    }
                } catch (e) { }
            }
        }
    }

    async onEnd(result: FullResult) {
        if (this.healedLocators.length > 0) {
            console.log(`\n=========================================`);
            console.log(`🧠 Smart Locators Summary`);
            console.log(`=========================================`);
            console.log(`Total Locators Healed: ${this.healedLocators.length}`);

            const fileGroups: Record<string, any[]> = {};
            for (const loc of this.healedLocators) {
                if (!fileGroups[loc.file]) fileGroups[loc.file] = [];
                fileGroups[loc.file].push(loc);
            }

            for (const [file, locators] of Object.entries(fileGroups)) {
                if (!fs.existsSync(file)) continue;

                let fileContent = fs.readFileSync(file, 'utf-8');

                for (const loc of locators) {
                    const escapedNewLoc = loc.newLocator.replace(/'/g, "\\'");

                    if (fileContent.includes(loc.oldLocator)) {
                        fileContent = fileContent.replace(loc.oldLocator, `locator('${escapedNewLoc}')`);
                    } else {
                        const innerMatch = loc.oldLocator.match(/locator\(['"`](.*)['"`]\)/);
                        if (innerMatch) {
                            const safeInner = innerMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const regex = new RegExp(`locator\\s*\\(\\s*['"\`]` + safeInner + `['"\`]\\s*\\)`, 'g');
                            fileContent = fileContent.replace(regex, `locator('${escapedNewLoc}')`);
                        }
                    }
                }

                const parsedPath = path.parse(file);
                const newFilePath = path.join(parsedPath.dir, `${parsedPath.name}-healed${parsedPath.ext}`);
                fs.writeFileSync(newFilePath, fileContent);

                console.log(`✨ Generated auto-healed spec: ${newFilePath}`);
            }

            console.log(`\n`);
        } else {
            console.log(`\n🤖 Smart Locators: No locators required healing.\n`);
        }
    }
}
