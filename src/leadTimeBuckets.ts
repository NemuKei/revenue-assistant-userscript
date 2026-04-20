export const LEAD_TIME_BUCKET_TICKS = [
    360, 330, 300, 270, 240, 210,
    180, 165, 150, 135, 120, 105,
    90, 80, 70,
    60, 55, 50, 45, 40, 35,
    30, 28, 26, 24, 21, 20, 18, 16,
    14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    "ACT"
] as const;

export type LeadTimeBucketTick = typeof LEAD_TIME_BUCKET_TICKS[number];

export const LEAD_TIME_BUCKET_VISIBLE_TICKS = new Set<LeadTimeBucketTick>([
    360, 270, 180, 150, 120, 90, 60, 45, 30, 21, 14, 7, 3, "ACT"
]);