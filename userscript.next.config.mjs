import packageJson from "./package.json" with { type: "json" };

export default {
    id: "revenue-assistant-next",
    name: "Revenue Assistant Next (Candidate)",
    namespace: "https://local.revenue-assistant.dev/userscript/next/",
    version: packageJson.version,
    description: "レベニューアシスタント向けNext候補。初期段階はread-onlyで検証する",
    author: "Revenue Assistant Userscript Workspace",
    match: [
        "https://ra.jalan.net/*"
    ],
    grant: ["none"],
    runAt: "document-idle"
};
