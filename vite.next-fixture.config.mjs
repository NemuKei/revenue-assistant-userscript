import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    define: {
        __DEV__: JSON.stringify(true),
        "process.env.NODE_ENV": JSON.stringify("development")
    },
    build: {
        outDir: path.join(__dirname, ".tmp", "vite-next-fixture"),
        emptyOutDir: true,
        rollupOptions: {
            input: [
                path.join(__dirname, "dev", "fixtures", "similarity-lens", "index.html"),
                path.join(__dirname, "dev", "fixtures", "next-live-shell", "index.html"),
                path.join(__dirname, "dev", "fixtures", "next-analyze-competitor", "index.html"),
                path.join(__dirname, "dev", "fixtures", "next-analyze-booking-curve", "index.html"),
                path.join(__dirname, "dev", "fixtures", "next-analyze-price-trend", "index.html")
            ]
        }
    }
});
