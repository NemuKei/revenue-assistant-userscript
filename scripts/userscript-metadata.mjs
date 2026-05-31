export function renderUserscriptMetadata(config) {
    const lines = ["// ==UserScript=="];
    const entries = [
        ["name", config.name],
        ["namespace", config.namespace],
        ["version", config.version],
        ["description", config.description],
        ["author", config.author],
        ["match", config.match],
        ["exclude", config.exclude],
        ["grant", config.grant?.length ? config.grant : ["none"]],
        ["connect", config.connect],
        ["require", config.require],
        ["run-at", config.runAt],
        ["updateURL", config.updateURL],
        ["downloadURL", config.downloadURL]
    ];

    for (const [key, rawValue] of entries) {
        if (rawValue === undefined || rawValue === null || rawValue === "") {
            continue;
        }

        const values = Array.isArray(rawValue) ? rawValue : [rawValue];

        for (const value of values) {
            lines.push(`// @${String(key).padEnd(12, " ")} ${value}`);
        }
    }

    lines.push("// ==/UserScript==", "");

    return lines.join("\n");
}
