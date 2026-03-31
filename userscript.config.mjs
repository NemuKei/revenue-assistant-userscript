import packageJson from "./package.json" with { type: "json" };

const githubPagesBaseUrl = process.env.GITHUB_PAGES_BASE_URL?.trim();
const githubRunNumber = process.env.GITHUB_RUN_NUMBER?.trim();
const publishedUserscriptUrl = githubPagesBaseUrl
    ? `${githubPagesBaseUrl.replace(/\/$/, "")}/revenue-assistant-userscript.user.js`
    : undefined;
const publishedVersion = githubRunNumber
    ? `${packageJson.version}.${githubRunNumber}`
    : packageJson.version;

export default {
    id: "revenue-assistant-userscript",
    name: "Revenue Assistant Userscript",
    namespace: githubPagesBaseUrl ?? "https://local.revenue-assistant.dev/userscript/",
    version: publishedVersion,
    description: "レベニューアシスタント向けの汎用 userscript 基盤",
    author: "Revenue Assistant Userscript Workspace",
    match: [
        "https://ra.jalan.net/*"
    ],
    updateURL: publishedUserscriptUrl,
    downloadURL: publishedUserscriptUrl,
    grant: ["none"],
    runAt: "document-idle"
};
