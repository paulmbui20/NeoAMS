<!--
  src/lib/components/shell/Logo.svelte
  The mark. A single glyph and the name.
-->
<script lang="ts">
  type Props = {
    size?: "sm" | "md" | "lg";
    showName?: boolean;
  };

  let { size = "md", showName = true }: Props = $props();

  const sizes = $derived(
    {
      sm: { box: "size-6", text: "text-sm" },
      md: { box: "size-7", text: "text-base" },
      lg: { box: "size-9", text: "text-lg" },
    }[size],
  );
</script>

<span class="inline-flex items-center gap-2">
  <span
    class="flex {sizes.box} items-center justify-center rounded-md bg-ink-900 text-ink-50"
    aria-hidden="true"
  >
    <svg class="size-4" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 16V6.5L10 3l7 3.5V16"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <path
        d="M7.5 16v-4.5h5V16"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>
  </span>
  {#if showName}
    <span class="{sizes.text} font-semibold tracking-tight text-ink">
      Neo<span class="font-normal text-ink-muted">AMS</span>
    </span>
  {/if}
</span>
