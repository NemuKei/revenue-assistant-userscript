import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { renderUserscriptMetadata } from "./scripts/userscript-metadata.mjs";
import userscript from "./userscript.config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const isRegularUserscriptBuild = mode === "userscript";
    return {
        plugins: [react(), userscriptMetadataBannerPlugin()],
        define: {
            __DEV__: JSON.stringify(false),
            "process.env.NODE_ENV": JSON.stringify("production")
        },
        build: {
            outDir: isRegularUserscriptBuild
                ? path.join(__dirname, "dist")
                : path.join(__dirname, ".tmp", "vite-candidate"),
            emptyOutDir: true,
            sourcemap: true,
            minify: true,
            lib: {
                entry: path.join(__dirname, "src", "main.ts"),
                formats: ["iife"],
                name: "RevenueAssistantUserscript",
                fileName: () => isRegularUserscriptBuild
                    ? `${userscript.id}.user.js`
                    : `${userscript.id}.candidate.user.js`
            },
            rollupOptions: {}
        }
    };
});

function userscriptMetadataBannerPlugin() {
    const metadata = renderUserscriptMetadata(userscript);
    return {
        name: "userscript-metadata-banner",
        generateBundle(_outputOptions, bundle) {
            for (const item of Object.values(bundle)) {
                if (item.type === "chunk" && item.isEntry) {
                    item.code = `${metadata}\n${item.code}`;
                }
            }
        }
    };
}
