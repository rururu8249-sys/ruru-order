/** Calibration 2026-11-13 KST. Real non-deleted, non-test orders only.
 * Cart: 27 retained client activity pairs corroborated by a saved order (limited sample).
 * Payment: Nov 6–13 confirmed order groups, bank=48 / card=21. Long tails retained.
 * Uniform empirical resampling preserves the measured mean without a fixed cadence.
 */
export const JOURNEY_TIMING_VERSION='2026-11-13-real-v1';
export const JOURNEY_SECONDS = {"cart": [16.932, 39.912, 46.548, 48.078, 57.654, 67.548, 68.034, 72.972, 78.576, 87.984, 95.142, 142.08, 142.908, 164.91, 219.126, 243.642, 244.602, 299.214, 440.16, 499.11, 549.006, 558.918, 613.422, 635.142, 1096.77, 1302.702, 3864.834], "bank": [101.43, 110.532, 152.778, 174.444, 177.774, 178.452, 179.292, 180.108, 189.222, 205.788, 207.948, 211.536, 238.812, 252.102, 253.866, 264.87, 270.774, 272.454, 274.266, 304.482, 313.314, 319.908, 319.956, 329.826, 330.924, 339.216, 342.234, 348.552, 372.456, 380.502, 406.428, 415.794, 433.002, 439.062, 448.686, 519.18, 531.534, 614.82, 726.534, 731.904, 834.348, 952.542, 1006.482, 1106.01, 1963.434, 3343.26, 7951.116, 169299.162], "card": [270.678, 304.656, 328.986, 525.888, 540.108, 577.524, 634.29, 702.012, 710.754, 735.852, 746.574, 913.71, 1044.738, 1150.134, 1306.35, 2304.936, 2770.854, 4494.156, 4894.224, 8257.458, 50482.326]} as const;
export type JourneyTimingKind=keyof typeof JOURNEY_SECONDS;
export function journeyDelayMs(kind:JourneyTimingKind,random=Math.random):number {
 const values=JOURNEY_SECONDS[kind];
 const r=Math.max(0,Math.min(1-Number.EPSILON,random()));
 return Math.round(values[Math.floor(r*values.length)]*1000);
}
