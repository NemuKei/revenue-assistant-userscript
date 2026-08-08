import packageJson from "./package.json" with { type: "json" };

const nextCandidateRevision = "160";
const nextPublicationRunNumber = process.env.NEXT_PUBLICATION_RUN_NUMBER?.trim();
const nextPublicationBaseUrl = "https://nemukei.github.io/revenue-assistant-userscript";
const nextPublicationUrl = `${nextPublicationBaseUrl}/next/revenue-assistant-next.user.js`;
const isPublication = nextPublicationRunNumber !== undefined && nextPublicationRunNumber !== "";

if (isPublication && !/^[1-9]\d*$/u.test(nextPublicationRunNumber)) {
    throw new Error("NEXT_PUBLICATION_RUN_NUMBER must be a positive integer");
}

export default {
    id: "revenue-assistant-next",
    name: "Revenue Assistant Next (Candidate)",
    namespace: "https://local.revenue-assistant.dev/userscript/next/",
    version: isPublication
        ? `0.2.0.${nextPublicationRunNumber}`
        : `${packageJson.version}.${nextCandidateRevision}`,
    description: "レベニューアシスタント向けNext候補。反映操作なし・競合履歴をbrowser-localに日次保存",
    author: "Revenue Assistant Userscript Workspace",
    match: [
        "https://ra.jalan.net/*"
    ],
    updateURL: isPublication ? nextPublicationUrl : undefined,
    downloadURL: isPublication ? nextPublicationUrl : undefined,
    grant: ["none"],
    runAt: "document-idle",
    publication: isPublication,
    publicationBaseUrl: isPublication ? nextPublicationBaseUrl : undefined,
    publicationRunNumber: isPublication ? Number(nextPublicationRunNumber) : undefined
};
