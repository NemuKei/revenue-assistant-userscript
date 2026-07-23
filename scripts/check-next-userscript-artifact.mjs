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
const sourceMapPath = `${artifactPath}.map`;
const relativeArtifactPath = path.relative(projectRoot, artifactPath);
const artifactText = await readFile(artifactPath, "utf8");
const sourceMap = JSON.parse(await readFile(sourceMapPath, "utf8"));
const metadata = parseUserscriptMetadata(artifactText);

const expectedSources = [
    "src/bookingCurveRawSourceContract.ts",
    "src/competitorPriceSnapshotContract.ts",
    "src/curveCore.ts",
    "src/indexedDbReadOnly.ts",
    "src/leadTimeBuckets.ts",
    "src/next/analyze/bookingCurveReferenceDataSource.ts",
    "src/next/analyze/bookingCurveReferenceModel.ts",
    "src/next/analyze/bookingCurveReferenceRuntime.ts",
    "src/next/analyze/bookingCurveReferenceView.ts",
    "src/next/analyze/bookingCurveRankMarkerModel.ts",
    "src/next/analyze/bookingCurveRankStatusDataSource.ts",
    "src/next/analyze/competitorHistoryDataSource.ts",
    "src/next/analyze/competitorHistoryModel.ts",
    "src/next/analyze/competitorHistoryRuntime.ts",
    "src/next/analyze/competitorHistorySnapshotStore.ts",
    "src/next/analyze/competitorHistoryView.ts",
    "src/next/analyze/competitorHistoryWriter.ts",
    "src/next/analyze/priceTrendComparisonDataSource.ts",
    "src/next/analyze/priceTrendComparisonModel.ts",
    "src/next/analyze/priceTrendComparisonRuntime.ts",
    "src/next/analyze/priceTrendComparisonView.ts",
    "src/next/analyze/priceTrendCaptureStore.ts",
    "src/next/analyze/priceTrendCaptureWriter.ts",
    "src/next/bookingCurve/bookingCurveAcquisitionCoordinator.ts",
    "src/next/bookingCurve/bookingCurveAcquisitionModel.ts",
    "src/next/bookingCurve/bookingCurveAcquisitionRuntime.ts",
    "src/next/bookingCurve/bookingCurveSourceStore.ts",
    "src/next/entry.ts",
    "src/next/facilityContext.ts",
    "src/next/live/liveCalendarDomAdapter.ts",
    "src/next/live/liveSimilarityLensDataSource.ts",
    "src/next/live/liveSimilarityLensEvidence.ts",
    "src/next/live/liveSimilarityLensRuntime.ts",
    "src/next/live/liveSimilarityLensState.ts",
    "src/next/live/liveSimilarityLensTransport.ts",
    "src/next/live/liveSimilarityLensView.ts",
    "src/next/live/liveSimilarityLensViewModel.ts",
    "src/next/runtimeLease.ts",
    "src/next/runtimeMarker.ts",
    "src/next/similarityLensModel.ts"
].sort();
assert.equal(Array.isArray(sourceMap.sources), true, "Next source map must include sources");
assert.equal(Array.isArray(sourceMap.sourcesContent), true, "Next source map must include sourcesContent");
assert.equal(sourceMap.sources.length, sourceMap.sourcesContent.length);
assert.equal(sourceMap.sourcesContent.every((content) => typeof content === "string"), true);
const normalizedSources = sourceMap.sources.map(normalizeSourceMapPath).sort();
assert.deepEqual(
    normalizedSources,
    expectedSources,
    "Next candidate runtime source graph must remain exactly allowlisted"
);
assert.equal(normalizedSources.includes("src/main.ts"), false);
assert.equal(normalizedSources.includes("src/bookingCurveRawSourceStore.ts"), false);
assert.equal(normalizedSources.includes("src/competitorPriceSnapshotStore.ts"), false);
assert.equal(normalizedSources.some((source) => source.includes("/dev/")), false);

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
assert.deepEqual(metadata.get("match"), ["https://ra.jalan.net/*"]);
assert.deepEqual(metadata.get("grant"), ["none"]);
assert.deepEqual(metadata.get("run-at"), ["document-idle"]);
assert.deepEqual(
    Array.from(metadata.keys()).sort(),
    ["author", "description", "grant", "match", "name", "namespace", "run-at", "version"],
    "Next candidate metadata keys must stay allowlisted"
);
assert.equal(metadata.has("updateURL"), false, "Next candidate must not self-update");
assert.equal(metadata.has("downloadURL"), false, "Next candidate must not publish a download URL");
assert.equal(metadata.has("connect"), false, "Next candidate must not declare network hosts");
assert.equal(metadata.has("require"), false, "Next candidate must not load remote code");
assert.equal(metadata.has("resource"), false, "Next candidate must not load remote resources");
assert.match(artifactText, /data-ra-next-runtime-state/u);
assert.match(artifactText, /ready-read-only/u);
assert.match(artifactText, /data-ra-next-similarity-lens-root/u);
assert.match(artifactText, /data-ra-next-competitor-history-root/u);
assert.match(artifactText, /data-ra-next-booking-curve-reference-root/u);
assert.match(artifactText, /data-ra-next-booking-curve-rank-marker/u);
assert.match(artifactText, /data-ra-next-price-trend-comparison-root/u);
assert.match(artifactText, /data-ra-next-price-trend-capture/u);
assert.match(artifactText, /data-ra-next-booking-curve-acquisition-root/u);
assert.match(artifactText, /data-ra-next-analyze-state/u);
assert.match(artifactText, /data-ra-next-booking-curve-state/u);
assert.match(artifactText, /data-ra-next-price-trend-state/u);
assert.match(artifactText, /server-read-only\/local-bounded-history/u);
assert.equal(countMatches(artifactText, /\bfetch\b/gu), 1, "Next candidate must contain one raw fetch");
assert.equal(countMatches(artifactText, /\.fetch\s*\(/gu), 1, "raw fetch must have one call site");
assert.equal(countMatches(artifactText, /\/api\/v2\/yad\/info/gu), 1);
assert.equal(countMatches(artifactText, /\/api\/v2\/competitors/gu), 1);
assert.equal(countMatches(artifactText, /\/api\/v1\/price_trends/gu) >= 1, true);
assert.equal(countMatches(artifactText, /\/api\/v1\/suggest\/output\/current_settings/gu), 1);
assert.equal(countMatches(artifactText, /\/api\/v3\/lincoln\/suggest\/status/gu), 1);
assert.equal(
    countMatches(artifactText, /\/api\/v4\/booking_curve/gu) >= 1,
    true,
    "booking endpoint contract must remain present for cache validation"
);
assert.equal(
    countMatches(artifactText, /\/api\/v5\/competitor_prices/gu) >= 1,
    true,
    "competitor endpoint contract must remain present for cache validation"
);
assert.equal(countMatches(artifactText, /\.transaction\s*\(/gu), 9);
assert.equal(countMatches(artifactText, /\.getAll\s*\(/gu), 4);
assert.equal(countMatches(artifactText, /\.openCursor\s*\(/gu), 1);
assert.match(artifactText, /readonly/u);
assert.match(artifactText, /readwrite/u);
assert.equal(countMatches(artifactText, /\.createObjectStore\s*\(/gu), 3);
assert.equal(countMatches(artifactText, /\.createIndex\s*\(/gu), 5);
assert.match(artifactText, /revenue-assistant-next-competitor-price-snapshots/u);
assert.match(artifactText, /revenue-assistant-next-price-trends/u);
assert.match(artifactText, /revenue-assistant-next-booking-curve-sources/u);
assert.match(artifactText, /GET/u);

for (const forbiddenPattern of [
    /\bXMLHttpRequest\s*\(/u,
    /\bsendBeacon\b/u,
    /\bWebSocket\b/u,
    /\bEventSource\b/u,
    /\bSharedWorker\b/u,
    /\bWorker\b/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bdocument\.cookie\b/u,
    /\bdeleteObjectStore\b/u,
    /\bdeleteDatabase\b/u,
    /\bdeleteIndex\b/u,
    /\.put\s*\(/u,
    /["'](?:POST|PUT|PATCH|DELETE)["']/u,
    /\.requestSubmit\s*\(/u,
    /\.submit\s*\(/u,
    /\.location\.(?:assign|replace)\s*\(/u
]) {
    assert.equal(
        forbiddenPattern.test(artifactText),
        false,
        `Next candidate shell must not include ${forbiddenPattern}`
    );
}

console.log(JSON.stringify({
    artifact: relativeArtifactPath,
    name: metadata.get("name")?.[0] ?? null,
    namespace: metadata.get("namespace")?.[0] ?? null,
    version: metadata.get("version")?.[0] ?? null,
    updateURL: metadata.get("updateURL")?.[0] ?? null,
    downloadURL: metadata.get("downloadURL")?.[0] ?? null,
    mode: "server-read-only/local-bounded-history"
}, null, 2));

function normalizeSourceMapPath(value) {
    return value.replaceAll("\\", "/").replace(/^(?:\.\.\/)+/u, "");
}

function countMatches(content, pattern) {
    return Array.from(content.matchAll(pattern)).length;
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
