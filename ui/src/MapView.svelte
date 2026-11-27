<script>
  // The radio map: adapter in the middle, plugged-in devices as squares, battery devices as circles, lines for "talks through"
  import {KIND_SHAPES, shapeOf, STATUS_COLOUR} from "./util.js";
  import {save} from "./ui.svelte.js";
  let {devices, links, stickIeee, then = null, ghosts = [], joining = false, chosen = [], open = null, onpick, onhold} = $props();
  const WIDTH = 900, HEIGHT = 1000, CX = 450, CY = 480;
  let moved = $state((() => {try {return JSON.parse(localStorage.getItem("s2m-map")) ?? {}} catch {return {}}})());
  let layout = $derived.by(() => {
    const parentOf = new Map(links.map(link => [link.child, link.parent])), byIeee = new Map(devices.map(device => [device.ieee, device])), children = new Map();
    for (const link of links) {if (!children.has(link.parent)) children.set(link.parent, []); children.get(link.parent).push(link.child)}
    const spot = new Map([[stickIeee, {x: CX, y: CY, angle: 0}]]);
    // routers first, spread around their parent away from the middle; battery devices fanned outside them
    const place = (parent, depth) => {
      const kids = (children.get(parent) ?? []).filter(ieee => byIeee.has(ieee)).sort(), base = spot.get(parent);
      const routers = kids.filter(ieee => byIeee.get(ieee).kind === "router"), sleepers = kids.filter(ieee => byIeee.get(ieee).kind !== "router");
      const spread = depth === 0 ? Math.PI * 2 : Math.PI * .9;
      routers.forEach((ieee, index) => {const angle = depth === 0 ? index / routers.length * spread - Math.PI / 2 : base.angle + (index - (routers.length - 1) / 2) * spread / Math.max(routers.length, 2); spot.set(ieee, {x: base.x + Math.cos(angle) * (depth === 0 ? 250 : 170), y: base.y + Math.sin(angle) * (depth === 0 ? 250 : 170), angle})});
      sleepers.forEach((ieee, index) => {const angle = (depth === 0 ? Math.PI / 2 : base.angle) + (index - (sleepers.length - 1) / 2) * (depth === 0 ? .5 : .62); spot.set(ieee, {x: base.x + Math.cos(angle) * (depth === 0 ? 150 : 115), y: base.y + Math.sin(angle) * (depth === 0 ? 150 : 115), angle})});
      for (const ieee of routers) if (depth < 6) place(ieee, depth + 1);
    };
    place(stickIeee, 0);
    // devices not in the last scan: round the adapter while there's no map at all, else along the bottom under a label
    const loose = devices.filter(device => !spot.has(device.ieee)), ring = !links.length;
    loose.forEach((device, index) => {const angle = index / loose.length * Math.PI * 2 - Math.PI / 2, radius = loose.length > 10 ? 300 : 230; spot.set(device.ieee, ring ? {x: CX + Math.cos(angle) * radius, y: CY + Math.sin(angle) * radius, angle, loose: true} : {x: 80 + (index % 9) * 92, y: HEIGHT - 50 - Math.floor(index / 9) * 80, angle: 0, loose: true})});
    const strip = !ring && loose.length ? HEIGHT - 50 - Math.floor((loose.length - 1) / 9) * 80 - 50 : 0;
    for (const [ieee, position] of Object.entries(moved)) if (spot.has(ieee)) spot.set(ieee, Object.assign({}, spot.get(ieee), position));
    return {spot, parentOf, strip};
  });
  const at = ieee => layout.spot.get(ieee);
  const key = link => `${link.child}>${link.parent}`;
  let nowKeys = $derived(new Set(links.map(key)));
  let thenOnly = $derived(then ? then.filter(link => !nowKeys.has(key(link))) : []);
  let thenKeys = $derived(new Set((then ?? []).map(key)));
  let colourOf = device => device.health.status === "ok" ? "var(--green)" : STATUS_COLOUR[device.health.status];
  let broken = device => device.health.status === "bad";
  // drag a node to move it; positions kept on this device
  let drag = null, svg;
  function point(event) {const box = svg.getBoundingClientRect(), scale = Math.max(WIDTH / box.width, HEIGHT / box.height); return {x: (event.clientX - box.left - (box.width - WIDTH / scale) / 2) * scale, y: (event.clientY - box.top - (box.height - HEIGHT / scale) / 2) * scale}}
  let holdTimer;
  function down(event, ieee) {event.stopPropagation(); drag = {ieee, start: point(event), moved: false}; svg.setPointerCapture(event.pointerId); clearTimeout(holdTimer); holdTimer = setTimeout(() => {if (!drag?.moved) {onhold?.(ieee); drag = null}}, 450)}
  function move(event) {if (!drag) return; const position = point(event); if (!drag.moved && Math.hypot(position.x - drag.start.x, position.y - drag.start.y) < 8) return; drag.moved = true; clearTimeout(holdTimer); moved = Object.assign({}, moved, {[drag.ieee]: {x: Math.max(30, Math.min(WIDTH - 30, position.x)), y: Math.max(30, Math.min(HEIGHT - 30, position.y))}})}
  function up() {clearTimeout(holdTimer); if (drag && !drag.moved) onpick?.(drag.ieee); if (drag?.moved) save("s2m-map", moved); drag = null}
</script>

