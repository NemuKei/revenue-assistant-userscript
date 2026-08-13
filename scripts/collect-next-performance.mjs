import { importBundledTypeScript } from "./import-typescript-module.mjs";

const performanceModule = await importBundledTypeScript(
    "../src/next/performance/nextPerformanceRecorder.ts",
    import.meta.url
);
const input = await readStdin();
const trimmed = input.trim();
const samples = trimmed === ""
    ? []
    : trimmed.startsWith("[")
        ? JSON.parse(trimmed)
        : trimmed.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
if (!Array.isArray(samples)) {
    throw new Error("expected a JSON array or JSON Lines on stdin");
}
const summary = performanceModule.summarizeNextPerformanceSamples(samples);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (summary.invalidSampleCount > 0) {
    process.exitCode = 1;
}

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}
