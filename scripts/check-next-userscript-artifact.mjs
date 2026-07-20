import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import userscript from "../userscript.next.config.mjs";
import classicUserscript from "../userscript.config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const artifactPath = path.join(
    projectRoot,
    ".tmp",
    "vite-next-candidate",
    `${userscript.id}.candidate.user.js`
);
const relativeArtifactPath = path.relative(projectRoot, artifactPath);
const artifactText = await readFile(artifactPath, "utf8");
const metadata = parseUserscriptMetadata(artifactText);

assert.equal(
    artifactText.startsWith("// ==UserScript==\n"),
    true,
    "userscript metadata must be the first artifact content"
);
assert.equal(relativeArtifactPath.startsWith(`dist${path.sep}`), false, "Next candidate must stay outside dist");
assert.notEqual(userscript.id, classicUserscript.id, "Next artifact id must differ from Classic");
assert.notEqual(userscript.name, classicUserscript.name, "Next name must differ from Classic");
assert.notEqual(userscript.namespace, classicUserscript.namespace, "Next namespace must differ from Classic");
assert.notDeepEqual(
    [userscript.namespace, userscript.name],
    [classicUserscript.namespace, classicUserscript.name],
    "Next Tampermonkey identity must differ from Classic"
);
assert.deepEqual(metadata.get("name"), [userscript.name]);
assert.deepEqual(metadata.get("namespace"), [userscript.namespace]);
assert.deepEqual(metadata.get("version"), [userscript.version]);
assert.deepEqual(metadata.get("match"), userscript.match);
assert.deepEqual(metadata.get("grant"), userscript.grant);
assert.deepEqual(metadata.get("run-at"), [userscript.runAt]);
assert.equal(metadata.has("updateURL"), false, "Next candidate must not self-update");
assert.equal(metadata.has("downloadURL"), false, "Next candidate must not publish a download URL");
assert.match(artifactText, /data-ra-next-runtime-state/u);
assert.match(artifactText, /ready-read-only/u);

console.log(JSON.stringify({
    artifact: relativeArtifactPath,
    name: metadata.get("name")?.[0] ?? null,
    namespace: metadata.get("namespace")?.[0] ?? null,
    version: metadata.get("version")?.[0] ?? null,
    updateURL: metadata.get("updateURL")?.[0] ?? null,
    downloadURL: metadata.get("downloadURL")?.[0] ?? null,
    mode: "read-only"
}, null, 2));

function parseUserscriptMetadata(content) {
    const metadata = new Map();
    for (const line of content.split(/\r?\n/u)) {
        if (line === "// ==/UserScript==") {
            break;
        }
        const match = /^\/\/ @(\S+)\s+(.*)$/u.exec(line);
        if (match === null) {
            continue;
        }
        const key = match[1] ?? "";
        const value = (match[2] ?? "").trim();
        const values = metadata.get(key) ?? [];
        values.push(value);
        metadata.set(key, values);
    }
    return metadata;
}
