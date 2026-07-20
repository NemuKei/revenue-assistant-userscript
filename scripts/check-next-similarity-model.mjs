import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as ts from "typescript";

const source = await readFile(new URL("../src/next/similarityLensModel.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022
    }
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { compareSimilarityDayEvidence, findSimilarDays } = await import(moduleUrl);

const base = evidence("20260812", {
    onHandRooms: 7,
    transientCurve: curve([1, 2, 4, 7, 10]),
    groupCurve: curve([0, 0, 1, 2, 2]),
    competitorPriceIndex: 0.97
});
const exact = evidence("20260819", {
    onHandRooms: 7,
    transientCurve: curve([1, 2, 4, 7, 10]),
    groupCurve: curve([0, 0, 1, 2, 2]),
    competitorPriceIndex: 0.97
});
const transientNearGroupFar = evidence("20260820", {
    onHandRooms: 7,
    transientCurve: curve([1, 2, 4, 7, 10]),
    groupCurve: curve([0, 4, 7, 9, 11]),
    competitorPriceIndex: 0.97
});
const transientFarGroupNear = evidence("20260821", {
    onHandRooms: 7,
    transientCurve: curve([1, 7, 11, 15, 20]),
    groupCurve: curve([0, 0, 1, 2, 2]),
    competitorPriceIndex: 0.97
});

const exactMatch = compareSimilarityDayEvidence(base, exact);
assert.equal(exactMatch?.score, 1);
assert.equal(exactMatch?.tier, "very_similar");
assert.equal(exactMatch?.sameWeekday, true);
assert.equal(exactMatch?.availableDimensionCount, 4);
assert.equal(exactMatch?.evidenceCoverage, 1);
assert(exactMatch?.reasonLabels.includes("個人ペースが近い"));
assert(exactMatch?.reasonLabels.includes("同曜日"));

const transientWeighted = compareSimilarityDayEvidence(base, transientNearGroupFar);
const groupWeighted = compareSimilarityDayEvidence(base, transientFarGroupNear);
assert((transientWeighted?.score ?? 0) > (groupWeighted?.score ?? 0), "個人と団体を別軸で比較し、個人を主軸にする");

const missingOptional = compareSimilarityDayEvidence(
    base,
    evidence("20260826", {
        onHandRooms: null,
        transientCurve: curve([1, 2, 4, 7, 10]),
        groupCurve: curve([0, 0, 1, 2, 2]),
        competitorPriceIndex: 0.97
    })
);
assert.equal(missingOptional?.score, 1, "欠損軸を0点扱いせず、利用可能な軸で再正規化する");
assert.equal(missingOptional?.availableDimensionCount, 3);
assert.equal(missingOptional?.evidenceCoverage, 0.75);
assert.equal(missingOptional?.tier, "similar", "全軸が揃わない一致を最上位tierにしない");

const insufficient = compareSimilarityDayEvidence(
    base,
    evidence("20260827", {
        onHandRooms: null,
        transientCurve: curve([1, 2, 4, 7, 10]),
        groupCurve: null,
        competitorPriceIndex: 0.97
    })
);
assert.equal(insufficient, null, "個人ペースと1補助軸だけでは類似日を断定しない");

const transientTooFar = compareSimilarityDayEvidence(
    base,
    evidence("20260828", {
        onHandRooms: 7,
        transientCurve: curve([1, 7, 11, 15, 20]),
        groupCurve: curve([0, 0, 1, 2, 2]),
        competitorPriceIndex: 0.97
    })
);
assert.equal(transientTooFar, null, "補助軸が近くても個人ペースが遠い日は採用しない");

const alignedByLeadDays = compareSimilarityDayEvidence(
    base,
    evidence("20260829", {
        onHandRooms: 7,
        transientCurve: curve([10, 4, 1, 7, 2], [0, 14, 28, 7, 21]),
        groupCurve: curve([2, 1, 0, 2, 0], [0, 14, 28, 7, 21]),
        competitorPriceIndex: 0.97
    })
);
assert.equal(alignedByLeadDays?.score, 1, "配列indexではなくleadDaysで観測点を揃える");

const moderateAcrossDimensions = compareSimilarityDayEvidence(
    base,
    evidence("20260830", {
        onHandRooms: 3.4,
        transientCurve: curve([2.2, 3.2, 2.8, 4.9, 7]),
        groupCurve: curve([1.2, 1.2, 2.2, 3.2, 3.2]),
        competitorPriceIndex: 0.679
    })
);
assert(moderateAcrossDimensions?.reasonLabels.includes("複数軸がほどよく近い"));

const ranked = findSimilarDays(base, [base, transientFarGroupNear, exact, transientNearGroupFar], {
    minimumScore: 0,
    maximumResults: 2
});
assert.deepEqual(ranked.map((match) => match.stayDate), [exact.stayDate, transientNearGroupFar.stayDate]);
assert.equal(ranked.some((match) => match.stayDate === base.stayDate), false);

console.log("Next similarity model checks passed");

function evidence(stayDate, values) {
    return { stayDate, ...values };
}

function curve(values, leadDays = [28, 21, 14, 7, 0]) {
    return values.map((value, index) => ({ leadDays: leadDays[index], value }));
}
