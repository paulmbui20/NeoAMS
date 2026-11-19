<!--
  src/lib/components/ui/Card.svelte
  A panel: a title, an optional description, and whatever is inside.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title?: string;
    description?: string;
    padded?: boolean;
    class?: string;
    actions?: Snippet;
    children: Snippet;
  };

  let {
    title,
    description,
    padded = true,
    class: className = "",
    actions,
    children,
  }: Props = $props();
</script>

<section class="panel overflow-hidden {className}">
  {#if title || actions}
    <header
      class="flex items-start justify-between gap-4 border-b border-line px-4 py-3 sm:px-5"
    >
      <div class="min-w-0">
        {#if title}
          <h2 class="text-sm font-semibold text-ink">{title}</h2>
        {/if}
        {#if description}
          <p class="mt-0.5 text-xs text-ink-muted">{description}</p>
        {/if}
      </div>
      {#if actions}
        <div class="flex shrink-0 items-center gap-2">{@render actions()}</div>
      {/if}
    </header>
  {/if}
  <div class={padded ? "p-4 sm:p-5" : ""}>
    {@render children()}
  </div>
</section>
