<!--
  src/lib/components/ui/Empty.svelte
  What is shown when there is nothing to show.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    description?: string;
    class?: string;
    children?: Snippet;
  };

  let { title, description, class: className = "", children }: Props = $props();
</script>

<div
  class="flex flex-col items-center justify-center px-6 py-12 text-center {className}"
>
  <div
    class="flex size-10 items-center justify-center rounded-full bg-ink-100 text-ink-muted"
    aria-hidden="true"
  >
    <svg class="size-5" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 6.5A1.5 1.5 0 014.5 5h3.879a1.5 1.5 0 011.06.44l1.622 1.62a1.5 1.5 0 001.061.44h3.378A1.5 1.5 0 0117 9v7.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 16.5v-10z"
        stroke="currentColor"
        stroke-width="1.5"
      />
    </svg>
  </div>
  <p class="mt-3 text-sm font-medium text-ink">{title}</p>
  {#if description}
    <p class="mt-1 max-w-sm text-xs text-ink-muted">{description}</p>
  {/if}
  {#if children}
    <div class="mt-4">{@render children()}</div>
  {/if}
</div>
