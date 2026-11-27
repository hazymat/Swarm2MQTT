<script>
  // Settings › Home Screen: how to put Swarm2MQTT on the Home Screen, so it opens full screen like an app
  import {toast} from "./api.svelte.js";
  import {install, isIOS, isStandalone, promptInstall} from "./install.svelte.js";
  const ios = isIOS(), standalone = isStandalone();
  let steps = $state(false);
  async function installNow() {if (await promptInstall()) toast("Installed. Open it from your Home Screen or app list.", null); else toast("Not installed. You can do it any time from here.", null)}
</script>
{#if standalone}
  <p class="ok">✓ Swarm2MQTT is on your Home Screen, so it opens full screen, without the browser's address bar.</p>
{:else if ios}
  <p>Put Swarm2MQTT on your Home Screen and it opens full screen, like an app: no Safari address bar or buttons, more room for your devices.</p>
  {#if !steps}<div><button class="pill primary" onclick={() => steps = true}>Show me how</button></div>
  {:else}
    <ol class="steps">
      <li>Open this page in <b>Safari</b> (the blue compass), not inside another app.</li>
      <li>Tap the <b>Share</b> button: a square with an arrow, at the bottom of the screen (on an iPad, at the top).</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
      <li>Open Swarm2MQTT from its new icon. This page in Safari can then be closed.</li>
    </ol>
  {/if}
{:else if install.prompt}
  <p>Install Swarm2MQTT as an app: it gets its own window and icon, without the browser's address bar.</p>
  <div><button class="pill primary" onclick={installNow}>Install Swarm2MQTT</button></div>
{:else}
  <p>Swarm2MQTT can open full screen like an app. In your browser's menu, choose <b>Add to Home Screen</b> (on a phone) or <b>Install app</b> / <b>Create shortcut</b> (on a computer).</p>
{/if}
<style>
  p{margin:0;line-height:1.45}
  .ok{color:var(--green)}
  .steps{margin:4px 0 0;padding-left:1.3em;display:flex;flex-direction:column;gap:6px;line-height:1.4}
</style>
