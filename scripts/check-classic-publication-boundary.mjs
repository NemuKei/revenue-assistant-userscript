import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const manifestPath = new URL(".github/classic-publication-baseline.json", projectRoot);
const workflowPath = new URL(".github/workflows/publish-userscript.yml", projectRoot);
const workflowsDirectory = new URL(".github/workflows/", projectRoot);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const workflow = await readFile(workflowPath, "utf8");
const liveCheck = process.argv.includes("--live");

const expectedWorkflow = `name: Verify Frozen Classic Publication

env:
    FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

on:
    workflow_dispatch:

permissions:
    contents: read

concurrency:
    group: verify-classic-publication
    cancel-in-progress: false

jobs:
    verify:
        runs-on: ubuntu-latest

        steps:
            - name: Checkout publication controls
              uses: actions/checkout@v7

            - name: Verify frozen Classic publication baseline
              run: node scripts/check-classic-publication-boundary.mjs --live
`;

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.productLine, "Classic");
assert.equal(manifest.publicationState, "frozen");
assert.equal(manifest.workflowMode, "verify-only");
assert.match(manifest.publishedUrl, /^https:\/\/nemukei\.github\.io\/revenue-assistant-userscript\/.+\.user\.js$/);
assert.equal(manifest.publishedName, "Revenue Assistant Userscript");
assert.equal(manifest.namespace, "https://NemuKei.github.io/revenue-assistant-userscript");
assert.equal(manifest.updateURL, manifest.downloadURL);
assert.equal(manifest.updateURL.toLowerCase(), manifest.publishedUrl.toLowerCase());
assert.equal(manifest.match, "https://ra.jalan.net/*");
assert.equal(manifest.grant, "none");
assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/);
assert.ok(Number.isInteger(manifest.workflowRunId) && manifest.workflowRunId > 0);
assert.ok(Number.isInteger(manifest.workflowRunNumber) && manifest.workflowRunNumber > 0);
assert.equal(manifest.workflowRunName, "Publish Userscript");
assert.equal(manifest.workflowRunEvent, "push");
assert.equal(manifest.workflowRunConclusion, "success");
assert.equal(manifest.workflowRunAttempt, 1);
assert.equal(manifest.workflowHeadBranch, "main");
assert.equal(manifest.workflowPath, ".github/workflows/publish-userscript.yml");
assert.equal(
    manifest.workflowRunUrl,
    `https://github.com/NemuKei/revenue-assistant-userscript/actions/runs/${manifest.workflowRunId}`
);
assert.match(manifest.publishedVersion, /^\d+\.\d+\.\d+\.\d+$/);
assert.equal(
    manifest.publishedVersion.split(".").at(-1),
    String(manifest.workflowRunNumber),
    "the published version suffix must match the recorded workflow run"
);
assert.ok(Number.isInteger(manifest.publishedBytes) && manifest.publishedBytes > 0);
assert.match(manifest.sha256, /^[0-9A-F]{64}$/);
assert.match(manifest.observedDate, /^\d{4}-\d{2}-\d{2}$/);

assert.equal(
    workflow.replaceAll("\r\n", "\n"),
    expectedWorkflow,
    "Classic workflow must remain the exact read-only, verify-only contract"
);

const expectedWorkflowNames = [
    "publish-userscript.yml",
    "validate-main.yml",
    "validate-pr.yml"
];
const workflowNames = (await readdir(workflowsDirectory))
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
assert.deepEqual(
    workflowNames,
    expectedWorkflowNames,
    "workflow allowlist changed; review the frozen publication boundary explicitly"
);
for (const workflowName of workflowNames) {
    const source = await readFile(new URL(workflowName, workflowsDirectory), "utf8");
    assert.doesNotMatch(source, /^\s*pages:\s*write\s*$/m, `${workflowName} must not write Pages`);
    assert.doesNotMatch(source, /^\s*id-token:\s*write\s*$/m, `${workflowName} must not mint a deploy token`);
    assert.doesNotMatch(source, /actions\/configure-pages@/i, `${workflowName} must not configure Pages`);
    assert.doesNotMatch(source, /actions\/upload-pages-artifact@/i, `${workflowName} must not upload Pages`);
    assert.doesNotMatch(source, /actions\/deploy-pages@/i, `${workflowName} must not deploy Pages`);
    assert.doesNotMatch(source, /GITHUB_PAGES_BASE_URL/, `${workflowName} must not create a publication build`);
}

const result = {
    mode: liveCheck ? "live" : "offline",
    sourceCommit: manifest.sourceCommit,
    publishedVersion: manifest.publishedVersion,
    publishedBytes: manifest.publishedBytes,
    sha256: manifest.sha256
};

if (liveCheck) {
    const runResponse = await fetch(
        `https://api.github.com/repos/NemuKei/revenue-assistant-userscript/actions/runs/${manifest.workflowRunId}`,
        {
            cache: "no-store",
            headers: {
                accept: "application/vnd.github+json",
                "user-agent": "revenue-assistant-userscript-publication-check"
            }
        }
    );
    assert.equal(runResponse.ok, true, "recorded GitHub Actions run must be readable");
    const run = await runResponse.json();
    assert.equal(run.id, manifest.workflowRunId);
    assert.equal(run.run_number, manifest.workflowRunNumber);
    assert.equal(run.name, manifest.workflowRunName);
    assert.equal(run.head_sha, manifest.sourceCommit);
    assert.equal(run.event, manifest.workflowRunEvent);
    assert.equal(run.status, "completed");
    assert.equal(run.conclusion, manifest.workflowRunConclusion);
    assert.equal(run.run_attempt, manifest.workflowRunAttempt);
    assert.equal(run.head_branch, manifest.workflowHeadBranch);
    assert.equal(run.path, manifest.workflowPath);
    assert.equal(run.html_url, manifest.workflowRunUrl);

    const verificationUrl = new URL(manifest.publishedUrl);
    verificationUrl.searchParams.set("rau-baseline-check", Date.now().toString());
    const response = await fetch(verificationUrl, {
        cache: "no-store",
        headers: { "cache-control": "no-cache" }
    });
    assert.equal(response.ok, true, "published Classic artifact must be readable");
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase();
    const text = bytes.toString("utf8");
    const publishedVersion = readMetadataValue(text, "version");
    const publishedName = readMetadataValue(text, "name");
    const namespace = readMetadataValue(text, "namespace");
    const updateURL = readMetadataValue(text, "updateURL");
    const downloadURL = readMetadataValue(text, "downloadURL");
    const match = readMetadataValue(text, "match");
    const grant = readMetadataValue(text, "grant");

    assert.equal(publishedName, manifest.publishedName);
    assert.equal(namespace, manifest.namespace);
    assert.equal(updateURL, manifest.updateURL);
    assert.equal(downloadURL, manifest.downloadURL);
    assert.equal(match, manifest.match);
    assert.equal(grant, manifest.grant);
    assert.equal(publishedVersion, manifest.publishedVersion);
    assert.equal(bytes.length, manifest.publishedBytes);
    assert.equal(sha256, manifest.sha256);
    result.observedBytes = bytes.length;
    result.observedSha256 = sha256;
    result.observedRunId = run.id;
    result.observedRunHead = run.head_sha;
}

console.log(JSON.stringify(result, null, 2));

function readMetadataValue(source, key) {
    const match = source.match(new RegExp("^// @" + key + "\\s+(.+)$", "m"));
    assert.notEqual(match, null, "missing userscript @" + key);
    return match[1].trim();
}
