// The one interface the rest of the app sees. HerdsmanRadio talks to a real adapter, SimRadio fakes one.
import {EventEmitter} from "node:events";

export type Kind = "stick" | "router" | "battery";
// Simplified control description, flattened from the device library's "exposes"
export interface Control {property: string; label: string; type: "binary" | "numeric" | "enum" | "text"; writable: boolean; readable: boolean; unit?: string; min?: number; max?: number; step?: number; values?: (string | number)[]; on?: unknown; off?: unknown; setting?: boolean; guessed?: boolean}
export interface RadioDevice {ieee: string; nwk: number; kind: Kind; model?: string; vendor?: string; description?: string; supported: boolean; controls: Control[]; interviewing: boolean; firmware?: string}
export interface Link {child: string; parent: string; lqi: number}
export interface RadioStatus {up: boolean; reason?: string; stick?: string; channel?: number; panId?: number}
export interface RadioEvents {
  status: [RadioStatus];
  state: [ieee: string, values: Record<string, unknown>, lqi?: number];
  joined: [ieee: string];
  interview: [ieee: string, status: "started" | "successful" | "failed"];
  left: [ieee: string];
  permitJoin: [secondsLeft: number];
  heard: [ieee: string];
}
export abstract class Radio extends EventEmitter<RadioEvents> {
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract list(): RadioDevice[];
  abstract permitJoin(seconds: number): Promise<void>;
  abstract set(ieee: string, values: Record<string, unknown>): Promise<void>;
  abstract remove(ieee: string): Promise<void>;
  abstract scanLinks(): Promise<Link[]>;
  abstract bind(fromIeee: string, toIeee: string | number, unbind?: boolean): Promise<void>;
  abstract groupAdd(groupId: number, ieee: string, remove?: boolean): Promise<void>;
  abstract groupSet(groupId: number, values: Record<string, unknown>): Promise<void>;
  abstract sceneStore(groupId: number, sceneId: number): Promise<void>;
  abstract sceneRecall(groupId: number, sceneId: number): Promise<void>;
  abstract checkFirmware(ieee: string): Promise<boolean>;
  abstract updateFirmware(ieee: string, progress: (percent: number, secondsLeft?: number) => void): Promise<void>;
  abstract scanChannels(): Promise<Record<number, number>>;
}
