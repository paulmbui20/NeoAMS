<!--
  src/lib/components/ui/Badge.svelte
  A small label. The four functional tones are the only coloured ones;
  "neutral" is the default, and it is the one used most.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    tone?: "neutral" | "success" | "error" | "warning" | "info";
    size?: "sm" | "md";
    class?: string;
    children: Snippet;
  };

  let {
    tone = "neutral",
    size = "sm",
    class: className = "",
    children,
  }: Props = $props();

  const tones: Record<string, string> = {
    neutral: "bg-ink-100 text-ink-700 ring-ink-200",
    success: "bg-success-soft text-success ring-success-line",
    error: "bg-error-soft text-error ring-error-line",
    warning: "bg-warning-soft text-warning ring-warning-line",
    info: "bg-info-soft text-info ring-info-line",
  };

  const sizes: Record<string, string> = {
    sm: "px-1.5 py-0.5 text-2xs",
    md: "px-2 py-0.5 text-xs",
  };
</script>

<span
  class="inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset {tones[
    tone
  ]} {sizes[size]} {className}"
>
  {@render children()}
</span>
