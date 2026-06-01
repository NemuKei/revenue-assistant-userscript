import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outDir = resolve(repoRoot, ".tmp", "rank-fixture-marker-check");
const outFile = resolve(outDir, "entry.cjs");
const require = createRequire(import.meta.url);

await mkdir(outDir, { recursive: true });

await build({
    entryPoints: [resolve(__dirname, "check-rank-fixture-markers-entry.ts")],
    outfile: outFile,
    bundle: true,
    platform: "node",
    format: "cjs",
    sourcemap: false,
    logLevel: "silent"
});

const { runRankFixtureMarkerCheck } = require(outFile);
runRankFixtureMarkerCheck();
