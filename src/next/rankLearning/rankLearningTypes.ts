export const RANK_LEARNING_DATABASE_NAME = "revenue-assistant-next-rank-learning";
export const RANK_LEARNING_DATABASE_VERSION = 1;
export const RANK_LEARNING_EVENT_STORE_NAME = "rank-events";
export const RANK_LEARNING_COVERAGE_STORE_NAME = "rank-status-coverages";
export const RANK_LEARNING_SCHEMA_VERSION = "rank-learning:v1" as const;

export const RANK_LEARNING_EVENT_BATCH_LIMIT = 512;
export const RANK_LEARNING_EVENT_FACILITY_LIMIT = 4_096;
export const RANK_LEARNING_COVERAGE_FACILITY_LIMIT = 120;

export interface RankLearningEventRecord {
    afterRankName: string | null;
    beforeRankName: string | null;
    capturedAt: string;
    daysBeforeStay: number;
    facilityId: string;
    recordKey: string;
    reflectedAt: string;
    reflectedDate: string;
    roomGroupId: string;
    schemaVersion: typeof RANK_LEARNING_SCHEMA_VERSION;
    sourceRangeFrom: string;
    sourceRangeTo: string;
    stayDate: string;
}

export interface RankLearningCoverageRecord {
    asOfDate: string;
    capturedAt: string;
    facilityId: string;
    invalidEventCount: number;
    rangeFrom: string;
    rangeTo: string;
    recordKey: string;
    schemaVersion: typeof RANK_LEARNING_SCHEMA_VERSION;
    validEventCount: number;
}

export interface RankLearningCaptureContext {
    asOfDate: string;
    capturedAt: string;
    facilityId: string;
    sourceRangeFrom: string;
    sourceRangeTo: string;
}

export interface RankLearningCaptureInput extends RankLearningCaptureContext {
    payload: unknown;
    signal: AbortSignal;
}

export type RankLearningCaptureRejectReason =
    | "event-limit-exceeded"
    | "event-out-of-range"
    | "invalid-context"
    | "invalid-event"
    | "invalid-root";

export type RankLearningCaptureParseResult =
    | {
        status: "ready";
        coverage: RankLearningCoverageRecord;
        events: RankLearningEventRecord[];
    }
    | {
        status: "rejected";
        reason: RankLearningCaptureRejectReason;
    };

export interface RankLearningStoreWriteResult {
    addedCoverageCount: number;
    addedEventCount: number;
    deletedCoverageCount: number;
    deletedEventCount: number;
}

export interface RankLearningFacilityRecords {
    coverages: RankLearningCoverageRecord[];
    events: RankLearningEventRecord[];
}

export interface RankLearningStore {
    addAndPrune(
        events: readonly RankLearningEventRecord[],
        coverage: RankLearningCoverageRecord,
        signal: AbortSignal
    ): Promise<RankLearningStoreWriteResult>;
    readByFacility(
        facilityId: string,
        signal?: AbortSignal
    ): Promise<RankLearningFacilityRecords>;
}

export type RankLearningCaptureResult =
    | ({ status: "stored" } & RankLearningStoreWriteResult)
    | ({ status: "duplicate" } & RankLearningStoreWriteResult)
    | {
        status: "rejected";
        reason: RankLearningCaptureRejectReason;
    };

export interface RankLearningCaptureWriter {
    capture(input: RankLearningCaptureInput): Promise<RankLearningCaptureResult>;
}
