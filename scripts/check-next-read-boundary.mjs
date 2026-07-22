import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const nextSourceRoot = path.join(projectRoot, "src", "next");
const entryPath = path.join(nextSourceRoot, "entry.ts");
const transportPath = path.join(nextSourceRoot, "live", "liveSimilarityLensTransport.ts");
const indexedDbPath = path.join(projectRoot, "src", "indexedDbReadOnly.ts");

const expectedApiPaths = [
    "/api/v1/suggest/output/current_settings",
    "/api/v2/yad/info"
];
const expectedRequestKinds = ["current-settings", "facility"];
const expectedFetchOptionKeys = ["credentials", "headers", "method", "signal"];
const expectedHeaderEntries = [["X-Requested-With", "XMLHttpRequest"]];
const forbiddenTransportIdentifiers = new Set([
    "EventSource",
    "GM_xmlhttpRequest",
    "SharedWorker",
    "WebSocket",
    "Worker",
    "XMLHttpRequest",
    "sendBeacon"
]);
const forbiddenIndexedDbMethods = new Set([
    "add",
    "clear",
    "createIndex",
    "createObjectStore",
    "delete",
    "deleteDatabase",
    "deleteIndex",
    "deleteObjectStore",
    "put",
    "update"
]);
const allowedIndexedDbMethods = new Set([
    "abort",
    "close",
    "databases",
    "get",
    "getAll",
    "index",
    "objectStore",
    "open",
    "transaction"
]);
const allowedSharedRuntimeSources = new Set([
    "src/bookingCurveRawSourceContract.ts",
    "src/competitorPriceSnapshotContract.ts",
    "src/curveCore.ts",
    "src/indexedDbReadOnly.ts",
    "src/rankRecommendation.ts"
]);
const forbiddenRuntimeSources = new Set([
    "src/bookingCurveRawSourceStore.ts",
    "src/competitorPriceSnapshotStore.ts",
    "src/main.ts",
    "src/priceTrendStore.ts",
    "src/rankRecommendationDecisionStore.ts",
    "src/rankRecommendationWriteAdapter.ts"
]);

assert.equal(existsSync(entryPath), true, "Next entry source is required");
assert.equal(existsSync(transportPath), true, "Next read transport source is required");
assert.equal(existsSync(indexedDbPath), true, "strict readonly IndexedDB source is required");

const tsconfigPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
assert.notEqual(tsconfigPath, undefined, "tsconfig.json is required for type-aware boundary checks");
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
assert.equal(configFile.error, undefined, formatDiagnostic(configFile.error));
const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath),
    { noEmit: true },
    tsconfigPath
);
assert.equal(parsedConfig.errors.length, 0, parsedConfig.errors.map(formatDiagnostic).join("\n"));
const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options
});
const checker = program.getTypeChecker();

const nextCandidatePaths = collectTypeScriptFiles(nextSourceRoot)
    .filter((filePath) => !isWithinDirectory(filePath, path.join(nextSourceRoot, "dev")));
const reviewedSharedPaths = Array.from(allowedSharedRuntimeSources)
    .map((projectPath) => path.join(projectRoot, ...projectPath.split("/")))
    .filter((filePath) => existsSync(filePath));
const inspectedPaths = Array.from(new Set([...nextCandidatePaths, ...reviewedSharedPaths]));
const inspectedSources = inspectedPaths.map(getProgramSourceFile);
const transportSource = getProgramSourceFile(transportPath);

checkTransportBoundary(inspectedSources, transportSource);
checkIndexedDbBoundary(inspectedSources);
const runtimeGraph = checkRuntimeImportBoundary(inspectedPaths);

console.log(JSON.stringify({
    checkedNextSourceFiles: nextCandidatePaths.length,
    runtimeGraphFiles: runtimeGraph.size,
    rawFetchCount: 1,
    allowedApiPaths: expectedApiPaths,
    indexedDbOwner: toProjectPath(indexedDbPath),
    indexedDbMode: "readonly"
}, null, 2));