<svg bind:this={svg} viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="xMidYMid meet" onpointermove={move} onpointerup={up} role="img" aria-label="Network map">
  {#each ghosts as link}{#if at(link.child) && at(link.parent)}<line class="ghost" x1={at(link.parent).x} y1={at(link.parent).y} x2={at(link.child).x} y2={at(link.child).y}><title>Used to talk through this until recently</title></line>{/if}{/each}
  {#each thenOnly as link}{#if at(link.child) && at(link.parent)}<line class="gone" x1={at(link.parent).x} y1={at(link.parent).y} x2={at(link.child).x} y2={at(link.child).y}/>{/if}{/each}
  {#each links as link (key(link))}
    {@const child = devices.find(device => device.ieee === link.child)}
    {#if child && at(link.child) && at(link.parent)}
      {#if then && !thenKeys.has(key(link))}<line class="halo" x1={at(link.parent).x} y1={at(link.parent).y} x2={at(link.child).x} y2={at(link.child).y}/>{/if}
      <line class="link" class:broken={broken(child)} x1={at(link.parent).x} y1={at(link.parent).y} x2={at(link.child).x} y2={at(link.child).y} stroke-width={broken(child) ? 2 : Math.max(1.5, link.lqi / 40)}/>
    {/if}
  {/each}
  {#if joining}{#each devices.filter(device => device.kind === "router" && device.health.online) as device}{#if at(device.ieee)}{#each [34, 54, 76] as radius, index}<circle class="beacon" cx={at(device.ieee).x} cy={at(device.ieee).y} r={radius} style="animation-delay:{index * .35}s"/>{/each}{/if}{/each}
    {#each [48, 70, 94] as radius, index}<circle class="beacon" cx={CX} cy={CY} r={radius} style="animation-delay:{index * .35}s"/>{/each}{/if}
  {#if layout.strip}<line class="strip" x1="30" x2={WIDTH - 30} y1={layout.strip} y2={layout.strip}/><text class="striplabel" x="30" y={layout.strip - 10}>Not in the last check</text>{/if}
  <g class="node" onpointerdown={event => event.stopPropagation()}>
    <path d="M{CX} {CY - 34}l29.5 17v34L{CX} {CY + 34}l-29.5-17v-34z" fill="#2a2a33" stroke="#f2c14e" stroke-width="3"/><circle cx={CX} cy={CY} r="8" fill="#f2c14e"/>
    <text x={CX} y={CY + 58}>Adapter</text>
  </g>
  {#each devices as device (device.ieee)}
    {@const position = at(device.ieee)}
    {@const colour = colourOf(device)}
    {#if position}
      <g class="node" opacity={device.health.status === "bad" && device.health.cutOffBy ? .55 : 1} onpointerdown={event => down(event, device.ieee)} role="button" tabindex="-1">
        <title>{device.name}: {device.health.reason ?? "Fine"}</title>
        {#if chosen.includes(device.ieee)}<rect x={position.x - 31} y={position.y - 31} width="62" height="62" rx="16" fill="color-mix(in srgb,var(--accent) 22%,transparent)" stroke="var(--active-border)" stroke-width="2"/>{/if}
        {#if open === device.ieee}<circle cx={position.x} cy={position.y} r="32" fill="var(--glass)" stroke="var(--muted)" stroke-width="1.5"/>{/if}
        {#if device.kind === "router"}<rect x={position.x - 21} y={position.y - 21} width="42" height="42" rx="11" fill="var(--node)" stroke={colour} stroke-width="3.5" stroke-dasharray={device.health.cutOffBy ? "5 4" : "none"}/>
        {:else}<circle cx={position.x} cy={position.y} r="21" fill="var(--node)" stroke={colour} stroke-width="3.5" stroke-dasharray={device.health.cutOffBy ? "5 4" : "none"}/>{/if}
        <g transform="translate({position.x - 11},{position.y - 11})"><path d={KIND_SHAPES[shapeOf(device)]} fill="none" stroke="#334155" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>
        {#if device.status === "waiting"}<circle cx={position.x + 18} cy={position.y - 18} r="8" fill="var(--accent)"/>{/if}
        <text x={position.x} y={position.y + (open === device.ieee ? 50 : 40)}>{device.name}</text>
        {#if device.health.status !== "ok" && device.health.reason}<text class="why" x={position.x} y={position.y + (open === device.ieee ? 68 : 58)} fill={colour}>{device.health.cutOffBy ? "Cut off" : device.health.status === "bad" ? "Not answering" : device.health.battery?.warn ? `Battery ${device.health.battery.percent}%` : ""}</text>{/if}
      </g>
    {/if}
  {/each}
</svg>

<style>
  svg{width:100%;height:100%;display:block;touch-action:none}
  .link{stroke:var(--line);stroke-linecap:round}
  .link.broken{stroke:color-mix(in srgb,var(--red) 45%,transparent);stroke-dasharray:6 6}
  .ghost{stroke:var(--faint);stroke-width:2;stroke-dasharray:3 7;opacity:.6}
  .gone{stroke:var(--muted);stroke-width:2.5;stroke-dasharray:8 8}
  .halo{stroke:color-mix(in srgb,var(--accent) 45%,transparent);stroke-width:12;stroke-linecap:round}
  .node{cursor:pointer}
  text{fill:var(--text);font-size:15px;font-weight:500;text-anchor:middle;paint-order:stroke;stroke:var(--bg);stroke-width:4px;stroke-linejoin:round}
  .strip{stroke:var(--glass-border);stroke-width:1.5;stroke-dasharray:6 6}
  text.striplabel{text-anchor:start;font-size:13px;fill:var(--muted)}
  text.why{font-size:13px;font-weight:600}
  .beacon{fill:none;stroke:var(--amber);stroke-width:2;animation:pulse 1.6s ease-out infinite;opacity:0}
  @keyframes pulse{0%{opacity:.9}100%{opacity:0}}
</style>
