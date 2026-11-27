// Watching a device join, step by step, so a half-joined device comes with the reason and the fix instead of "bring it closer".
// Fed by the radio (whatever the adapter): the library's own interview log lines, signal strength of every frame heard from it, whether our messages reached it.
//
// How a join goes, and how each step fails (see docs/JOINING.md):
//   joined      the adapter or a router let it in                 fails: never seen (not in pairing mode, out of range, needs an install code), turned away
//   secured     it got the network key and announced itself       fails: drops off again (key handshake lost on a weak link, or an old device)
//   described   it said what kind of device it is                 fails: no answer (weak link, or a battery device asleep)
//   endpoints   it listed its parts                               fails: same
//   identified  it said its make and model                        fails: same; this is the "half-joined" device with no name, model or controls
//   ready       setup finished, controls known                    fails: unknown model (joined fine, not in the device library yet)
export type JoinStep = "joined" | "secured" | "described" | "endpoints" | "identified" | "ready";
export const JOIN_STEPS: JoinStep[] = ["joined", "secured", "described", "endpoints", "identified", "ready"];
export interface JoinReport {
  ieee: string; started: number; updated: number; outcome: "joining" | "ready" | "stuck" | "failed" | "left";
  done: Partial<Record<JoinStep, number>>; failing?: {step: JoinStep; error: string; tries: number};
  parent?: string; sleepy?: boolean; router?: boolean; denied?: boolean;
  signal?: {rssi?: number; lqi?: number; worstRssi?: number; samples: number};
  sent: {ok: number; failed: number}; unknownModel?: string; retries: number; lastRetry?: number;
  verdict?: {kind: string; headline: string; why: string; fixes: string[]};
}
// Below this a link drops messages: -80 dBm is fair, -85 weak, -90 the edge of hearing
export const WEAK_RSSI = -82, WEAK_LQI = 80;

export class JoinWatch {
  reports = new Map<string, JoinReport>();
  constructor(public onChange: (report: JoinReport) => void = () => {}) {}
  report(ieee: string): JoinReport {let report = this.reports.get(ieee); if (!report) {report = {ieee, started: Date.now(), updated: Date.now(), outcome: "joining", done: {}, sent: {ok: 0, failed: 0}, retries: 0}; this.reports.set(ieee, report)} return report}
  private touch(report: JoinReport) {report.updated = Date.now(); report.verdict = diagnose(report); this.onChange(report)}
  // only devices that joined since the app started (or are being retried) are watched
  watching(ieee: string) {return this.reports.has(ieee)}
  step(ieee: string, step: JoinStep) {const report = this.report(ieee); if (!report.done[step]) report.done[step] = Date.now(); if (report.failing && JOIN_STEPS.indexOf(report.failing.step) <= JOIN_STEPS.indexOf(step)) report.failing = undefined; if (step === "ready") report.outcome = "ready"; this.touch(report)}
  fail(ieee: string, step: JoinStep, error: string) {if (!this.watching(ieee)) return; const report = this.report(ieee); report.failing = {step, error, tries: (report.failing?.step === step ? report.failing.tries : 0) + 1}; this.touch(report)}
  failed(ieee: string, error?: string) {if (!this.watching(ieee)) return; const report = this.report(ieee); report.outcome = "failed"; const next = JOIN_STEPS.find(step => !report.done[step]) ?? "ready"; report.failing = {step: next, error: error ?? report.failing?.error ?? "no answer", tries: report.failing?.tries ?? 1}; this.touch(report)}
  left(ieee: string) {if (!this.watching(ieee)) return; const report = this.report(ieee); if (report.outcome !== "ready") {report.outcome = "left"; this.touch(report)}}
  heard(ieee: string, rssi?: number, lqi?: number) {
    if (!this.watching(ieee)) return; const report = this.report(ieee), signal = report.signal ?? (report.signal = {samples: 0});
    if (rssi !== undefined) {signal.rssi = rssi; signal.worstRssi = Math.min(signal.worstRssi ?? rssi, rssi)} if (lqi !== undefined) signal.lqi = lqi; signal.samples++;
    if (report.outcome === "failed" || report.outcome === "stuck") report.outcome = "joining";
    this.touch(report);
  }
  delivered(ieee: string, ok: boolean) {if (!this.watching(ieee)) return; const report = this.report(ieee); if (ok) report.sent.ok++; else report.sent.failed++; this.touch(report)}
  set(ieee: string, values: Partial<JoinReport>) {const report = this.report(ieee); Object.assign(report, values); this.touch(report)}
  // nothing new for 3 minutes, not finished: stuck
  sweep(now = Date.now()) {for (const report of this.reports.values()) {if (report.outcome === "joining" && now - report.updated > 180e3) {report.outcome = "stuck"; this.touch(report)} if (now - report.updated > 3600e3) this.reports.delete(report.ieee)}}
}

