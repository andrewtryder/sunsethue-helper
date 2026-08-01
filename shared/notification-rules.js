/**
 * Threshold presets and notification-rule helpers shared by Worker/tests.
 */

export const THRESHOLD_PRESETS = Object.freeze([
  { label: "Always", value: null },
  { label: "20% or above", value: 20 },
  { label: "40% or above", value: 40 },
  { label: "50% or above", value: 50 },
  { label: "60% or above", value: 60 },
  { label: "70% or above", value: 70 },
  { label: "80% or above", value: 80 }
]);

export const RULE_CHANNELS_R1 = Object.freeze(["email", "pushover"]);
export const RULE_CHANNELS_ALL = Object.freeze(["email", "pushover", "webpush", "webhook"]);
