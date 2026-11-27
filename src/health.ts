// Health: learnt check-ins, cut-off detection, battery prediction. Pure functions, easy to test.
import type {DeviceRow} from "./store.js";

export const FALLBACK_OFFLINE = {router: 10 * 60e3, battery: 25 * 3600e3, stick: 10 * 60e3};
export const MIN_SAMPLES = 8, LEARN_SPAN = 864e5, FLOOR_OFFLINE = {router: 10 * 60e3, battery: 2 * 3600e3, stick: 10 * 60e3};
export interface CheckIns {learnt: boolean; samples: number; typicalMs?: number; offlineAfterMs: number; source: "learnt" | "fallback" | "override"; recentGaps: number[]}
export interface Health {online: boolean; status: "ok" | "warn" | "bad" | "waiting" | "new"; reason?: string; fix?: string; cutOffBy?: string; checkIns: CheckIns; battery?: {percent: number; daysLeft?: number; warn: boolean}}

const quantile = (sorted: number[], fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
export function checkIns(device: DeviceRow): CheckIns {
  const gaps = device.gaps ?? [], recentGaps = gaps.slice(-30);
  if (device.offline_after_override) return {learnt: gaps.length >= MIN_SAMPLES, samples: gaps.length, typicalMs: gaps.length ? quantile(gaps.slice().sort((first, second) => first - second), .5) : undefined, offlineAfterMs: device.offline_after_override, source: "override", recentGaps};
  // a burst of messages (motion, a button held) isn't its check-in rhythm: learn only from a day of gaps or more
  if (gaps.length < MIN_SAMPLES || gaps.reduce((total, gap) => total + gap, 0) < LEARN_SPAN) return {learnt: false, samples: gaps.length, offlineAfterMs: FALLBACK_OFFLINE[device.kind], source: "fallback", recentGaps};
  const sorted = gaps.slice().sort((first, second) => first - second), typical = quantile(sorted, .5), longest = quantile(sorted, .9);
  // three usual check-ins missed, or 1.5x the longest normal gap, whichever is later, never sooner than its kind's floor
  return {learnt: true, samples: gaps.length, typicalMs: typical, offlineAfterMs: Math.max(FLOOR_OFFLINE[device.kind], Math.round(Math.max(typical * 3, longest * 1.5))), source: "learnt", recentGaps};
}
// Remember the gap since the last message. Gaps under 2 s are bursts of one report, not check-ins.
export function addGap(device: DeviceRow, now: number) {
  if (device.last_seen && now - device.last_seen > 2000) {device.gaps = (device.gaps ?? []).concat([now - device.last_seen]).slice(-200)}
  device.last_seen = now;
}
// Days until the battery is empty, from a straight line through the last 30 days. Undefined when there's no usable trend.
export function batteryDaysLeft(points: {ts: number; value: number}[]): number | undefined {
  if (points.length < 5 || points[points.length - 1].ts - points[0].ts < 2 * 864e5) return undefined;
  const count = points.length, meanTs = points.reduce((sum, point) => sum + point.ts, 0) / count, meanValue = points.reduce((sum, point) => sum + point.value, 0) / count;
  let numerator = 0, denominator = 0;
  for (const point of points) {numerator += (point.ts - meanTs) * (point.value - meanValue); denominator += (point.ts - meanTs) ** 2}
  const slopePerMs = denominator ? numerator / denominator : 0;
  if (slopePerMs >= 0) return undefined;
  return Math.max(0, points[count - 1].value / -slopePerMs / 864e5);
}
export function health(device: DeviceRow, now: number, parentOf: (ieee: string) => string | undefined, isOnline: (ieee: string) => boolean, nameOf: (ieee: string) => string, batteryPoints: {ts: number; value: number}[], batteryLeadDays: number, batteryPercent: number, networkUpAt = 0): Health {
  const checks = checkIns(device), online = !!device.last_seen && now - device.last_seen < checks.offlineAfterMs;
  const result: Health = {online, status: "ok", checkIns: checks};
  if (typeof device.state.battery === "number") {const daysLeft = batteryDaysLeft(batteryPoints), percent = device.state.battery as number; result.battery = {percent, daysLeft, warn: daysLeft !== undefined ? daysLeft < batteryLeadDays : percent <= batteryPercent}}
  if (device.status === "waiting") {result.status = "waiting"; result.reason = "Waiting for you to accept or reject it"; return result}
  // brought over or just joined and not heard yet: give it its own check-in time before calling it broken
  if (!device.last_seen && now - Math.max(device.added_at ?? 0, networkUpAt) < checks.offlineAfterMs) {
    result.status = "new";
    result.reason = device.kind === "battery" ? "Hasn't checked in yet. Battery devices do when they next wake or sense something." : "Hasn't checked in yet. Asking it now.";
    return result;
  }
  if (!online) {
    // cut off: something between it and the adapter is down
    let parent = parentOf(device.ieee), guard = 0;
    while (parent && guard++ < 10) {if (!isOnline(parent)) {result.cutOffBy = parent; break} parent = parentOf(parent)}
    result.status = "bad";
    if (result.cutOffBy) {result.reason = `Cut off: it talks through ${nameOf(result.cutOffBy)}, which isn't answering.`; result.fix = "show-parent"}
    else if (!device.last_seen) {result.reason = device.kind === "battery" ? "Never checked in since it was added. Press its button or trigger it to wake it." : "Never answered since it was added. Check it has power."; result.fix = result.battery ? "replaced-battery" : "check-power"}
    else {const hours = (now - device.last_seen) / 3600e3; result.reason = `Hasn't been heard from for ${hours >= 1 ? Math.round(hours) + (Math.round(hours) === 1 ? " hour" : " hours") : Math.max(1, Math.round(hours * 60)) + " min"}.` + (result.battery && result.battery.percent < 20 ? ` Its battery was at ${result.battery.percent}%.` : ""); result.fix = result.battery ? "replaced-battery" : "check-power"}
    return result;
  }
  if (result.battery?.warn) {result.status = "warn"; result.reason = result.battery.daysLeft !== undefined ? `Battery will run out in about ${weeksText(result.battery.daysLeft)}.` : `Battery at ${result.battery.percent}%. It will stop reporting soon.`; result.fix = "replaced-battery"}
  else if (device.update_available) {result.reason = "Firmware update available"}
  return result;
}
export const weeksText = (days: number) => days < 1 ? "less than a day" : days < 14 ? `${Math.round(days)} ${Math.round(days) === 1 ? "day" : "days"}` : `${Math.round(days / 7)} weeks`;
