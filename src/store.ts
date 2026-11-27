// SQLite store: the source of truth for the UI, so the page keeps working when the adapter doesn't
import {DatabaseSync} from "node:sqlite";
import type {Control, Kind} from "./radio/radio.js";

export const HISTORY_DAYS = 30, EVENTS_KEPT = 50000; // the log never outgrows this, however chatty the network
export type Format = "json" | "values" | "both";
export interface DeviceRow {ieee: string; name: string; topic: string; format: Format; renames: Record<string, string>; status: "waiting" | "accepted"; kind: Kind; model?: string; vendor?: string; description?: string; note?: string; supported: boolean; controls: Control[]; hidden_controls: string[]; offline_after_override?: number; added_at: number; last_seen?: number; state: Record<string, unknown>; gaps: number[]; firmware?: string; update_available?: boolean}
export interface EventRow {id: number; ts: number; ieee?: string; level: "info" | "warn" | "bad"; text: string; tech?: string}
export interface GroupRow {id: number; name: string; topic: string; members: string[]}
export interface SceneRow {id: number; group_id: number; name: string; states: Record<string, Record<string, unknown>>}
export interface BindingRow {from_ieee: string; to: string}

const jsonCols = ["renames", "controls", "hidden_controls", "state", "gaps"];
const decode = (row: any) => {if (!row) return row; for (const column of jsonCols) if (column in row) row[column] = JSON.parse(row[column] ?? "null"); if ("supported" in row) row.supported = !!row.supported; if ("update_available" in row) row.update_available = !!row.update_available; return row};

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS devices(ieee TEXT PRIMARY KEY, name TEXT, topic TEXT, format TEXT DEFAULT 'json', renames TEXT DEFAULT '{}', status TEXT, kind TEXT, model TEXT, vendor TEXT, description TEXT, supported INT DEFAULT 1, controls TEXT DEFAULT '[]', hidden_controls TEXT DEFAULT '[]', offline_after_override INT, added_at INT, last_seen INT, state TEXT DEFAULT '{}', gaps TEXT DEFAULT '[]', firmware TEXT, update_available INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS history(ieee TEXT, key TEXT, ts INT, value REAL);
CREATE INDEX IF NOT EXISTS history_i ON history(ieee, key, ts);
CREATE TABLE IF NOT EXISTS links(ts INT, child TEXT, parent TEXT, lqi INT);
CREATE INDEX IF NOT EXISTS links_i ON links(ts);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, ts INT, ieee TEXT, level TEXT, text TEXT, tech TEXT);
CREATE INDEX IF NOT EXISTS events_i ON events(ts);
CREATE TABLE IF NOT EXISTS groups(id INTEGER PRIMARY KEY, name TEXT, topic TEXT, members TEXT DEFAULT '[]');
CREATE TABLE IF NOT EXISTS scenes(id INTEGER PRIMARY KEY, group_id INT, name TEXT, states TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS bindings(from_ieee TEXT, "to" TEXT, PRIMARY KEY(from_ieee, "to"));
CREATE TABLE IF NOT EXISTS undo(id INTEGER PRIMARY KEY, ts INT, label TEXT, forward TEXT, backward TEXT, undone INT DEFAULT 0);`);
    // columns added after the first release
    for (const [table, column] of [["devices", "note TEXT"], ["links", "seen INT"]]) try {this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`)} catch {}
  }
  // settings
  get<T>(key: string, fallback: T): T {const row: any = this.db.prepare("SELECT value FROM settings WHERE key=?").get(key); return row ? JSON.parse(row.value) : fallback}
  put(key: string, value: unknown) {this.db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value))}
  // devices
  devices(): DeviceRow[] {return this.db.prepare("SELECT * FROM devices ORDER BY name").all().map(decode)}
  device(ieee: string): DeviceRow | undefined {return decode(this.db.prepare("SELECT * FROM devices WHERE ieee=?").get(ieee))}
  saveDevice(device: DeviceRow) {
    const columns = Object.keys(device), values = columns.map(column => {const value = (device as any)[column]; return jsonCols.includes(column) ? JSON.stringify(value) : typeof value === "boolean" ? (value ? 1 : 0) : value ?? null});
    const statement = this.db.prepare(`INSERT INTO devices(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}) ON CONFLICT(ieee) DO UPDATE SET ${columns.map(column => `${column}=excluded.${column}`).join(",")}`);
    statement.run.apply(statement, values as any);
  }
  deleteDevice(ieee: string) {this.db.prepare("DELETE FROM devices WHERE ieee=?").run(ieee)}
  // history: numbers only (booleans as 0/1, enums skipped)
  record(ieee: string, values: Record<string, unknown>, ts = Date.now()) {
    const insert = this.db.prepare("INSERT INTO history VALUES(?,?,?,?)");
    for (const [key, value] of Object.entries(values)) {const number = typeof value === "number" ? value : typeof value === "boolean" ? +value : value === "ON" ? 1 : value === "OFF" ? 0 : undefined; if (number !== undefined && Number.isFinite(number)) insert.run(ieee, key, ts, number)}
  }
  history(ieee: string, key: string, since = Date.now() - HISTORY_DAYS * 864e5): {ts: number; value: number}[] {return this.db.prepare("SELECT ts,value FROM history WHERE ieee=? AND key=? AND ts>=? ORDER BY ts").all(ieee, key, since) as any}
  // mesh links: a snapshot is all rows sharing one ts
  saveLinks(links: {child: string; parent: string; lqi?: number; seen?: number}[], ts = Date.now()) {const insert = this.db.prepare("INSERT INTO links(ts,child,parent,lqi,seen) VALUES(?,?,?,?,?)"); for (const link of links) insert.run(ts, link.child, link.parent, link.lqi ?? null, link.seen ?? ts); return ts}
  linksAt(ts = Date.now()): {ts: number; links: {child: string; parent: string; lqi?: number; seen: number}[]} {
    const row: any = this.db.prepare("SELECT MAX(ts) ts FROM links WHERE ts<=?").get(ts);
    if (!row?.ts) return {ts: 0, links: []};
    return {ts: row.ts, links: this.db.prepare("SELECT child,parent,lqi,COALESCE(seen,ts) seen FROM links WHERE ts=?").all(row.ts) as any};
  }
  snapshotTimes(): number[] {return (this.db.prepare("SELECT DISTINCT ts FROM links ORDER BY ts").all() as any[]).map(row => row.ts)}
  linkHistory(child: string): {ts: number; parent: string; lqi: number}[] {return this.db.prepare("SELECT ts,parent,lqi FROM links WHERE child=? ORDER BY ts").all(child) as any}
  // activity log
  log(level: EventRow["level"], text: string, ieee?: string, tech?: string): EventRow {const ts = Date.now(), result = this.db.prepare("INSERT INTO events(ts,ieee,level,text,tech) VALUES(?,?,?,?,?)").run(ts, ieee ?? null, level, text, tech ?? null); return {id: Number(result.lastInsertRowid), ts, ieee, level, text, tech}}
  events(before = Date.now() + 1, limit = 200, ieee?: string): EventRow[] {return (ieee ? this.db.prepare("SELECT * FROM events WHERE ts<? AND ieee=? ORDER BY ts DESC LIMIT ?").all(before, ieee, limit) : this.db.prepare("SELECT * FROM events WHERE ts<? ORDER BY ts DESC LIMIT ?").all(before, limit)) as any}
  // groups, scenes, bindings
  groups(): GroupRow[] {return this.db.prepare("SELECT * FROM groups ORDER BY name").all().map((row: any) => Object.assign(row, {members: JSON.parse(row.members)}))}
  saveGroup(group: GroupRow) {this.db.prepare("INSERT INTO groups(id,name,topic,members) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,topic=excluded.topic,members=excluded.members").run(group.id, group.name, group.topic, JSON.stringify(group.members))}
  deleteGroup(id: number) {this.db.prepare("DELETE FROM groups WHERE id=?").run(id)}
  scenes(): SceneRow[] {return this.db.prepare("SELECT * FROM scenes ORDER BY name").all().map((row: any) => Object.assign(row, {states: JSON.parse(row.states)}))}
  saveScene(scene: SceneRow) {this.db.prepare("INSERT INTO scenes(id,group_id,name,states) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,states=excluded.states").run(scene.id, scene.group_id, scene.name, JSON.stringify(scene.states))}
  deleteScene(id: number) {this.db.prepare("DELETE FROM scenes WHERE id=?").run(id)}
  bindings(): BindingRow[] {return this.db.prepare(`SELECT from_ieee,"to" FROM bindings`).all() as any}
  saveBinding(fromIeee: string, to: string, remove = false) {this.db.prepare(remove ? `DELETE FROM bindings WHERE from_ieee=? AND "to"=?` : `INSERT OR IGNORE INTO bindings VALUES(?,?)`).run(fromIeee, to)}
  // undo stack
  pushUndo(label: string, forward: unknown, backward: unknown): number {this.db.prepare("DELETE FROM undo WHERE undone=1").run(); return Number(this.db.prepare("INSERT INTO undo(ts,label,forward,backward) VALUES(?,?,?,?)").run(Date.now(), label, JSON.stringify(forward), JSON.stringify(backward)).lastInsertRowid)}
  lastUndo(undone: boolean): any {const row: any = this.db.prepare(`SELECT * FROM undo WHERE undone=? ORDER BY id ${undone ? "ASC" : "DESC"} LIMIT 1`).get(undone ? 1 : 0); return row && Object.assign(row, {forward: JSON.parse(row.forward), backward: JSON.parse(row.backward)})}
  markUndo(id: number, undone: boolean) {this.db.prepare("UPDATE undo SET undone=? WHERE id=?").run(undone ? 1 : 0, id)}
  undoList(limit = 50) {return this.db.prepare("SELECT id,ts,label,undone FROM undo ORDER BY id DESC LIMIT ?").all(limit)}
  // everything older than 30 days goes
  prune() {const cutoff = Date.now() - HISTORY_DAYS * 864e5; for (const table of ["history", "links", "events", "undo"]) this.db.prepare(`DELETE FROM ${table} WHERE ts<?`).run(cutoff); this.db.prepare("DELETE FROM events WHERE id <= (SELECT id FROM events ORDER BY id DESC LIMIT 1 OFFSET ?)").run(EVENTS_KEPT)}
}
