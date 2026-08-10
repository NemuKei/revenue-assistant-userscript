import assert from "node:assert/strict";
import { isAllowedNextPublicationRunState } from "./next-publication-run-state.mjs";

for (const status of ["queued", "in_progress"]) {
    assert.equal(
        isAllowedNextPublicationRunState({ conclusion: null, status }, true),
        true,
        `${status} must be accepted while the current publication run is still active`
    );
    assert.equal(
        isAllowedNextPublicationRunState({ conclusion: "failure", status }, true),
        false,
        `${status} must not hide a terminal failure conclusion`
    );
    assert.equal(
        isAllowedNextPublicationRunState({ conclusion: null, status }, false),
        false,
        `${status} must be rejected outside the current-run verification path`
    );
}

assert.equal(
    isAllowedNextPublicationRunState({ conclusion: "success", status: "completed" }, true),
    true
);
assert.equal(
    isAllowedNextPublicationRunState({ conclusion: "success", status: "completed" }, false),
    true
);
for (const conclusion of [null, "failure", "cancelled"]) {
    assert.equal(
        isAllowedNextPublicationRunState({ conclusion, status: "completed" }, true),
        false,
        `completed/${conclusion ?? "null"} must not be accepted`
    );
}

console.log("Next publication run-state checks passed");