function checkTransportBoundary(sources, source) {
    const fetchReferences = [];
    const forbiddenReferences = [];

    for (const currentSource of sources) {
        walk(currentSource, (node) => {
            if (isFetchReference(node)) {
                fetchReferences.push({ source: currentSource, node });
            }
            if (
                ts.isIdentifier(node)
                && forbiddenTransportIdentifiers.has(node.text)
                && isRuntimeIdentifierReference(node)
            ) {
                forbiddenReferences.push({ source: currentSource, node });
            }
            if (
                ts.isElementAccessExpression(node)
                && forbiddenTransportIdentifiers.has(getStringLiteralText(node.argumentExpression))
            ) {
                forbiddenReferences.push({ source: currentSource, node });
            }
        });
    }

    assert.equal(
        forbiddenReferences.length,
        0,
        formatNodeList("forbidden transport primitive", forbiddenReferences)
    );
    assert.equal(
        fetchReferences.length,
        1,
        `Next runtime must contain exactly one raw fetch reference; found ${fetchReferences.length}`
    );
    const fetchReference = fetchReferences[0];
    assert.equal(
        normalizePath(fetchReference.source.fileName),
        normalizePath(transportPath),
        `raw fetch must be owned by ${toProjectPath(transportPath)}`
    );
    const fetchCall = getReferenceCall(fetchReference.node);
    assert.notEqual(fetchCall, null, "raw fetch may not be aliased or passed as a value");
    assert.equal(fetchCall.arguments.length, 2, "raw fetch must receive URL and explicit GET options");
    assert.equal(
        fetchCall.arguments[0]?.getText(source),
        "url.toString()",
        "raw fetch URL must come from the closed buildNextReadUrl result"
    );

    const options = fetchCall.arguments[1];
    assert.equal(ts.isObjectLiteralExpression(options), true, "raw fetch options must be an object literal");
    const optionEntries = getObjectLiteralEntries(options);
    assert.deepEqual(
        Array.from(optionEntries.keys()).sort(),
        expectedFetchOptionKeys,
        "raw fetch options must remain the exact read-only allowlist"
    );
    assert.equal(getStringProperty(optionEntries, "method"), "GET", "raw fetch must explicitly use GET");
    assert.equal(
        getStringProperty(optionEntries, "credentials"),
        "include",
        "raw fetch must use same-session credentials"
    );
    const signalProperty = optionEntries.get("signal");
    assert.notEqual(signalProperty, undefined, "raw fetch must forward AbortSignal");
    assert.equal(
        getPropertyValueText(signalProperty, source),
        "signal",
        "raw fetch must use the selection session AbortSignal"
    );

    const headersProperty = optionEntries.get("headers");
    assert.notEqual(headersProperty, undefined, "raw fetch headers are required");
    const headersValue = getPropertyValue(headersProperty);
    assert.equal(ts.isObjectLiteralExpression(headersValue), true, "raw fetch headers must be an object literal");
    const headerEntries = getObjectLiteralEntries(headersValue);
    assert.deepEqual(
        Array.from(headerEntries.entries())
            .map(([key, property]) => [key, getStringPropertyValue(property)])
            .sort(([left], [right]) => left.localeCompare(right)),
        expectedHeaderEntries,
        "raw fetch headers must remain the exact X-Requested-With allowlist"
    );

    const apiPaths = collectStringLiterals(source)
        .filter((value) => value.startsWith("/api/"))
        .sort();
    assert.deepEqual(apiPaths, expectedApiPaths, "Next transport API path allowlist changed");
    assert.deepEqual(
        collectNextReadRequestKinds(source).sort(),
        expectedRequestKinds,
        "NextReadRequest kinds must remain facility and current-settings only"
    );

    const urlConstructions = collectNodes(source, (node) => (
        ts.isNewExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "URL"
    ));
    assert.equal(urlConstructions.length, 2, "Next transport must construct exactly two allowlisted URLs");
    assert.deepEqual(
        urlConstructions.map((node) => node.arguments?.[0]?.getText(source) ?? "").sort(),
        ["NEXT_CURRENT_SETTINGS_ENDPOINT", "NEXT_FACILITY_ENDPOINT"],
        "Next transport URL constructors must use the two closed endpoint constants"
    );
    for (const construction of urlConstructions) {
        assert.equal(
            construction.arguments?.[1]?.getText(source),
            "origin",
            "Next transport URLs must be constructed against the supplied same-origin base"
        );
    }

    const urlBuilderCalls = collectNodes(source, (node) => (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "buildNextReadUrl"
    ));
    assert.equal(urlBuilderCalls.length, 1, "browser transport must invoke buildNextReadUrl exactly once");
    assert.equal(
        urlBuilderCalls[0].arguments[1]?.getText(source),
        "windowHost.location.origin",
        "browser transport must anchor URL construction to window.location.origin"
    );

    const searchParameterCalls = collectNodes(source, isSearchParameterSetCall);
    assert.deepEqual(
        searchParameterCalls.map((call) => [
            getStringLiteralText(call.arguments[0]),
            call.arguments[1]?.getText(source) ?? ""
        ]).sort(([left], [right]) => left.localeCompare(right)),
        [["from", "request.from"], ["to", "request.to"]],
        "current-settings query parameters must remain exact from/to values"
    );
}

