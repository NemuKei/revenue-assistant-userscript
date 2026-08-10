import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAllowedNextPublicationRunState } from "./next-publication-run-state.mjs";

const projectRoot = new URL("../", import.meta.url);
const workflowPath = new URL(".github/workflows/publish-next-userscript.yml", projectRoot);
const workflow = await readFile(workflowPath, "utf8");
const publicationUrl = "https://nemukei.github.io/revenue-assistant-userscript/next/revenue-assistant-next.user.js";
const releaseManifestUrl = "https://nemukei.github.io/revenue-assistant-userscript/next/release.json";
const liveCheck = process.argv.includes("--live");

assert.match(workflow, /^name: Publish Next Userscript\s*$/mu);
assert.match(workflow, /^on:\s*\r?\n\s{4}workflow_dispatch:/mu);
assert.doesNotMatch(workflow, /^\s{4}(?:push|pull_request|schedule):/mu);
assert.match(workflow, /^\s{12}confirmation:\s*$/mu);
assert.match(workflow, /PUBLISH_NEXT/u);
assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
assert.match(workflow, /test "\$PUBLICATION_CONFIRMATION" = "PUBLISH_NEXT"/u);
assert.equal(countMatches(workflow, /^\s+pages:\s+write\s*$/gmu), 1);
assert.equal(countMatches(workflow, /^\s+id-token:\s+write\s*$/gmu), 1);
assert.equal(countMatches(workflow, /actions\/configure-pages@/gu), 0);
assert.equal(countMatches(workflow, /actions\/upload-pages-artifact@v5/gu), 1);
assert.equal(countMatches(workflow, /actions\/deploy-pages@v5/gu), 1);
assert.match(workflow, /environment:\s*\r?\n\s+name: github-pages/u);
assert.match(workflow, /npm run check:next/u);
assert.match(workflow, /npm run check:classic-publication/u);
assert.match(workflow, /npm run build:next:publication/u);
assert.match(workflow, /npm run check:next:publication-artifact/u);
assert.match(workflow, /node scripts\/prepare-next-pages-artifact\.mjs --live/u);
assert.equal(countMatches(workflow, /node scripts\/check-classic-publication-boundary\.mjs --live/gu), 2);
assert.match(workflow, /node scripts\/check-next-publication-boundary\.mjs --live/u);
assert.match(workflow, /^\s{4}group: github-pages\s*$/mu);
assert.match(workflow, /^\s{4}cancel-in-progress: false\s*$/mu);
assert.doesNotMatch(workflow, /GITHUB_PAGES_BASE_URL/u);
const validationStepIndex = workflow.indexOf("- name: Validate Classic and Next");
const firstPublicationEnvironmentIndex = workflow.indexOf("NEXT_PUBLICATION_RUN_NUMBER");
assert.ok(validationStepIndex >= 0);
assert.ok(firstPublicationEnvironmentIndex > validationStepIndex);

const result = {
    mode: liveCheck ? "live" : "offline",
    workflow: ".github/workflows/publish-next-userscript.yml",
    trigger: "workflow_dispatch",
    publicationUrl
};

if (liveCheck) {
    const expectedSourceSha = readArgument("--expected-source-sha", /^[0-9a-f]{40}$/u);
    const expectedRunId = Number(readArgument("--expected-run-id", /^[1-9]\d*$/u));
    const expectedRunNumber = Number(readArgument("--expected-run-number", /^[1-9]\d*$/u));
    const expectedRunAttempt = Number(readArgument("--expected-run-attempt", /^[1-9]\d*$/u));
    const retryCount = Number(readOptionalArgument("--retry-count", "1", /^[1-9]\d*$/u));
    const retryDelayMs = Number(readOptionalArgument("--retry-delay-ms", "0", /^\d+$/u));
    const allowInProgress = process.argv.includes("--allow-in-progress");
    const liveResult = await retry(
        () => verifyLivePublication({
            expectedSourceSha,
            expectedRunId,
            expectedRunNumber,
            expectedRunAttempt,
            allowInProgress
        }),
        retryCount,
        retryDelayMs
    );
    Object.assign(result, liveResult);
}

console.log(JSON.stringify(result, null, 2));

