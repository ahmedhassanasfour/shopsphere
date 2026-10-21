import { run } from "node:test";
import { spec } from "node:test/reporters";
import { readdirSync } from "node:fs";
import { join } from "node:path";

function findTests(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findTests(fullPath));
        } else if (entry.name.endsWith(".test.ts")) {
            files.push(fullPath);
        }
    }

    return files;
}

const files = findTests("tests");

const stream = run({ files });

stream.on("test:fail", () => {
    process.exitCode = 1;
});

stream.compose(new spec()).pipe(process.stdout);