function checkIndexedDbBoundary(sources) {
    const directReferences = [];
    const transactionCalls = [];
    const getAllCalls = [];
    const forbiddenCalls = [];
    const readwriteLiterals = [];

    for (const source of sources) {
        walk(source, (node) => {
            if (isIndexedDbReference(node)) {
                directReferences.push({ source, node });
            }
            if (ts.isStringLiteralLike(node) && node.text === "readwrite") {
                readwriteLiterals.push({ source, node });
            }
            if (!ts.isCallExpression(node)) {
                return;
            }
            const member = getCalledMember(node.expression);
            if (member === null) {
                return;
            }
            const receiverType = checker.getTypeAtLocation(member.receiver);
            if (!isIndexedDbType(receiverType)) {
                if (
                    forbiddenIndexedDbMethods.has(member.name)
                    && isAnyOrUnknownType(receiverType)
                    && normalizePath(source.fileName) === normalizePath(indexedDbPath)
                ) {
                    forbiddenCalls.push({ source, node, reason: `${member.name} on untyped receiver` });
                }
                return;
            }
            if (normalizePath(source.fileName) !== normalizePath(indexedDbPath)) {
                forbiddenCalls.push({ source, node, reason: `${member.name} outside readonly helper` });
                return;
            }
            if (!allowedIndexedDbMethods.has(member.name)) {
                forbiddenCalls.push({ source, node, reason: `${member.name} outside read allowlist` });
                return;
            }
            if (member.name === "transaction") {
                transactionCalls.push({ source, node });
            }
            if (member.name === "getAll") {
                getAllCalls.push({ source, node });
            }
            if (forbiddenIndexedDbMethods.has(member.name)) {
                forbiddenCalls.push({ source, node, reason: member.name });
            }
        });
    }

    assert.equal(directReferences.length > 0, true, "readonly IndexedDB helper must own the direct IndexedDB access");
    for (const reference of directReferences) {
        assert.equal(
            normalizePath(reference.source.fileName),
            normalizePath(indexedDbPath),
            `direct indexedDB access is restricted to ${toProjectPath(indexedDbPath)}; found ${formatNode(reference)}`
        );
    }
    assert.equal(readwriteLiterals.length, 0, formatNodeList("readwrite IndexedDB mode", readwriteLiterals));
    assert.equal(forbiddenCalls.length, 0, formatReasonNodeList("forbidden IndexedDB mutation", forbiddenCalls));
    assert.equal(transactionCalls.length > 0, true, "readonly helper must contain an explicit IndexedDB transaction");
    for (const transaction of transactionCalls) {
        assert.equal(
            normalizePath(transaction.source.fileName),
            normalizePath(indexedDbPath),
            `IndexedDB transactions are restricted to ${toProjectPath(indexedDbPath)}`
        );
        assert.equal(transaction.node.arguments.length, 2, "IndexedDB transaction must use an explicit two-argument readonly call");
        assert.equal(
            getStringLiteralText(transaction.node.arguments[1]),
            "readonly",
            "IndexedDB transaction mode must be the readonly literal"
        );
    }
    for (const getAll of getAllCalls) {
        assert.equal(
            getAll.node.arguments.length,
            2,
            `IndexedDB getAll must have an explicit key/range and count limit: ${formatNode(getAll)}`
        );
        assert.equal(
            getAll.node.arguments[1]?.getText(getAll.source),
            "EXISTING_INDEXED_DB_RECORDS_PER_INDEX_KEY_LIMIT",
            `IndexedDB getAll must use the reviewed fixed count limit: ${formatNode(getAll)}`
        );
    }
    const primaryKeyGetCalls = collectNodes(getProgramSourceFile(indexedDbPath), (node) => {
        if (!ts.isCallExpression(node)) {
            return false;
        }
        const member = getCalledMember(node.expression);
        return member !== null
            && member.name === "get"
            && isIndexedDbType(checker.getTypeAtLocation(member.receiver));
    });
    assert.equal(primaryKeyGetCalls.length, 1, "readonly helper must have one exact primary-key get call");
    assert.equal(
        primaryKeyGetCalls[0].arguments.length,
        1,
        "IndexedDB primary-key get must receive exactly one explicit key"
    );
    const recordLimitDeclarations = collectNodes(getProgramSourceFile(indexedDbPath), (node) => (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.name.text === "EXISTING_INDEXED_DB_RECORDS_PER_INDEX_KEY_LIMIT"
    ));
    assert.equal(recordLimitDeclarations.length, 1, "readonly IndexedDB record limit must be declared once");
    assert.equal(
        getNumericLiteralValue(recordLimitDeclarations[0].initializer),
        1,
        "readonly IndexedDB index reads must materialize at most one record per exact key"
    );
}

