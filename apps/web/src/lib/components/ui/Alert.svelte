<!--
  src/lib/components/ui/Alert.svelte
  A message that sits above the content: an error, a warning, a piece
  of information or a confirmation.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    tone?: "success" | "error" | "warning" | "info";
    title?: string;
    class?: string;
    children?: Snippet;
  };

  let {
    tone = "info",
    title,
    class: className = "",
    children,
  }: Props = $props();

  const tones: Record<string, string> = {
    success: "bg-success-soft text-success border-success-line",
    error: "bg-error-soft text-error border-error-line",
    warning: "bg-warning-soft text-warning border-warning-line",
    info: "bg-info-soft text-info border-info-line",
  };

  const icons: Record<string, string> = {
    success: "M5 8.5l2.5 2.5L11 6",
    error: "M8 4.5v4.5M8 11.5v.5",
    warning: "M8 4.5v4.5M8 11.5v.5",
    info: "M8 7.5v4M8 4.5v.5",
  };
</script>

<div
  role={tone === "error" ? "alert" : "status"}
  class="flex gap-2.5 rounded-md border px-3 py-2.5 text-sm {tones[
    tone
  ]} {className}"
>
  <svg
    class="mt-0.5 size-4 shrink-0"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.5" />
    <path
      d={icons[tone]}
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
  <div class="min-w-0">
    {#if title}
      <p class="font-medium">{title}</p>
    {/if}
    {#if children}
      <div class={title ? "mt-0.5 opacity-90" : ""}>{@render children()}</div>
    {/if}
  </div>
</div>
