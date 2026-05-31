import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderUserscriptMetadata } from "./userscript-metadata.mjs";
import userscript from "../userscript.config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const isWatchMode = process.argv.includes("--watch");
const outputFile = path.join(projectRoot, "dist", `${userscript.id}.user.js`);

const buildOptions = {
    entryPoints: [path.join(projectRoot, "src", "main.ts")],
    outfile: outputFile,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    charset: "utf8",
    minify: !isWatchMode,
    sourcemap: isWatchMode ? "inline" : true,
    logLevel: "info",
    legalComments: "none",
    banner: {
        js: renderUserscriptMetadata(userscript)
    },
    define: {
        __DEV__: JSON.stringify(isWatchMode),
        "process.env.NODE_ENV": JSON.stringify(isWatchMode ? "development" : "production")
    }
};

if (isWatchMode) {
    const context = await esbuild.context(buildOptions);

    await context.watch();
    console.log(`[watch] ${path.relative(projectRoot, outputFile)}`);

    const stopWatching = async () => {
        await context.dispose();
        process.exit(0);
    };

    process.on("SIGINT", stopWatching);
    process.on("SIGTERM", stopWatching);
} else {
    await esbuild.build(buildOptions);
    console.log(`[build] ${path.relative(projectRoot, outputFile)}`);
}
