export function isAllowedNextPublicationRunState(run, allowInProgress) {
    if (allowInProgress && ["queued", "in_progress"].includes(run.status)) {
        return run.conclusion === null;
    }
    return run.status === "completed" && run.conclusion === "success";
}
