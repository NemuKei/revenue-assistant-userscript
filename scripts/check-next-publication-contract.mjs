import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const viteCli = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const candidateEnv = { ...process.env };
delete candidateEnv.NEXT_PUBLICATION_RUN_NUMBER;
delete candidateEnv.NEXT_PUBLICATION_SOURCE_SHA;
delete candidateEnv.NEXT_PUBLICATION_RUN_ID;
delete candidateEnv.NEXT_PUBLICATION_RUN_ATTEMPT;
const publicationEnv = {
    ...candidateEnv,
    NEXT_PUBLICATION_RUN_NUMBER: "1"
};

run([
    viteCli,
    "build",
    "--config",
    "./vite.next-userscript.config.mjs",
    "--mode",
    "candidate"
], candidateEnv);
run([path.join(projectRoot, "scripts", "check-next-userscript-artifact.mjs")], candidateEnv);
run([
    viteCli,
    "build",
    "--config",
    "./vite.next-userscript.config.mjs",
    "--mode",
    "publication"
], publicationEnv);
run([path.join(projectRoot, "scripts", "check-next-publication-artifact.mjs")], publicationEnv);
run([path.join(projectRoot, "scripts", "check-next-publication-boundary.mjs")], candidateEnv);

console.log(JSON.stringify({
    candidateValidated: true,
    syntheticPublicationVersion: "0.2.0.1",
    publicationUrl: "https://nemukei.github.io/revenue-assistant-userscript/next/revenue-assistant-next.user.js",
    result: "pass"
}, null, 2));

function run(args, env) {
    const result = spawnSync(process.execPath, args, {
        cwd: projectRoot,
        env,
        stdio: "inherit"
    });
    if (result.error !== undefined) {
        throw result.error;
    }
    assert.equal(result.status, 0, `command failed: node ${args.join(" ")}`);
}