function checkRuntimeImportBoundary(reviewedPaths) {
    const graph = new Map();

    for (const filePath of reviewedPaths) {
        const source = getProgramSourceFile(filePath);
        const imports = collectRuntimeModuleSpecifiers(source);
        const edges = [];
        for (const moduleSpecifier of imports) {
            assert.equal(
                moduleSpecifier.text.startsWith("."),
                true,
                `Next runtime may not import external package '${moduleSpecifier.text}' from ${toProjectPath(filePath)}`
            );
            const resolved = resolveRuntimeImport(filePath, moduleSpecifier.text);
            const projectPath = toProjectPath(resolved);
            assert.equal(
                forbiddenRuntimeSources.has(projectPath),
                false,
                `Next runtime may not import Classic/write implementation ${projectPath} from ${toProjectPath(filePath)}`
            );
            assert.equal(
                projectPath.startsWith("src/next/") || allowedSharedRuntimeSources.has(projectPath),
                true,
                `Next runtime import ${projectPath} is outside the reviewed source allowlist`
            );
            edges.push(resolved);
        }
        assert.equal(
            collectDynamicImports(source).length,
            0,
            `dynamic import is not allowed in Next runtime candidate source: ${toProjectPath(filePath)}`
        );
        graph.set(normalizePath(filePath), edges);
    }

    const reachable = new Set();
    const pending = [entryPath];
    while (pending.length > 0) {
        const filePath = pending.pop();
        const normalized = normalizePath(filePath);
        if (reachable.has(normalized)) {
            continue;
        }
        reachable.add(normalized);
        for (const dependency of graph.get(normalized) ?? collectRuntimeDependencies(filePath)) {
            const dependencyProjectPath = toProjectPath(dependency);
            assert.equal(
                forbiddenRuntimeSources.has(dependencyProjectPath),
                false,
                `Next entry runtime graph reached forbidden source ${dependencyProjectPath}`
            );
            if (graph.has(normalizePath(dependency))) {
                pending.push(dependency);
            }
        }
    }
    return reachable;
}

