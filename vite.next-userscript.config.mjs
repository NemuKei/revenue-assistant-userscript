import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { renderUserscriptMetadata } from "./scripts/userscript-metadata.mjs";
import userscript from "./userscript.next.config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    plugins: [nextUserscriptMetadataBannerPlugin()],
    define: {
        __DEV__: JSON.stringify(false),
        "process.env.NODE_ENV": JSON.stringify("production")
    },
    build: {
        outDir: path.join(__dirname, ".tmp", "vite-next-candidate"),
        emptyOutDir: true,
        sourcemap: true,
        minify: true,
        lib: {
            entry: path.join(__dirname, "src", "next", "entry.ts"),
            formats: ["iife"],
            name: "RevenueAssistantNextCandidate",
            fileName: () => `${userscript.id}.candidate.user.js`
        },
        rollupOptions: {}
    }
});

function nextUserscriptMetadataBannerPlugin() {
    const metadata = renderUserscriptMetadata(userscript);
    return {
        name: "next-userscript-metadata-banner",
        generateBundle(_outputOptions, bundle) {
            for (const item of Object.values(bundle)) {
                if (item.type === "chunk" && item.isEntry) {
                    item.code = `${metadata}\n${item.code}`;
                }
            }
        }
    };
}