async function verifyLivePublication(expected) {
    const manifest = await fetchJson(releaseManifestUrl);
    const expectedVersion = `0.2.0.${expected.expectedRunNumber}`;
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.productLine, "Next");
    assert.equal(manifest.publicationState, "active");
    assert.equal(manifest.publishedUrl, publicationUrl);
    assert.equal(manifest.publishedSourceMapUrl, `${publicationUrl}.map`);
    assert.equal(manifest.releaseManifestUrl, releaseManifestUrl);
    assert.equal(manifest.version, expectedVersion);
    assert.equal(manifest.updateURL, publicationUrl);
    assert.equal(manifest.downloadURL, publicationUrl);
    assert.equal(manifest.match, "https://ra.jalan.net/*");
    assert.equal(manifest.grant, "none");
    assert.equal(manifest.runAt, "document-idle");
    assert.equal(manifest.sourceCommit, expected.expectedSourceSha);
    assert.equal(manifest.workflowRunId, expected.expectedRunId);
    assert.equal(manifest.workflowRunNumber, expected.expectedRunNumber);
    assert.equal(manifest.workflowRunAttempt, expected.expectedRunAttempt);
    assert.equal(manifest.workflowRunName, "Publish Next Userscript");
    assert.equal(manifest.workflowRunEvent, "workflow_dispatch");
    assert.equal(manifest.workflowPath, ".github/workflows/publish-next-userscript.yml");
    assert.equal(
        manifest.workflowRunUrl,
        `https://github.com/NemuKei/revenue-assistant-userscript/actions/runs/${expected.expectedRunId}`
    );
    assert.ok(Number.isInteger(manifest.publishedBytes) && manifest.publishedBytes > 0);
    assert.match(manifest.sha256, /^[0-9A-F]{64}$/u);
    assert.ok(Number.isInteger(manifest.publishedSourceMapBytes) && manifest.publishedSourceMapBytes > 0);
    assert.match(manifest.publishedSourceMapSha256, /^[0-9A-F]{64}$/u);

    const artifactBytes = await fetchBytes(publicationUrl);
    const artifactText = artifactBytes.toString("utf8");
    assert.equal(artifactBytes.length, manifest.publishedBytes);
    assert.equal(sha256(artifactBytes), manifest.sha256);
    assert.equal(readMetadataValue(artifactText, "name"), manifest.publishedName);
    assert.equal(readMetadataValue(artifactText, "namespace"), manifest.namespace);
    assert.equal(readMetadataValue(artifactText, "version"), expectedVersion);
    assert.equal(readMetadataValue(artifactText, "updateURL"), publicationUrl);
    assert.equal(readMetadataValue(artifactText, "downloadURL"), publicationUrl);
    assert.equal(readMetadataValue(artifactText, "match"), manifest.match);
    assert.equal(readMetadataValue(artifactText, "grant"), manifest.grant);
    assert.equal(readMetadataValue(artifactText, "run-at"), manifest.runAt);

    const sourceMapBytes = await fetchBytes(`${publicationUrl}.map`);
    assert.equal(sourceMapBytes.length, manifest.publishedSourceMapBytes);
    assert.equal(sha256(sourceMapBytes), manifest.publishedSourceMapSha256);

    const runResponse = await fetch(
        `https://api.github.com/repos/NemuKei/revenue-assistant-userscript/actions/runs/${expected.expectedRunId}`,
        {
            cache: "no-store",
            headers: {
                accept: "application/vnd.github+json",
                "user-agent": "revenue-assistant-next-publication-check"
            }
        }
    );
    assert.equal(runResponse.ok, true, "GitHub Actions run must be readable");
    const run = await runResponse.json();
    assert.equal(run.id, expected.expectedRunId);
    assert.equal(run.run_number, expected.expectedRunNumber);
    assert.equal(run.run_attempt, expected.expectedRunAttempt);
    assert.equal(run.name, "Publish Next Userscript");
    assert.equal(run.event, "workflow_dispatch");
    assert.equal(run.head_branch, "main");
    assert.equal(run.head_sha, expected.expectedSourceSha);
    assert.equal(run.path, ".github/workflows/publish-next-userscript.yml");
    assert.equal(
        isAllowedNextPublicationRunState(run, expected.allowInProgress),
        true,
        `unexpected publication run state: ${run.status}/${run.conclusion ?? "null"}`
    );

    return {
        sourceCommit: manifest.sourceCommit,
        workflowRunId: manifest.workflowRunId,
        workflowRunNumber: manifest.workflowRunNumber,
        version: manifest.version,
        observedBytes: artifactBytes.length,
        observedSha256: sha256(artifactBytes),
        observedSourceMapBytes: sourceMapBytes.length,
        observedSourceMapSha256: sha256(sourceMapBytes),
        runStatus: run.status,
        runConclusion: run.conclusion
    };
}

async function retry(operation, count, delayMs) {
    let lastError;
    for (let attempt = 1; attempt <= count; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt < count && delayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }
    throw lastError;
}

async function fetchJson(rawUrl) {
    const bytes = await fetchBytes(rawUrl);
    return JSON.parse(bytes.toString("utf8"));
}

async function fetchBytes(rawUrl) {
    const url = new URL(rawUrl);
    url.searchParams.set("rau-next-publication-check", `${Date.now()}-${Math.random()}`);
    const response = await fetch(url, {
        cache: "no-store",
        headers: { "cache-control": "no-cache" }
    });
    assert.equal(response.ok, true, `${rawUrl} must be readable`);
    return Buffer.from(await response.arrayBuffer());
}

function readArgument(name, pattern) {
    const value = readOptionalArgument(name, "", pattern);
    assert.notEqual(value, "", `${name} is required`);
    return value;
}

function readOptionalArgument(name, fallback, pattern) {
    const index = process.argv.indexOf(name);
    const value = index === -1 ? fallback : (process.argv[index + 1] ?? "");
    assert.match(value, pattern, `${name} is missing or invalid`);
    return value;
}

function readMetadataValue(source, key) {
    const match = source.match(new RegExp("^// @" + key + "\\s+(.+)$", "m"));
    assert.notEqual(match, null, `missing userscript @${key}`);
    return match[1].trim();
}

function countMatches(content, pattern) {
    return Array.from(content.matchAll(pattern)).length;
}

function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}
