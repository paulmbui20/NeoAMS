<!--
  src/lib/components/ui/Button.svelte
  The one button. Its size and its tone are the only choices.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  type Props = {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    type?: "button" | "submit" | "reset";
    loading?: boolean;
    disabled?: boolean;
    full?: boolean;
    href?: string;
    class?: string;
    children: Snippet;
  } & Omit<HTMLButtonAttributes, "class" | "type">;

  let {
    variant = "primary",
    size = "md",
    type = "button",
    loading = false,
    disabled = false,
    full = false,
    href,
    class: className = "",
    children,
    ...rest
  }: Props = $props();

  const tones: Record<string, string> = {
    primary:
      "bg-accent text-ink-inverted border-transparent hover:bg-accent-hover disabled:bg-ink-300",
    secondary:
      "bg-surface text-ink border-line hover:bg-surface-muted disabled:text-ink-faint",
    ghost:
      "bg-transparent text-ink-700 border-transparent hover:bg-accent-soft disabled:text-ink-faint",
    danger:
      "bg-error text-white border-transparent hover:brightness-110 disabled:opacity-50",
  };

  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-9 px-3.5 text-sm gap-2",
    lg: "h-11 px-5 text-sm gap-2",
  };
</script>

{#if href}
  <a
    {href}
    class="inline-flex items-center justify-center rounded-md border font-medium transition-colors duration-100 select-none {tones[
      variant
    ]} {sizes[size]} {full ? 'w-full' : ''} {className}"
  >
    {@render children()}
  </a>
{:else}
  <button
    {type}
    disabled={disabled || loading}
    class="inline-flex items-center justify-center rounded-md border font-medium transition-colors duration-100 select-none disabled:cursor-not-allowed {tones[
      variant
    ]} {sizes[size]} {full ? 'w-full' : ''} {className}"
    {...rest}
  >
    {#if loading}
      <span
        class="size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin"
        aria-hidden="true"
      ></span>
    {/if}
    {@render children()}
  </button>
{/if}