// Library log line → step. The library logs every interview step with the device's address (same on every adapter).
export function stepFromLog(line: string): {ieee: string; step?: JoinStep; error?: string} | undefined {
  const ieee = line.match(/'(0x[0-9a-f]{16})'/i)?.[1]; if (!ieee) return undefined;
  if (/Interview - got node descriptor/.test(line)) return {ieee, step: "described"};
  if (/Interview - got active endpoints/.test(line)) return {ieee, step: "endpoints"};
  if (/Interview - got 'modelID'/.test(line)) return {ieee, step: "identified"};
  if (/Interview - completed/.test(line)) return {ieee, step: "ready"};
  if (/node descriptor request failed/.test(line)) return {ieee, step: "described", error: "no answer"};
  if (/active endpoints request failed/.test(line)) return {ieee, step: "endpoints", error: line.match(/\((.*)\)$/)?.[1] ?? "no answer"};
  if (/Interview - failed for device/.test(line)) return {ieee, error: line.match(/with error '(.*)'/)?.[1] ?? "failed"};
  return undefined;
}

const dbm = (rssi?: number) => rssi === undefined ? "" : ` (${rssi} dBm)`;
// The verdict: what went wrong, how sure, and what to do. Only facts we measured are claimed.
export function diagnose(report: JoinReport, names: (ieee?: string) => string = ieee => ieee ?? "the adapter"): JoinReport["verdict"] {
  const signal = report.signal, weak = !!signal && ((signal.rssi ?? 0) <= WEAK_RSSI || (signal.lqi ?? 255) < WEAK_LQI), via = report.parent ? names(report.parent) : "the adapter";
  const closer = `Join it through a router near it: in Add devices pick "Join near" and the closest mains-powered device. A smart plug halfway between makes a good router.`;
  if (report.denied) return {kind: "denied", headline: "The adapter turned it away", why: "It asked to join, but the adapter's rules refused it. Usually an old device that needs an install code.", fixes: ["Reset the device and try again.", "If it has an install code (a sticker on it or its box), it needs one: Swarm2MQTT can't take install codes yet."]};
  if (report.outcome === "ready") return report.unknownModel ? {kind: "unknown-model", headline: "Joined fine, but its model isn't known yet", why: `It says it's ${report.unknownModel}, which isn't in the device library yet, so only basic controls show.`, fixes: ["Check for a Swarm2MQTT update: new models arrive with the device library.", "It still works on the network and sends what it can."]} : undefined;
  if (report.outcome === "left" && !report.done.secured) return {kind: "no-key", headline: "It joined, then dropped off before getting the network key", why: weak ? `The link to ${via} is weak${dbm(signal?.rssi)}, and the key handshake didn't make it through.` : "The key handshake didn't finish. Some older devices need an install code.", fixes: weak ? [closer, "Reset it and try again."] : ["Reset it and try again.", "If it has an install code (a sticker on it or its box), it needs one: Swarm2MQTT can't take install codes yet."]};
  if (report.outcome === "joining" && !report.failing) return undefined;
  const at = report.failing?.step ?? JOIN_STEPS.find(step => !report.done[step]) ?? "ready", halfJoined = !!report.done.secured && !report.done.identified;
  const what = halfJoined ? "It's on the network, but hasn't said what it is yet." : `It stopped answering at "${at}".`;
  if (weak) return {kind: "weak-signal", headline: "Weak signal", why: `${what} It reaches ${via} at ${signal?.rssi !== undefined ? `${signal.rssi} dBm` : `link quality ${signal?.lqi}`}, too weak to be reliable (better than ${WEAK_RSSI} dBm is needed).${report.sent.failed ? ` ${report.sent.failed} of ${report.sent.ok + report.sent.failed} messages to it got no reply.` : ""}`, fixes: [closer, "Swarm2MQTT tries again by itself each time it hears from it."]};
  if (report.sleepy) return {kind: "asleep", headline: "It fell asleep before setup finished", why: `${what} It runs on battery and sleeps to save power${signal?.rssi !== undefined ? `, and its signal is fine${dbm(signal.rssi)}` : ""}.`, fixes: ["Press its button every few seconds until it shows Ready.", "Swarm2MQTT tries again by itself each time it wakes."]};
  if (report.sent.failed && !report.sent.ok) return {kind: "silent", headline: "It stopped answering", why: `${what} None of the messages to it got a reply${signal?.rssi !== undefined ? `, though its signal looked fine${dbm(signal.rssi)}` : ""}. It may have reset or left.`, fixes: ["Power it off and on (or take the battery out for 10 seconds).", "Reset it and add it again."]};
  return {kind: "stuck", headline: `Stuck at "${at}"`, why: `${what}${report.failing?.error ? ` The last answer was: ${report.failing.error}.` : ""}`, fixes: ["Swarm2MQTT tries again by itself each time it hears from it.", "If it stays stuck, reset it and add it again."]};
}
