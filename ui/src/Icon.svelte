<script>
  import {ICONS} from "./util.js";
  let {name, small = false, path = null} = $props();
</script>
<svg class="icon" class:small viewBox="0 0 24 24"><path d={path ?? ICONS[name]}/></svg>
