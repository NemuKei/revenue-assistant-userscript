import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import classicBaseline from "../.github/classic-publication-baseline.json" with { type: "json" };
import userscript from "../userscript.next.config.mjs";

assert.equal(process.argv.includes("--live"), true, "--live is required to package verified Classic bytes");
assert.equal(userscript.publication, true, "publication metadata must be enabled");

const sourceCommit = requireEnvironment("NEXT_PUBLICATION_SOURCE_SHA", /^[0-9a-f]{40}$/u);
const workflowRunId = Number(requireEnvironment("NEXT_PUBLICATION_RUN_ID", /^[1-9]\d*$/u));
const workflowRunNumber = Number(requireEnvironment("NEXT_PUBLICATION_RUN_NUMBER", /^[1-9]\d*$/u));
const workflowRunAttempt = Number(requireEnvironment("NEXT_PUBLICATION_RUN_ATTEMPT", /^[1-9]\d*$/u));
assert.equal(userscript.publicationRunNumber, workflowRunNumber);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicationDirectory = path.join(projectRoot, ".tmp", "vite-next-publication", "next");
const publicationPath = path.join(publicationDirectory, `${userscript.id}.user.js`);
const publicationMapPath = `${publicationPath}.map`;
const pagesRoot = path.join(projectRoot, ".tmp", "pages-artifact");
const pagesNextDirectory = path.join(pagesRoot, "next");
const publicationBytes = Buffer.from(await readFile(publicationPath));
const publicationMapBytes = Buffer.from(await readFile(publicationMapPath));
const classicBytes = await fetchBytes(classicBaseline.publishedUrl, "Classic userscript");
const classicMapBytes = await fetchBytes(classicBaseline.publishedSourceMapUrl, "Classic source map");

verifyBytes(classicBytes, classicBaseline.publishedBytes, classicBaseline.sha256, "Classic userscript");
verifyBytes(
    classicMapBytes,
    classicBaseline.publishedSourceMapBytes,
    classicBaseline.publishedSourceMapSha256,
    "Classic source map"
);

const publicationSha256 = sha256(publicationBytes);
const publicationMapSha256 = sha256(publicationMapBytes);
const publicationUrl = userscript.updateURL;
assert.equal(typeof publicationUrl, "string");
const publicationMapUrl = `${publicationUrl}.map`;
const releaseManifestUrl = `${userscript.publicationBaseUrl}/next/release.json`;

const releaseManifest = {
    schemaVersion: 1,
    productLine: "Next",
    publicationState: "active",
    publishedUrl: publicationUrl,
    publishedSourceMapUrl: publicationMapUrl,
    releaseManifestUrl,
    publishedName: userscript.name,
    namespace: userscript.namespace,
    version: userscript.version,
    updateURL: userscript.updateURL,
    downloadURL: userscript.downloadURL,
    match: userscript.match[0],
    grant: userscript.grant[0],
    runAt: userscript.runAt,
    sourceCommit,
    workflowRunId,
    workflowRunNumber,
    workflowRunAttempt,
    workflowRunName: "Publish Next Userscript",
    workflowRunEvent: "workflow_dispatch",
    workflowPath: ".github/workflows/publish-next-userscript.yml",
    workflowRunUrl: `https://github.com/NemuKei/revenue-assistant-userscript/actions/runs/${workflowRunId}`,
    publishedBytes: publicationBytes.length,
    sha256: publicationSha256,
    publishedSourceMapBytes: publicationMapBytes.length,
    publishedSourceMapSha256: publicationMapSha256
};

await rm(pagesRoot, { recursive: true, force: true });
await mkdir(pagesNextDirectory, { recursive: true });
await writeFile(path.join(pagesRoot, "revenue-assistant-userscript.user.js"), classicBytes);
await writeFile(path.join(pagesRoot, "revenue-assistant-userscript.user.js.map"), classicMapBytes);
await writeFile(path.join(pagesRoot, ".nojekyll"), "");
await writeFile(path.join(pagesNextDirectory, `${userscript.id}.user.js`), publicationBytes);
await writeFile(path.join(pagesNextDirectory, `${userscript.id}.user.js.map`), publicationMapBytes);
await writeFile(
    path.join(pagesNextDirectory, "release.json"),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
    "utf8"
);

console.log(JSON.stringify({
    pagesArtifact: path.relative(projectRoot, pagesRoot),
    classicBytes: classicBytes.length,
    classicSha256: sha256(classicBytes),
    classicSourceMapBytes: classicMapBytes.length,
    classicSourceMapSha256: sha256(classicMapBytes),
    nextVersion: userscript.version,
    nextBytes: publicationBytes.length,
    nextSha256: publicationSha256,
    nextSourceMapBytes: publicationMapBytes.length,
    nextSourceMapSha256: publicationMapSha256
}, null, 2));

function requireEnvironment(name, pattern) {
    const value = process.env[name]?.trim() ?? "";
    assert.match(value, pattern, `${name} is missing or invalid`);
    return value;
}

async function fetchBytes(rawUrl, label) {
    const url = new URL(rawUrl);
    url.searchParams.set("rau-next-publication", Date.now().toString());
    const response = await fetch(url, {
        cache: "no-store",
        headers: { "cache-control": "no-cache" }
    });
    assert.equal(response.ok, true, `${label} must be readable`);
    return Buffer.from(await response.arrayBuffer());
}

function verifyBytes(bytes, expectedLength, expectedSha256, label) {
    assert.equal(bytes.length, expectedLength, `${label} byte length changed`);
    assert.equal(sha256(bytes), expectedSha256, `${label} SHA-256 changed`);
}

function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}