function collectRuntimeDependencies(filePath) {
    const source = getProgramSourceFile(filePath);
    return collectRuntimeModuleSpecifiers(source).map((specifier) => {
        assert.equal(
            specifier.text.startsWith("."),
            true,
            `runtime dependency must be local: ${specifier.text}`
        );
        return resolveRuntimeImport(filePath, specifier.text);
    });
}

function collectRuntimeModuleSpecifiers(source) {
    const specifiers = [];
    for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
            if (importDeclarationHasRuntimeBindings(statement)) {
                specifiers.push(statement.moduleSpecifier);
            }
            continue;
        }
        if (
            ts.isExportDeclaration(statement)
            && statement.moduleSpecifier !== undefined
            && ts.isStringLiteral(statement.moduleSpecifier)
            && exportDeclarationHasRuntimeBindings(statement)
        ) {
            specifiers.push(statement.moduleSpecifier);
        }
    }
    return specifiers;
}

function exportDeclarationHasRuntimeBindings(declaration) {
    if (declaration.isTypeOnly) {
        return false;
    }
    const clause = declaration.exportClause;
    if (clause === undefined || ts.isNamespaceExport(clause)) {
        return true;
    }
    return clause.elements.some((element) => !element.isTypeOnly);
}

function importDeclarationHasRuntimeBindings(declaration) {
    const clause = declaration.importClause;
    if (clause === undefined) {
        return true;
    }
    if (clause.isTypeOnly) {
        return false;
    }
    if (clause.name !== undefined) {
        return true;
    }
    const bindings = clause.namedBindings;
    if (bindings === undefined || ts.isNamespaceImport(bindings)) {
        return true;
    }
    return bindings.elements.some((element) => !element.isTypeOnly);
}

function collectDynamicImports(source) {
    return collectNodes(source, (node) => (
        ts.isCallExpression(node)
        && node.expression.kind === ts.SyntaxKind.ImportKeyword
    ));
}

function resolveRuntimeImport(importerPath, specifier) {
    const base = path.resolve(path.dirname(importerPath), specifier);
    const extension = path.extname(base);
    const candidates = extension === ""
        ? [
            `${base}.ts`,
            `${base}.tsx`,
            `${base}.mts`,
            path.join(base, "index.ts"),
            path.join(base, "index.tsx")
        ]
        : [
            base,
            ...(extension === ".js" ? [`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`] : [])
        ];
    const resolved = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    assert.notEqual(
        resolved,
        undefined,
        `failed to resolve runtime import '${specifier}' from ${toProjectPath(importerPath)}`
    );
    assert.equal(
        isWithinDirectory(resolved, projectRoot),
        true,
        `runtime import escaped project root: ${specifier}`
    );
    return path.resolve(resolved);
}

function collectNextReadRequestKinds(source) {
    const alias = source.statements.find((statement) => (
        ts.isTypeAliasDeclaration(statement)
        && statement.name.text === "NextReadRequest"
    ));
    assert.notEqual(alias, undefined, "NextReadRequest type alias is required");
    const members = ts.isUnionTypeNode(alias.type) ? alias.type.types : [alias.type];
    return members.map((member) => {
        assert.equal(ts.isTypeLiteralNode(member), true, "NextReadRequest members must be closed object types");
        const kind = member.members.find((property) => (
            ts.isPropertySignature(property)
            && getPropertyNameText(property.name) === "kind"
        ));
        assert.notEqual(kind, undefined, "each NextReadRequest member must have a kind discriminant");
        assert.equal(
            kind.type !== undefined
            && ts.isLiteralTypeNode(kind.type)
            && ts.isStringLiteral(kind.type.literal),
            true,
            "NextReadRequest kind must be a string literal"
        );
        return kind.type.literal.text;
    });
}

