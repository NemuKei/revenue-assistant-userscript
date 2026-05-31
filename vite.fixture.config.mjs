import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    plugins: [react()],
    define: {
        __DEV__: JSON.stringify(true),
        "process.env.NODE_ENV": JSON.stringify("development")
    },
    server: {
        host: "127.0.0.1",
        port: 5173
    },
    build: {
        outDir: path.join(__dirname, ".tmp", "vite-fixture"),
        emptyOutDir: true,
        rollupOptions: {
            input: path.join(__dirname, "dev", "fixtures", "rank-recommendation", "index.html")
        }
    }
});
