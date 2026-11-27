// Live link to the service: snapshot in, commands out. Reconnects by itself.
export const live = $state({snap: null, connected: false, events: [], toasts: [], rejoin: null});
let socket, nextId = 1, waiting = new Map(), toastId = 1;

export function connect() {
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  socket.onopen = () => {live.connected = true; loadEvents()};
  socket.onclose = () => {live.connected = false; setTimeout(connect, 2000)};
  socket.onmessage = message => {
    const data = JSON.parse(message.data);
    // after an app update the service restarts with a new version: load the new page too
    if (data.t === "snapshot") {if (live.snap && live.snap.version !== data.data.version) location.reload(); live.snap = data.data}
    if (data.t === "event") live.events = [data.event].concat(live.events).slice(0, 500);
    if (data.t === "toast") toast(data.toast.label, data.toast.id ? undo : null);
    if (data.t === "rejoin") live.rejoin = data.data;
    if (data.t === "reply") {const pending = waiting.get(data.id); waiting.delete(data.id); if (pending) data.ok ? pending.resolve(data.result) : pending.reject(new Error(data.error))}
  };
}
// the control that was just pressed: a command it starts shows on it as busy (pulsing, not pressable again) until the answer comes, so every press is acknowledged
let pressed = null;
if (typeof document !== "undefined") for (const type of ["click", "change"]) document.addEventListener(type, event => {pressed = event.target?.closest?.("button, label, select, input, summary"); setTimeout(() => pressed = null)}, true);
export function call(name, args = {}) {
  const control = pressed;
  if (control) {control.classList.add("busy"); control.setAttribute("aria-busy", "true")}
  return new Promise((resolve, reject) => {
    if (!socket || socket.readyState !== 1) return reject(new Error("Not connected to Swarm2MQTT. Trying again…"));
    const id = nextId++; waiting.set(id, {resolve, reject}); socket.send(JSON.stringify({id, name, args}));
  }).finally(() => {if (control) {control.classList.remove("busy"); control.removeAttribute("aria-busy")}});
}
// what to say while a command takes a while: a device has to answer, and a sleeping battery device only answers once it wakes
function waitingText(args) {
  const device = args?.ieee && live.snap?.devices.find(candidate => candidate.ieee === args.ieee);
  if (!device) return "Still working on it…";
  return device.kind === "battery" ? `Waiting for ${device.name} to answer. It sleeps between reports: press its button to wake it.` : `Waiting for ${device.name} to answer…`;
}
// run a command; after 4 s say what it's waiting for; on failure show the plain-words reason as a pill
export async function act(name, args) {
  let waitId = null; const slow = setTimeout(() => waitId = toast(waitingText(args), null, "wait"), 4000);
  try {return await call(name, args)} catch (error) {toast(error.message, null, "bad"); throw error}
  finally {clearTimeout(slow); if (waitId) dismiss(waitId)}
}
export async function loadEvents() {try {live.events = await call("events", {limit: 300})} catch {}}
export const undo = () => act("undo").catch(() => {});
export const redo = () => act("redo").catch(() => {});

// Bottom pills: 6 s with an action, 1.6 s without; a problem stays 12 s with ✕, so it's never missed; "wait" stays until its command answers. A pill with `then` runs it when the doughnut runs out (for things that can't be undone for real).
export function toast(label, action = undo, level = "info", then = null) {
  const id = toastId++, ms = level === "bad" ? 12000 : level === "wait" ? 600e3 : action || then ? 6000 : 1600, item = {id, label, action, level, ms, started: Date.now(), then};
  live.toasts = live.toasts.concat([item]).slice(-3);
  item.timer = setTimeout(() => {dismiss(id); if (then) then()}, ms);
  return id;
}
export function dismiss(id) {live.toasts = live.toasts.filter(item => item.id !== id)}
export function cancelPending(id) {const item = live.toasts.find(candidate => candidate.id === id); if (item) clearTimeout(item.timer); dismiss(id)}
