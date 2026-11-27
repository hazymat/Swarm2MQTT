// Small shared helpers for the page
export const ICONS = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  groups: "M8 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM16 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 19c0-3 2.5-5 5-5s5 2 5 5M11 19c0-3 2.5-5 5-5s5 2 5 5",
  activity: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM10 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6L6 18",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  prev: "M14 6l-6 6 6 6M19 6v12", next: "M10 6l6 6-6 6M5 6v12",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};
export const KIND_SHAPES = {plug: "M5 7h12v10H5zM9 7V4M13 7V4M11 17v3", bulb: "M11 3a6 6 0 0 0-3.5 10.8V16h7v-2.2A6 6 0 0 0 11 3zM8.5 19h5", sensor: "M4 14a7 7 0 0 1 14 0zM11 10.5h.01", door: "M6 3h7v16H6zM15 7h3v8h-3", temp: "M11 3v11M8 16a3 3 0 1 0 6 0 3 3 0 0 0-6 0", switch: "M6 3h10v16H6zM11 8v4", device: "M5 5h12v12H5z"};
// guess a shape from what the device can do, used until (or instead of) its picture
export function shapeOf(device) {
  const properties = (device.controls ?? []).map(control => control.property);
  if (properties.includes("brightness") || properties.includes("color")) return "bulb";
  if (properties.includes("occupancy") || properties.includes("presence")) return "sensor";
  if (properties.includes("contact")) return "door";
  if (properties.includes("temperature") && !properties.includes("state")) return "temp";
  if (properties.includes("action")) return "switch";
  if (device.kind === "router") return "plug";
  return "device";
}
export const STATUS_COLOUR = {ok: "var(--green)", warn: "var(--amber)", bad: "var(--red)", waiting: "var(--accent)"};
export const STATUS_WORD = {ok: "Fine", warn: "Needs a look", bad: "Not working", waiting: "Waiting for you"};
export function ago(ts, now = Date.now()) {
  if (!ts) return "never";
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}
export function duration(ms) {
  if (ms == null) return "";
  const seconds = ms / 1000;
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}
export const clock = ts => new Date(ts).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
export const dayClock = ts => {const date = new Date(ts), today = new Date(); return (date.toDateString() === today.toDateString() ? "" : date.toLocaleDateString([], {day: "numeric", month: "short"}) + " ") + clock(ts)};
export const signalBars = lqi => lqi == null ? 0 : lqi > 180 ? 4 : lqi > 120 ? 3 : lqi > 60 ? 2 : 1;
export function valueText(control, value) {
  if (value === undefined || value === null) return "–";
  if (control?.type === "binary") {if (control.property === "occupancy") return value === control.on ? "Motion" : "Clear"; if (control.property === "contact") return value === control.on ? "Closed" : "Open"; return value === control.on ? "On" : "Off"}
  if (typeof value === "number") return `${Math.round(value * 10) / 10}${control?.unit ? (control.unit === "%" ? "%" : " " + control.unit) : ""}`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/_/g, " ");
}
export function inField(event) {const target = event.target; return target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)}
// press and hold to choose (about 0.4 s); returns pointer handlers
export function holdable(onHold, onTap) {
  let timer, held = false, startX = 0, startY = 0;
  return {
    onpointerdown(event) {held = false; startX = event.clientX; startY = event.clientY; clearTimeout(timer); timer = setTimeout(() => {held = true; navigator.vibrate?.(15); onHold(event)}, 400)},
    onpointermove(event) {if (Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY) > 10) clearTimeout(timer)},
    onpointerup(event) {clearTimeout(timer); if (!held) onTap(event)},
    onpointerleave() {clearTimeout(timer)},
    oncontextmenu(event) {event.preventDefault()},
  };
}
