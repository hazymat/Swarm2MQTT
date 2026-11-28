// What a device is about, in one look: worked out from what it can do (its controls), so every device of a kind shows the same way
import {valueText, makeModel} from "./util.js";

export const KINDS = {heating: "Heating", motion: "Motion", climate: "Temperature", power: "Plugs and switches", light: "Lights", contact: "Doors and windows", other: "Other"};
const OPEN = ["sending", "waiting", "set"];
// the value to show: a change still on its way shows what was asked for
export const shownValue = (device, property) => {const entry = device.pending?.[property]; return entry && OPEN.includes(entry.phase) ? entry.wanted : device.state[property]};
const find = (device, test) => device.controls.find(control => !control.setting && test(control));
const degrees = value => typeof value === "number" ? `${value.toFixed(1)}°` : "–";

export function summaryOf(device) {
  const setpoint = find(device, control => control.writable && control.type === "numeric" && /heating_setpoint$/.test(control.property));
  const room = find(device, control => control.property === "local_temperature") ?? find(device, control => control.property === "temperature");
  const humidity = find(device, control => control.property === "humidity");
  const motion = find(device, control => control.type === "binary" && ["occupancy", "presence"].includes(control.property));
  const onOff = find(device, control => control.type === "binary" && control.writable && control.property === "state");
  const brightness = find(device, control => control.property === "brightness");
  const power = find(device, control => control.property === "power" && control.type === "numeric");
  const contact = find(device, control => control.property === "contact");
  if (setpoint) {
    const mode = find(device, control => control.property === "system_mode" && control.type === "enum" && control.writable);
    const target = shownValue(device, setpoint.property), temperature = room ? device.state[room.property] : undefined, running = device.state.running_state, demand = device.state.pi_heating_demand;
    const off = shownValue(device, "system_mode") === "off";
    // the valve's own word wins; a guess from the numbers only when it doesn't say
    const heating = !off && (running !== undefined ? running === "heat" : demand !== undefined ? demand > 0 : typeof temperature === "number" && typeof target === "number" && temperature < target - .2);
    return {kind: "heating", setpoint, mode, room, temperature, target, heating, off, tone: heating ? "heat" : off ? "dim" : "plain",
      word: off ? "Off" : heating ? `Heating to ${degrees(target)}` : `Set to ${degrees(target)}`,
      value: heating ? `${degrees(temperature)} → ${degrees(target)}` : degrees(temperature)};
  }
  if (motion) {const on = device.state[motion.property] === motion.on; return {kind: "motion", control: motion, on, tone: on ? "motion" : "dim", value: on ? "Someone there" : "Nobody"}}
  if (onOff && brightness) {const on = shownValue(device, "state") === onOff.on, level = device.state.brightness; return {kind: "light", control: onOff, on, tone: on ? "plain" : "dim", value: on ? (typeof level === "number" ? `On · ${Math.round(level / (brightness.max ?? 254) * 100)}%` : "On") : "Off"}}
  if (onOff) {const on = shownValue(device, "state") === onOff.on, watts = power ? device.state.power : undefined; return {kind: "power", control: onOff, on, watts, tone: on ? "plain" : "dim", value: typeof watts === "number" && on ? `${Math.round(watts * 10) / 10} W` : on ? "On" : "Off"}}
  if (room) {const temperature = device.state[room.property], wet = humidity ? device.state[humidity.property] : undefined; return {kind: "climate", room, temperature, humidity: wet, tone: "plain", value: degrees(temperature) + (typeof wet === "number" ? ` · ${Math.round(wet)}%` : "")}}
  if (contact) {const closed = device.state.contact === contact.on; return {kind: "contact", on: !closed, tone: closed ? "dim" : "plain", value: device.state.contact === undefined ? "–" : closed ? "Closed" : "Open"}}
  const first = device.controls.find(control => !control.setting && control.readable !== false && !["battery", "linkquality"].includes(control.property) && device.state[control.property] !== undefined);
  return {kind: "other", tone: "plain", value: first ? valueText(first, device.state[first.property]) : makeModel(device) || "–"};
}
export const TONE = {heat: "var(--peach)", motion: "var(--mint)", dim: "var(--muted)", plain: "var(--text)"};

// motion history (0/1 points) as on-or-off buckets across a window, plus when it last saw someone
export function presence(points, from, to, buckets, nowOn) {
  const size = (to - from) / buckets, out = new Array(buckets).fill(false);
  let value = 0, start = from, lastOn = null, since = null;
  const fill = (begin, end, on) => {if (!on) return; for (let index = Math.max(0, Math.floor((begin - from) / size)); index < buckets && from + index * size < end; index++) out[index] = true};
  for (const point of points) {if (point.ts >= from) fill(Math.max(start, from), point.ts, value); if (point.value) {lastOn = point.ts; if (!value) since = point.ts} value = point.value; start = point.ts}
  fill(Math.max(start, from), to, value || nowOn);
  return {bars: out, lastOn, since: value || nowOn ? since : null};
}

// the strip above the list: one card for each kind that has something to say
export function glance(devices) {
  const out = [], byKind = {};
  for (const device of devices) {const summary = summaryOf(device); (byKind[summary.kind] ??= []).push({device, summary})}
  const heating = byKind.heating;
  if (heating) {const count = heating.filter(entry => entry.summary.heating).length; out.push({key: "heating", label: "Heating", value: `${count} of ${heating.length}`, sub: "heating", tone: count ? "heat" : "plain", devices: heating})}
  const motion = byKind.motion;
  if (motion) {const seen = motion.filter(entry => entry.summary.on); out.push({key: "motion", label: "Motion", value: seen.length ? seen[0].device.name : "Nobody", sub: seen.length > 1 ? `and ${seen.length - 1} more` : seen.length ? "sees someone" : `${motion.length} ${motion.length === 1 ? "sensor" : "sensors"}`, tone: seen.length ? "motion" : "plain", devices: seen.length ? seen : motion})}
  for (const entry of (byKind.climate ?? []).slice(0, 4)) out.push({key: "climate-" + entry.device.ieee, label: entry.device.name, value: typeof entry.summary.temperature === "number" ? `${entry.summary.temperature.toFixed(1)}°` : "–", sub: typeof entry.summary.humidity === "number" ? `${Math.round(entry.summary.humidity)}% humidity` : "temperature", tone: "plain", devices: [entry]})
  const power = byKind.power;
  if (power) {const on = power.filter(entry => entry.summary.on), watts = power.reduce((total, entry) => total + (entry.summary.on && typeof entry.summary.watts === "number" ? entry.summary.watts : 0), 0), metered = power.some(entry => typeof entry.summary.watts === "number"); out.push({key: "power", label: "Power", value: metered ? `${Math.round(watts)} W` : `${on.length} on`, sub: `${on.length} of ${power.length} on`, tone: "plain", devices: power})}
  const lights = byKind.light;
  if (lights) {const on = lights.filter(entry => entry.summary.on); out.push({key: "light", label: "Lights", value: `${on.length} of ${lights.length}`, sub: "on", tone: "plain", devices: on.length ? on : lights})}
  const doors = byKind.contact;
  if (doors) {const open = doors.filter(entry => entry.summary.on); out.push({key: "contact", label: "Doors and windows", value: open.length ? `${open.length} open` : "All closed", sub: open.length ? open[0].device.name : `${doors.length} sensors`, tone: "plain", devices: open.length ? open : doors})}
  return out;
}
