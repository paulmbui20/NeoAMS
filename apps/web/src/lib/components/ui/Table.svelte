<!--
  src/lib/components/ui/Table.svelte
  A table with its parts, so every table in the interface lines up.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    class?: string;
    head?: Snippet;
    body?: Snippet;
    empty?: Snippet;
  };

  let { class: className = "", head, body, empty }: Props = $props();
</script>

<div
  class="overflow-x-auto rounded-lg border border-line bg-surface {className}"
>
  <table class="w-full border-collapse text-sm">
    {#if head}
      <thead class="border-b border-line bg-surface-muted">
        {@render head()}
      </thead>
    {/if}
    {#if body}
      <tbody class="divide-y divide-line">
        {@render body()}
      </tbody>
    {/if}
  </table>
  {#if empty}
    {@render empty()}
  {/if}
</div>
