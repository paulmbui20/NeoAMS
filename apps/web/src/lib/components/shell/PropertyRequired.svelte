<!--
  src/lib/components/shell/PropertyRequired.svelte
  Shown when a page needs a property and none has been chosen.

  The administrator may work in every property, so the choice is theirs
  to make; the page waits until they have made it.
-->
<script lang="ts">
  import { workspace } from "$lib/api/workspace.svelte";
  import Empty from "$lib/components/ui/Empty.svelte";
</script>

<Empty
  title="Choose a property"
  description="Pick the property you are working in from the menu at the top of the page."
/>

{#if workspace.properties.length === 1}
  <p class="text-center text-xs text-ink-muted">
    Only one property is available to you.
  </p>
{/if}
