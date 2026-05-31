import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import userscript from "../userscript.config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const currentBuildPath = path.join(projectRoot, "dist", `${userscript.id}.user.js`);
const candidateBuildPath = path.join(projectRoot, ".tmp", "vite-candidate", `${userscript.id}.candidate.user.js`);

const currentBuild = readBuild(currentBuildPath);
const candidateBuild = readBuild(candidateBuildPath);
const currentMetadata = parseUserscriptMetadata(currentBuild.content);
const candidateMetadata = parseUserscriptMetadata(candidateBuild.content);
const metadataKeys = ["name", "namespace", "version", "match", "grant", "run-at", "updateURL", "downloadURL"];
const mismatches = [];

for (const key of metadataKeys) {
    const currentValue = currentMetadata.get(key) ?? [];
    const candidateValue = candidateMetadata.get(key) ?? [];
    if (currentValue.join("\n") !== candidateValue.join("\n")) {
        mismatches.push({ key, currentValue, candidateValue });
    }
}

const result = {
    current: {
        path: path.relative(projectRoot, currentBuildPath),
        bytes: currentBuild.bytes,
        firstExecutableLine: findFirstExecutableLine(currentBuild.content)
    },
    candidate: {
        path: path.relative(projectRoot, candidateBuildPath),
        bytes: candidateBuild.bytes,
        firstExecutableLine: findFirstExecutableLine(candidateBuild.content)
    },
    deltaBytes: candidateBuild.bytes - currentBuild.bytes,
    metadataMismatches: mismatches
};

console.log(JSON.stringify(result, null, 2));

if (mismatches.length > 0) {
    process.exitCode = 1;
}

function readBuild(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Build output not found: ${path.relative(projectRoot, filePath)}`);
    }

    const content = fs.readFileSync(filePath, "utf8");
    return {
        content,
        bytes: Buffer.byteLength(content, "utf8")
    };
}

function parseUserscriptMetadata(content) {
    const metadata = new Map();
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const match = /^\/\/ @(\S+)\s+(.*)$/.exec(line);
        if (match === null) {
            if (line === "// ==/UserScript==") {
                break;
            }
            continue;
        }

        const key = match[1] ?? "";
        const value = match[2] ?? "";
        const values = metadata.get(key) ?? [];
        values.push(value.trim());
        metadata.set(key, values);
    }
    return metadata;
}

function findFirstExecutableLine(content) {
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]?.trim() ?? "";
        if (line === "" || line.startsWith("//")) {
            continue;
        }
        return {
            lineNumber: index + 1,
            text: line.slice(0, 120)
        };
    }
    return null;
}
