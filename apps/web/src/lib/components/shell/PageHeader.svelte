<!--
  src/lib/components/shell/PageHeader.svelte
  The heading of a page: what it is, and what may be done with it.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    description?: string;
    actions?: Snippet;
  };

  let { title, description, actions }: Props = $props();
</script>

<div
  class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
>
  <div class="min-w-0">
    <h1 class="text-xl font-semibold tracking-tight text-ink">{title}</h1>
    {#if description}
      <p class="mt-1 text-sm text-ink-muted">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
  {/if}
</div>
