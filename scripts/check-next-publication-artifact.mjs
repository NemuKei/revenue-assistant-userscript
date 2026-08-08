import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import userscript from "../userscript.next.config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const candidatePath = path.join(
    projectRoot,
    ".tmp",
    "vite-next-candidate",
    `${userscript.id}.candidate.user.js`
);
const publicationPath = path.join(
    projectRoot,
    ".tmp",
    "vite-next-publication",
    "next",
    `${userscript.id}.user.js`
);
const candidateText = await readFile(candidatePath, "utf8");
const publicationText = await readFile(publicationPath, "utf8");
const candidateMap = JSON.parse(await readFile(`${candidatePath}.map`, "utf8"));
const publicationMap = JSON.parse(await readFile(`${publicationPath}.map`, "utf8"));
const candidateMetadata = parseUserscriptMetadata(candidateText);
const publicationMetadata = parseUserscriptMetadata(publicationText);
const expectedUrl = "https://nemukei.github.io/revenue-assistant-userscript/next/revenue-assistant-next.user.js";

assert.equal(userscript.publication, true, "publication config must be enabled");
assert.ok(Number.isInteger(userscript.publicationRunNumber));
assert.ok((userscript.publicationRunNumber ?? 0) > 0);
assert.equal(userscript.publicationBaseUrl, "https://nemukei.github.io/revenue-assistant-userscript");
assert.equal(userscript.updateURL, expectedUrl);
assert.equal(userscript.downloadURL, expectedUrl);
assert.match(userscript.version, /^0\.2\.0\.[1-9]\d*$/u);
assert.equal(userscript.version.split(".").at(-1), String(userscript.publicationRunNumber));

assert.equal(publicationText.startsWith("// ==UserScript==\n"), true);
assert.deepEqual(publicationMetadata.get("name"), candidateMetadata.get("name"));
assert.deepEqual(publicationMetadata.get("namespace"), candidateMetadata.get("namespace"));
assert.deepEqual(publicationMetadata.get("match"), ["https://ra.jalan.net/*"]);
assert.deepEqual(publicationMetadata.get("grant"), ["none"]);
assert.deepEqual(publicationMetadata.get("run-at"), ["document-idle"]);
assert.deepEqual(publicationMetadata.get("version"), [userscript.version]);
assert.deepEqual(publicationMetadata.get("updateURL"), [expectedUrl]);
assert.deepEqual(publicationMetadata.get("downloadURL"), [expectedUrl]);
assert.deepEqual(
    Array.from(publicationMetadata.keys()).sort(),
    [
        "author",
        "description",
        "downloadURL",
        "grant",
        "match",
        "name",
        "namespace",
        "run-at",
        "updateURL",
        "version"
    ],
    "Next publication metadata keys must stay allowlisted"
);
for (const forbiddenKey of ["connect", "require", "resource"]) {
    assert.equal(publicationMetadata.has(forbiddenKey), false, `publication must not declare @${forbiddenKey}`);
}
assert.equal(candidateMetadata.has("updateURL"), false);
assert.equal(candidateMetadata.has("downloadURL"), false);

assert.equal(
    executablePayload(publicationText),
    executablePayload(candidateText),
    "publication runtime payload must equal the validated local candidate"
);
assert.deepEqual(
    publicationMap.sources.map(normalizeSourceMapPath),
    candidateMap.sources.map(normalizeSourceMapPath)
);
assert.deepEqual(publicationMap.sourcesContent, candidateMap.sourcesContent);
assert.equal(publicationMap.file, `${userscript.id}.user.js`);
assert.match(publicationText, /\/\/# sourceMappingURL=revenue-assistant-next\.user\.js\.map\s*$/u);

const publicationBytes = Buffer.byteLength(publicationText, "utf8");
const publicationSha256 = createHash("sha256")
    .update(Buffer.from(publicationText, "utf8"))
    .digest("hex")
    .toUpperCase();
const publicationMapBuffer = Buffer.from(await readFile(`${publicationPath}.map`));
const publicationMapSha256 = createHash("sha256")
    .update(publicationMapBuffer)
    .digest("hex")
    .toUpperCase();

console.log(JSON.stringify({
    artifact: path.relative(projectRoot, publicationPath),
    version: userscript.version,
    updateURL: userscript.updateURL,
    downloadURL: userscript.downloadURL,
    bytes: publicationBytes,
    sha256: publicationSha256,
    sourceMapBytes: publicationMapBuffer.length,
    sourceMapSha256: publicationMapSha256,
    runtimePayloadMatchesCandidate: true
}, null, 2));

function executablePayload(content) {
    const metadataEnd = content.indexOf("// ==/UserScript==");
    assert.notEqual(metadataEnd, -1, "missing userscript metadata end marker");
    const payloadStart = content.indexOf("\n", metadataEnd);
    assert.notEqual(payloadStart, -1, "missing userscript payload");
    return content
        .slice(payloadStart + 1)
        .replace(/^\/\/# sourceMappingURL=.*(?:\r?\n)?$/gmu, "")
        .trim();
}

function normalizeSourceMapPath(value) {
    return value.replaceAll("\\", "/").replace(/^(?:\.\.\/)+/u, "");
}

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
