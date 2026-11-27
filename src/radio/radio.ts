// The one interface the rest of the app sees. HerdsmanRadio talks to a real adapter, SimRadio fakes one.
import {EventEmitter} from "node:events";

export type Kind = "stick" | "router" | "battery";
// Simplified control description, flattened from the device library's "exposes"
export interface Control {property: string; label: string; type: "binary" | "numeric" | "enum" | "text"; writable: boolean; readable: boolean; unit?: string; min?: number; max?: number; step?: number; values?: (string | number)[]; on?: unknown; off?: unknown; setting?: boolean; guessed?: boolean}
export interface RadioDevice {ieee: string; nwk: number; kind: Kind; model?: string; vendor?: string; description?: string; supported: boolean; controls: Control[]; interviewing: boolean; firmware?: string}
export interface Link {child: string; parent: string; lqi: number}
// the map check, as it goes: which plugged-in device is being asked, who answered (and how many it hears), who didn't
export interface ScanProgress {asking?: string; done: number; total: number; answered: {ieee: string; hears: number}[]; silent: string[]}
export interface RadioStatus {up: boolean; reason?: string; stick?: string; channel?: number; panId?: number; connecting?: boolean; since?: number; attempts?: number; lastError?: string; nextTry?: number; log?: string[]}
export interface RadioEvents {
  status: [RadioStatus];
  state: [ieee: string, values: Record<string, unknown>, lqi?: number];
  joined: [ieee: string];
  interview: [ieee: string, status: "started" | "successful" | "failed"];
  left: [ieee: string];
  permitJoin: [secondsLeft: number];
  heard: [ieee: string];
  // joining, step by step (see joinwatch.ts): a step done or failing, the signal of a frame heard from it, whether a message to it got through, who let it in
  joinStep: [ieee: string, step: import("../joinwatch.js").JoinStep, error?: string];
  joinFailed: [ieee: string, error?: string];
  signal: [ieee: string, rssi?: number, lqi?: number];
  delivery: [ieee: string, ok: boolean];
  stray: [ieee: string];
  joinInfo: [ieee: string, info: {parent?: string; sleepy?: boolean; router?: boolean; denied?: boolean}];
}
export abstract class Radio extends EventEmitter<RadioEvents> {
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract list(): RadioDevice[];
  abstract permitJoin(seconds: number, viaIeee?: string): Promise<void>;
  abstract reinterview(ieee: string): Promise<void>;
  abstract set(ieee: string, values: Record<string, unknown>): Promise<void>;
  abstract rejoin(ieee: string): Promise<void>; // ask it to leave and come straight back (it then picks its own parent)
  abstract remove(ieee: string): Promise<boolean>; // true: it answered and left; false: forgotten here and in the adapter only
  abstract scanLinks(progress?: (step: ScanProgress) => void): Promise<Link[]>;
  abstract ping(ieee: string): Promise<void>;
  abstract bind(fromIeee: string, toIeee: string | number, unbind?: boolean): Promise<void>;
  abstract groupAdd(groupId: number, ieee: string, remove?: boolean): Promise<void>;
  abstract groupSet(groupId: number, values: Record<string, unknown>): Promise<void>;
  abstract sceneStore(groupId: number, sceneId: number): Promise<void>;
  abstract sceneRecall(groupId: number, sceneId: number): Promise<void>;
  abstract checkFirmware(ieee: string): Promise<boolean>;
  abstract updateFirmware(ieee: string, progress: (percent: number, secondsLeft?: number) => void): Promise<void>;
  abstract scanChannels(): Promise<Record<number, number>>;
}
