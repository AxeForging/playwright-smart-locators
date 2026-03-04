import fs from 'fs';
import path from 'path';

export const CACHE_FILE = path.join(process.cwd(), '.smart-locators-cache.json');

export function readCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        }
    } catch (e) { }
    return {};
}

export function writeCache(data: any) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    } catch (e) { }
}
