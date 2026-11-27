<script>
  import {live, act, toast} from "./api.svelte.js";
  import {view, go} from "./ui.svelte.js";
  import Pic from "./Pic.svelte";
  let snap = $derived(live.snap);
  let nameOf = ieee => snap.devices.find(device => device.ieee === ieee)?.name ?? ieee;
  let editing = $state(null), draft = $state(""), adding = $state(null), sceneName = $state({});
  function save(group) {editing = null; if (draft.trim() && draft !== group.name) act("groupRename", {id: group.id, name: draft})}
  let candidates = group => snap.devices.filter(device => device.status === "accepted" && device.kind === "router" && !group.members.includes(device.ieee));
</script>
<div class="groups">
  {#each snap.groups as group (group.id)}
    {@const scenes = snap.scenes.filter(scene => scene.group_id === group.id)}
    <section class="card group">
      <div class="head">
        {#if editing === group.id}<input class="text" bind:value={draft} onblur={() => save(group)} onkeydown={event => {if (event.key === "Enter") save(group); if (event.key === "Escape") {event.stopPropagation(); editing = null}}} autofocus>
        {:else}<button class="name" onclick={() => {editing = group.id; draft = group.name}}>{group.name}</button>{/if}
        <code class="faint">{snap.mqtt.settings.baseTopic}/{group.topic}</code>
        <span class="acts">
          <button class="pill" style="background:var(--mint)" disabled={!snap.radio.up} onclick={() => act("groupSet", {id: group.id, values: {state: "ON"}})}>On</button>
          <button class="pill ghost" disabled={!snap.radio.up} onclick={() => act("groupSet", {id: group.id, values: {state: "OFF"}})}>Off</button>
        </span>
      </div>
      <input type="range" min="0" max="254" value="180" title="Brightness" onchange={event => act("groupSet", {id: group.id, values: {brightness: Number(event.currentTarget.value)}})}>
      <div class="members">
        {#each group.members as ieee}{@const device = snap.devices.find(candidate => candidate.ieee === ieee)}<span class="chip member">{#if device}<Pic {device} size={22}/>{/if}{nameOf(ieee)}<button onclick={() => act("groupMember", {id: group.id, ieee, remove: true})} title="Take out of the group">✕</button></span>{/each}
        {#if adding === group.id}{#each candidates(group) as device}<button class="chip" onclick={() => act("groupMember", {id: group.id, ieee: device.ieee})}>+ {device.name}</button>{/each}<button class="chip" onclick={() => adding = null}>Done</button>
        {:else}<button class="chip add" onclick={() => adding = group.id}>+ Add devices</button>{/if}
      </div>
      <div class="scenes">
        {#each scenes as scene (scene.id)}<span class="scene"><button class="pill" style="background:var(--lilac)" onclick={() => act("sceneRecall", {id: scene.id})}>{scene.name}</button><button class="x" title="Delete scene" onclick={() => act("sceneDelete", {id: scene.id})}>✕</button></span>{/each}
        <span class="savescene"><input class="text" placeholder="Scene name" bind:value={sceneName[group.id]}><button class="pill ghost" disabled={!group.members.length || !snap.radio.up} onclick={() => {act("sceneSave", {groupId: group.id, name: sceneName[group.id] ?? ""}); sceneName[group.id] = ""}}>Save what's on now</button></span>
      </div>
      <button class="link" onclick={() => act("groupDelete", {id: group.id})}>Delete group</button>
    </section>
  {:else}
    <div class="empty">
      <svg width="120" height="70" viewBox="0 0 120 70"><circle cx="60" cy="12" r="9" fill="var(--accent)"/>{#each [20, 60, 100] as x}<path d="M60 21L{x} 50" stroke="var(--line)" stroke-width="2"/><path d="M{x - 9} 50a9 9 0 0 1 18 0v6h-18z" fill="var(--peach)"/>{/each}</svg>
      <span>One command reaches every device in a group at once, so lights change together.</span>
      <button class="pill primary" onclick={() => act("groupCreate", {name: "New group", members: []})}>Make a group</button>
    </div>
  {/each}
</div>
<style>
  .groups{padding:18px 24px 90px;display:flex;flex-direction:column;gap:14px;max-width:900px}
  .group{padding:16px;display:flex;flex-direction:column;gap:12px}
  .head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .name{font-size:19px;font-weight:500}
  .acts{margin-left:auto;display:flex;gap:6px}
  .members,.scenes{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .member{padding:4px 8px 4px 4px;color:var(--text)}
  .member button{color:var(--faint);font-size:12px}
  .scene{display:inline-flex;align-items:center}
  .x{color:var(--faint);font-size:12px;padding:0 6px}
  .savescene{display:flex;gap:6px;align-items:center}
  .savescene .text{width:150px}
  .link{color:var(--accent);font-size:14px;align-self:flex-start}
  @media (max-width:700px){.groups{padding:12px}}
</style>
