import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export async function importBundledTypeScript(relativePath, baseUrl) {
    const entryPath = fileURLToPath(new URL(relativePath, baseUrl));
    const entrySource = await readFile(entryPath, "utf8");
    const result = await build({
        stdin: {
            contents: entrySource,
            loader: loaderForPath(entryPath),
            resolveDir: path.dirname(entryPath),
            sourcefile: path.basename(entryPath)
        },
        bundle: true,
        format: "esm",
        platform: "node",
        target: "node22",
        write: false,
        plugins: [nodeReadImportPlugin()]
    });
    const output = result.outputFiles?.[0]?.text;
    assert.equal(typeof output, "string", `failed to bundle ${relativePath}`);
    return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

function nodeReadImportPlugin() {
    return {
        name: "node-read-imports",
        setup(buildContext) {
            buildContext.onResolve({ filter: /^\.\.?\// }, (args) => {
                const resolved = path.resolve(args.resolveDir, args.path);
                const candidates = [
                    resolved,
                    `${resolved}.ts`,
                    `${resolved}.tsx`,
                    `${resolved}.js`,
                    path.join(resolved, "index.ts")
                ];
                const existing = candidates.find((candidate) => existsSync(candidate));
                return existing === undefined ? null : { path: existing, namespace: "node-read" };
            });
            buildContext.onLoad({ filter: /.*/, namespace: "node-read" }, async (args) => {
                return {
                    contents: await readFile(args.path, "utf8"),
                    loader: loaderForPath(args.path),
                    resolveDir: path.dirname(args.path)
                };
            });
        }
    };
}

function loaderForPath(filePath) {
    return filePath.endsWith(".tsx") ? "tsx" : filePath.endsWith(".ts") ? "ts" : "js";
}
