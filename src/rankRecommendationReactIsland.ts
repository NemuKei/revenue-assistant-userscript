import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

const RANK_RECOMMENDATION_REACT_ISLAND_HOST_ATTRIBUTE = "data-ra-rank-recommendation-react-island-host";
const RANK_RECOMMENDATION_REACT_ISLAND_ATTRIBUTE = "data-ra-rank-recommendation-react-island";

export interface RankRecommendationReactIslandSnapshot {
    rowCount: number;
    mode: "live" | "fixture";
    signature: string;
}

let mountedHost: HTMLElement | null = null;
let mountedRoot: Root | null = null;

export function syncRankRecommendationReactIsland(
    container: HTMLElement,
    snapshot: RankRecommendationReactIslandSnapshot
): void {
    const host = ensureRankRecommendationReactIslandHost(container);
    let root = mountedRoot;
    if (mountedHost !== host || root === null) {
        mountedRoot?.unmount();
        mountedHost = host;
        root = createRoot(host);
        mountedRoot = root;
    }

    flushSync(() => {
        root.render(React.createElement(RankRecommendationReactIslandMarker, snapshot));
    });
}

export function unmountRankRecommendationReactIsland(): void {
    mountedRoot?.unmount();
    mountedRoot = null;
    mountedHost = null;
}

function ensureRankRecommendationReactIslandHost(container: HTMLElement): HTMLElement {
    const existingHost = container.querySelector<HTMLElement>(`[${RANK_RECOMMENDATION_REACT_ISLAND_HOST_ATTRIBUTE}]`);
    if (existingHost !== null) {
        return existingHost;
    }

    const host = document.createElement("div");
    host.setAttribute(RANK_RECOMMENDATION_REACT_ISLAND_HOST_ATTRIBUTE, "");
    host.hidden = true;
    container.append(host);
    return host;
}

function RankRecommendationReactIslandMarker(snapshot: RankRecommendationReactIslandSnapshot): React.ReactElement {
    return React.createElement("span", {
        [RANK_RECOMMENDATION_REACT_ISLAND_ATTRIBUTE]: "mounted",
        "data-row-count": String(snapshot.rowCount),
        "data-mode": snapshot.mode,
        "data-signature": snapshot.signature,
        hidden: true
    });
}
