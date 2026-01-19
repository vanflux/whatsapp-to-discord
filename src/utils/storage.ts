import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class Storage<T> {
    public data: T;

    constructor(private path: string, defaultValue: T) {
        try {
            this.data = JSON.parse(readFileSync(path, 'utf8'));
        } catch {
            this.data = defaultValue;
        }
    }

    save() {
        try {
            mkdirSync(dirname(this.path), { recursive: true });
            writeFileSync(this.path, JSON.stringify(this.data, null, 2));
        } catch (exc: unknown) {
            console.error('Storage save failed, exc:', exc);
        }
    }
}
