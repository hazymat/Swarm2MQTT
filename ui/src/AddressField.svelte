<script>
  import {untrack} from "svelte";
  // An address in parts, so nothing has to be typed from memory: [mqtt:// ▾] [address] [1883]. A pasted full address splits itself.
  //   kinds: [{label, scheme, port}] or [{label, path: true, placeholder}] for a device path (USB)
  let {value = $bindable(""), kinds, defaultKind = 0, onenter = () => {}} = $props();
  let kind = $state(defaultKind), host = $state(""), port = $state(""), portTouched = $state(false);
  const composed = () => kinds[kind].path ? host.trim() : host.trim() ? `${kinds[kind].scheme}://${host.trim()}${port ? `:${port}` : ""}` : "";
  function parse(text) {
    const match = String(text ?? "").trim().match(/^([a-z]+):\/\/([^:/\s]*)(?::(\d+))?\/?$/i);
    if (match) {const found = kinds.findIndex(candidate => candidate.scheme === match[1].toLowerCase()); if (found >= 0) {kind = found; host = match[2]; port = match[3] ?? String(kinds[found].port); portTouched = !!match[3] && Number(match[3]) !== kinds[found].port; return true}}
    const pathKind = kinds.findIndex(candidate => candidate.path);
    if (String(text ?? "").startsWith("/") && pathKind >= 0) {kind = pathKind; host = String(text).trim(); return true}
    return false;
  }
  // follow outside changes (filled in from Zigbee2MQTT, a suggestion), and start with the default port
  $effect(() => {const outside = value; untrack(() => {if (outside !== composed() && !parse(outside) && !outside) {host = ""; port = String(kinds[kind].port ?? "")}})});
  if (!port) port = String(kinds[kind].port ?? "");
  const update = () => {value = composed()};
  function pickKind(index) {if (!kinds[index].path !== !kinds[kind].path) host = ""; kind = index; if (!portTouched) port = String(kinds[index].port ?? ""); update()}
  function typed(event) {host = event.currentTarget.value; if (host.includes("://")) parse(host); update()}
</script>
<div class="address">
  <select class="text scheme" value={kind} onchange={event => pickKind(Number(event.currentTarget.value))} aria-label="Kind of address">
    {#each kinds as option, index}<option value={index}>{option.label}</option>{/each}
  </select>
  <input class="text host" placeholder={kinds[kind].path ? kinds[kind].placeholder : "IP address or name"} value={host} oninput={typed} onkeydown={event => {if (event.key === "Enter") onenter()}} aria-label="Address">
  {#if !kinds[kind].path}<span class="colon">:</span><input class="text port" inputmode="numeric" value={port} oninput={event => {port = event.currentTarget.value.replace(/\D/g, ""); portTouched = true; update()}} onkeydown={event => {if (event.key === "Enter") onenter()}} aria-label="Port">{/if}
</div>
<style>
  .address{display:flex;align-items:center;gap:6px;min-width:0}
  .scheme{flex:none;width:auto;padding-right:28px}
  .host{flex:1;min-width:0}
  .colon{color:var(--muted)}
  .port{flex:none;width:84px;text-align:center}
</style>
