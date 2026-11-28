// Page state shared between views
const read = (key, fallback) => {try {return JSON.parse(localStorage.getItem(key)) ?? fallback} catch {return fallback}};
// how the device list looks, remembered on this device
export const LIST_DEFAULTS = {layout: "list", detail: "compact", group: "needs", sort: "name", show: ["battery", "heard"], glance: false};
const savedList = read("s2m-list", {});
export const view = $state({list: Object.assign({}, LIST_DEFAULTS, savedList), page: location.hash.slice(2) || "home", open: null, chosen: [], at: null, compare: false, theme: read("s2m-theme", "glass"), hintsSeen: read("s2m-hints", []), navOrder: read("s2m-nav", ["home", "groups", "activity", "settings"]), search: "", now: Date.now(), wizard: false, whatsNew: false, whatsNewAll: false, updateLater: read("s2m-update-later", "")});
setInterval(() => {view.now = Date.now()}, 1000);
export function go(page) {view.page = page; location.hash = "/" + page}
export function save(key, value) {try {localStorage.setItem(key, JSON.stringify(value))} catch {}}
export function seeHint(id) {if (!view.hintsSeen.includes(id)) {view.hintsSeen = view.hintsSeen.concat([id]); save("s2m-hints", view.hintsSeen)}}
export function toggleChosen(ieee) {view.chosen = view.chosen.includes(ieee) ? view.chosen.filter(candidate => candidate !== ieee) : view.chosen.concat([ieee])}
window.addEventListener("hashchange", () => {view.page = location.hash.slice(2) || "home"});
export function setList(changes) {view.list = Object.assign({}, view.list, changes); save("s2m-list", view.list)}