function isSearchParameterSetCall(node) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
        return false;
    }
    const method = node.expression;
    return method.name.text === "set"
        && ts.isPropertyAccessExpression(method.expression)
        && method.expression.name.text === "searchParams";
}

function isFetchReference(node) {
    if (ts.isPropertyAccessExpression(node)) {
        return node.name.text === "fetch";
    }
    if (ts.isElementAccessExpression(node)) {
        return getStringLiteralText(node.argumentExpression) === "fetch";
    }
    return ts.isIdentifier(node)
        && node.text === "fetch"
        && !isPropertyAccessName(node)
        && !isDeclarationName(node)
        && !isWithinTypePosition(node);
}

function getReferenceCall(node) {
    return ts.isCallExpression(node.parent) && node.parent.expression === node
        ? node.parent
        : null;
}

function isIndexedDbReference(node) {
    if (ts.isPropertyAccessExpression(node)) {
        return node.name.text === "indexedDB";
    }
    if (ts.isElementAccessExpression(node)) {
        return getStringLiteralText(node.argumentExpression) === "indexedDB";
    }
    return ts.isIdentifier(node)
        && node.text === "indexedDB"
        && !isPropertyAccessName(node)
        && !isDeclarationName(node)
        && !isWithinTypePosition(node);
}

function getCalledMember(expression) {
    if (ts.isPropertyAccessExpression(expression)) {
        return { receiver: expression.expression, name: expression.name.text };
    }
    if (ts.isElementAccessExpression(expression)) {
        const name = getStringLiteralText(expression.argumentExpression);
        return name === null ? null : { receiver: expression.expression, name };
    }
    return null;
}

function isIndexedDbType(type, seen = new Set()) {
    if (seen.has(type)) {
        return false;
    }
    seen.add(type);
    if (type.isUnionOrIntersection()) {
        return type.types.some((part) => isIndexedDbType(part, seen));
    }
    const symbolName = (type.aliasSymbol ?? type.getSymbol())?.getName() ?? "";
    if (/^IDB(?:Cursor|CursorWithValue|Database|Factory|Index|ObjectStore|OpenDBRequest|Request|Transaction)$/u.test(symbolName)) {
        return true;
    }
    return /\bIDB(?:Cursor|CursorWithValue|Database|Factory|Index|ObjectStore|OpenDBRequest|Request|Transaction)\b/u
        .test(checker.typeToString(type));
}

function isAnyOrUnknownType(type) {
    return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
}

function isRuntimeIdentifierReference(node) {
    return !isDeclarationName(node)
        && !isWithinTypePosition(node)
        && !isImportOrExportBinding(node);
}

function isDeclarationName(node) {
    const parent = node.parent;
    return (
        (ts.isVariableDeclaration(parent)
            || ts.isFunctionDeclaration(parent)
            || ts.isClassDeclaration(parent)
            || ts.isInterfaceDeclaration(parent)
            || ts.isTypeAliasDeclaration(parent)
            || ts.isParameter(parent)
            || ts.isPropertyDeclaration(parent)
            || ts.isPropertySignature(parent)
            || ts.isMethodDeclaration(parent)
            || ts.isMethodSignature(parent))
        && parent.name === node
    );
}

function isPropertyAccessName(node) {
    return ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
}

