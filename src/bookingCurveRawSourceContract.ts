import type { BookingCurveApiResponse, CurveScope } from "./curveCore";

export const BOOKING_CURVE_RAW_SOURCE_DB_NAME = "revenue-assistant-booking-curve-sources";
export const BOOKING_CURVE_RAW_SOURCE_DB_VERSION = 1;
export const BOOKING_CURVE_RAW_SOURCE_STORE_NAME = "booking-curve-raw-sources";
export const BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION = "booking_curve_raw_source:v2";
export const BOOKING_CURVE_ENDPOINT = "/api/v4/booking_curve";

export interface BookingCurveRawSourceKeyParts {
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    scope: CurveScope;
    roomGroupId?: string;
    endpoint: string;
    query: string;
}

export interface BookingCurveRawSourceRecord {
    cacheKey: string;
    facilityId: string;
    stayDate: string;
    asOfDate: string;
    scope: CurveScope;
    roomGroupId: string | null;
    endpoint: string;
    query: string;
    fetchedAt: string;
    schemaVersion: string;
    response: BookingCurveApiResponse;
}

export function buildBookingCurveRawSourceCacheKey(parts: BookingCurveRawSourceKeyParts): string {
    return [
        `facility:${parts.facilityId}`,
        `stayDate:${parts.stayDate}`,
        `asOf:${parts.asOfDate}`,
        `scope:${parts.scope}`,
        `roomGroup:${parts.roomGroupId ?? "-"}`,
        `endpoint:${parts.endpoint}`,
        `query:${parts.query}`,
        `schema:${BOOKING_CURVE_RAW_SOURCE_SCHEMA_VERSION}`
    ].join("|");
}

export type BookingCurveRawSourceStoredStayDateStatus = "currentAsOf" | "pastAsOf";
export type BookingCurveRawSourceStoredRoomGroupStatus = "currentAsOf" | "pastAsOf" | "none";
