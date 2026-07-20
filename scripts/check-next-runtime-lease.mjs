import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as ts from "typescript";

const source = await readFile(new URL("../src/next/runtimeLease.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022
    }
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const {
    LEGACY_CLASSIC_SENTINEL_SELECTORS,
    REVENUE_ASSISTANT_RUNTIME_LEASE_SYMBOL,
    detectLegacyClassicRuntime,
    getRevenueAssistantRuntimeOwner,
    startRevenueAssistantRuntime
} = await import(moduleUrl);
const markerSource = await readFile(new URL("../src/next/runtimeMarker.ts", import.meta.url), "utf8");
const markerTranspiled = ts.transpileModule(markerSource, {
    compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022
    }
}).outputText;
const markerModuleUrl = `data:text/javascript;base64,${Buffer.from(markerTranspiled).toString("base64")}`;
const {
    NEXT_RUNTIME_READY_STATE,
    resolveNextRuntimeMarker
} = await import(markerModuleUrl);

verifySingleOwner("classic", "next");
verifySingleOwner("next", "classic");
verifySameEntryStartsOnce();
verifyDuplicateNextKeepsReadyMarker();
verifyInvalidLeaseFailsClosed();
verifyLegacySentinelsFailClosed();
verifyNonExtensibleHostFailsClosed();
verifyStartFailureKeepsLease();
verifyLeaseDescriptor();

console.log("Next runtime lease checks passed");

function verifySingleOwner(firstMode, secondMode) {
    const host = {};
    const starts = [];
    const first = startRevenueAssistantRuntime({
        requestedMode: firstMode,
        host,
        legacyDomDetected: false,
        start: () => starts.push(firstMode)
    });
    const second = startRevenueAssistantRuntime({
        requestedMode: secondMode,
        host,
        legacyDomDetected: false,
        start: () => starts.push(secondMode)
    });
    assert.equal(first.started, true);
    assert.deepEqual(second, { started: false, reason: "lease-held", owner: firstMode });
    assert.deepEqual(starts, [firstMode]);
}

function verifySameEntryStartsOnce() {
    const host = {};
    let startCount = 0;
    const start = () => {
        startCount += 1;
    };
    startRevenueAssistantRuntime({ requestedMode: "next", host, legacyDomDetected: false, start });
    const second = startRevenueAssistantRuntime({ requestedMode: "next", host, legacyDomDetected: false, start });
    assert.equal(second.started, false);
    assert.equal(second.reason, "lease-held");
    assert.equal(startCount, 1);
}

function verifyDuplicateNextKeepsReadyMarker() {
    assert.equal(
        resolveNextRuntimeMarker(
            { started: true, reason: "started", owner: "next" },
            null
        ),
        NEXT_RUNTIME_READY_STATE
    );
    assert.equal(
        resolveNextRuntimeMarker(
            { started: false, reason: "lease-held", owner: "next" },
            NEXT_RUNTIME_READY_STATE
        ),
        NEXT_RUNTIME_READY_STATE
    );
    assert.equal(
        resolveNextRuntimeMarker(
            { started: false, reason: "lease-held", owner: "next" },
            null
        ),
        "blocked-lease-held"
    );
    assert.equal(
        resolveNextRuntimeMarker(
            { started: false, reason: "lease-held", owner: "classic" },
            NEXT_RUNTIME_READY_STATE
        ),
        "blocked-lease-held"
    );
}

function verifyInvalidLeaseFailsClosed() {
    const host = {};
    Object.defineProperty(host, REVENUE_ASSISTANT_RUNTIME_LEASE_SYMBOL, {
        value: { schemaVersion: 99, owner: "next" }
    });
    let started = false;
    const result = startRevenueAssistantRuntime({
        requestedMode: "next",
        host,
        legacyDomDetected: false,
        start: () => {
            started = true;
        }
    });
    assert.deepEqual(result, { started: false, reason: "invalid-lease", owner: null });
    assert.equal(started, false);
    assert.equal(getRevenueAssistantRuntimeOwner(host), "invalid");
}

function verifyLegacySentinelsFailClosed() {
    for (const activeSelector of LEGACY_CLASSIC_SENTINEL_SELECTORS) {
        const documentHost = {
            querySelector: (selector) => selector === activeSelector ? {} : null
        };
        assert.equal(detectLegacyClassicRuntime(documentHost), true, activeSelector);
    }
    assert.equal(detectLegacyClassicRuntime({ querySelector: () => null }), false);

    let started = false;
    const result = startRevenueAssistantRuntime({
        requestedMode: "next",
        host: {},
        legacyDomDetected: true,
        start: () => {
            started = true;
        }
    });
    assert.deepEqual(result, { started: false, reason: "legacy-runtime-detected", owner: null });
    assert.equal(started, false);
}

function verifyNonExtensibleHostFailsClosed() {
    const host = Object.preventExtensions({});
    let started = false;
    const result = startRevenueAssistantRuntime({
        requestedMode: "next",
        host,
        legacyDomDetected: false,
        start: () => {
            started = true;
        }
    });
    assert.deepEqual(result, { started: false, reason: "lock-unavailable", owner: null });
    assert.equal(started, false);
}

function verifyStartFailureKeepsLease() {
    const host = {};
    assert.throws(() => startRevenueAssistantRuntime({
        requestedMode: "next",
        host,
        legacyDomDetected: false,
        start: () => {
            throw new Error("synthetic start failure");
        }
    }), /synthetic start failure/u);
    assert.equal(getRevenueAssistantRuntimeOwner(host), "next");
    const fallback = startRevenueAssistantRuntime({
        requestedMode: "classic",
        host,
        legacyDomDetected: false,
        start: () => assert.fail("fallback must remain blocked")
    });
    assert.deepEqual(fallback, { started: false, reason: "lease-held", owner: "next" });
}

function verifyLeaseDescriptor() {
    const host = {};
    startRevenueAssistantRuntime({
        requestedMode: "next",
        host,
        legacyDomDetected: false,
        start: () => undefined
    });
    const descriptor = Object.getOwnPropertyDescriptor(host, REVENUE_ASSISTANT_RUNTIME_LEASE_SYMBOL);
    assert.equal(descriptor?.enumerable, false);
    assert.equal(descriptor?.writable, false);
    assert.equal(descriptor?.configurable, false);
    assert.equal(Object.isFrozen(descriptor?.value), true);
}