function isImportOrExportBinding(node) {
    let current = node.parent;
    while (current !== undefined && !ts.isSourceFile(current)) {
        if (
            ts.isImportDeclaration(current)
            || ts.isImportClause(current)
            || ts.isImportSpecifier(current)
            || ts.isExportDeclaration(current)
            || ts.isExportSpecifier(current)
        ) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

function isWithinTypePosition(node) {
    let current = node.parent;
    while (current !== undefined && !ts.isSourceFile(current)) {
        if (ts.isTypeNode(current)) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

function getObjectLiteralEntries(objectLiteral) {
    const entries = new Map();
    for (const property of objectLiteral.properties) {
        assert.equal(
            ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property),
            true,
            "boundary object literals may not use spreads, methods, or computed accessors"
        );
        const name = getPropertyNameText(property.name);
        assert.notEqual(name, null, "boundary object property names must be static strings");
        assert.equal(entries.has(name), false, `duplicate boundary object property: ${name}`);
        entries.set(name, property);
    }
    return entries;
}

function getPropertyValue(property) {
    return ts.isPropertyAssignment(property) ? property.initializer : property.name;
}

function getPropertyValueText(property, source) {
    return getPropertyValue(property).getText(source);
}

function getStringProperty(entries, name) {
    const property = entries.get(name);
    assert.notEqual(property, undefined, `missing string property ${name}`);
    return getStringPropertyValue(property);
}

function getStringPropertyValue(property) {
    const value = getPropertyValue(property);
    assert.equal(ts.isStringLiteralLike(value), true, "boundary string properties must be string literals");
    return value.text;
}

function getPropertyNameText(name) {
    if (name === undefined) {
        return null;
    }
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }
    return null;
}

function getStringLiteralText(node) {
    return node !== undefined && ts.isStringLiteralLike(node) ? node.text : null;
}

function getNumericLiteralValue(node) {
    return node !== undefined && ts.isNumericLiteral(node) ? Number(node.text) : null;
}

function collectStringLiterals(source) {
    const values = [];
    walk(source, (node) => {
        if (ts.isStringLiteralLike(node)) {
            values.push(node.text);
        }
    });
    return values;
}

function collectNodes(source, predicate) {
    const nodes = [];
    walk(source, (node) => {
        if (predicate(node)) {
            nodes.push(node);
        }
    });
    return nodes;
}

function walk(node, visit) {
    visit(node);
    node.forEachChild((child) => walk(child, visit));
}

function collectTypeScriptFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectTypeScriptFiles(entryPath));
        } else if (entry.isFile() && /\.tsx?$/u.test(entry.name)) {
            files.push(entryPath);
        }
    }
    return files.sort((left, right) => left.localeCompare(right));
}

function getProgramSourceFile(filePath) {
    const source = program.getSourceFile(path.resolve(filePath));
    assert.notEqual(source, undefined, `TypeScript program did not include ${toProjectPath(filePath)}`);
    return source;
}

function isWithinDirectory(filePath, directory) {
    const relative = path.relative(path.resolve(directory), path.resolve(filePath));
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toProjectPath(filePath) {
    return path.relative(projectRoot, path.resolve(filePath)).replaceAll("\\", "/");
}

function normalizePath(value) {
    return path.resolve(value).replaceAll("\\", "/").toLowerCase();
}

function formatNode(entry) {
    const position = entry.source.getLineAndCharacterOfPosition(entry.node.getStart(entry.source));
    return `${toProjectPath(entry.source.fileName)}:${position.line + 1}:${position.character + 1}`;
}

function formatNodeList(label, entries) {
    return entries.length === 0
        ? ""
        : `${label} found at ${entries.map(formatNode).join(", ")}`;
}

function formatReasonNodeList(label, entries) {
    return entries.length === 0
        ? ""
        : `${label} found at ${entries.map((entry) => `${formatNode(entry)} (${entry.reason})`).join(", ")}`;
}

function formatDiagnostic(diagnostic) {
    if (diagnostic === undefined) {
        return "";
    }
    return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}
