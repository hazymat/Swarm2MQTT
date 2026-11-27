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
export function call(name, args = {}) {
  return new Promise((resolve, reject) => {
    if (!socket || socket.readyState !== 1) return reject(new Error("Not connected to Swarm2MQTT. Trying again…"));
    const id = nextId++; waiting.set(id, {resolve, reject}); socket.send(JSON.stringify({id, name, args}));
  });
}
// run a command; on failure show the plain-words reason as a pill
export async function act(name, args) {try {return await call(name, args)} catch (error) {toast(error.message, null, "bad"); throw error}}
export async function loadEvents() {try {live.events = await call("events", {limit: 300})} catch {}}
export const undo = () => act("undo").catch(() => {});
export const redo = () => act("redo").catch(() => {});

// Bottom pills: 6 s with an action, 1.6 s without. A pill with `then` runs it when the doughnut runs out (for things that can't be undone for real).
export function toast(label, action = undo, level = "info", then = null) {
  const id = toastId++, ms = action || then ? 6000 : 1600, item = {id, label, action, level, ms, started: Date.now(), then};
  live.toasts = live.toasts.concat([item]).slice(-3);
  item.timer = setTimeout(() => {dismiss(id); if (then) then()}, ms);
  return id;
}
export function dismiss(id) {live.toasts = live.toasts.filter(item => item.id !== id)}
export function cancelPending(id) {const item = live.toasts.find(candidate => candidate.id === id); if (item) clearTimeout(item.timer); dismiss(id)}
