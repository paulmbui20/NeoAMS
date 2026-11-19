<!--
  src/lib/components/ui/Select.svelte
  A select. The native control, styled to match the other fields.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Option = {
    value: string;
    label: string;
    disabled?: boolean;
  };

  type Props = {
    value?: string;
    options: Option[];
    placeholder?: string;
    error?: string | null;
    disabled?: boolean;
    required?: boolean;
    name?: string;
    id?: string;
    describedBy?: string;
    class?: string;
    /** Called when the choice changes, for a select that is not bound. */
    onchange?: (value: string) => void;
    children?: Snippet;
  };

  let {
    value = $bindable(""),
    options,
    placeholder,
    error = null,
    disabled = false,
    required = false,
    name,
    id,
    describedBy,
    class: className = "",
    onchange,
    children,
  }: Props = $props();

  /** The choice is taken, and the parent is told. */
  function choose(event: Event) {
    const next = (event.currentTarget as HTMLSelectElement).value;
    value = next;
    onchange?.(next);
  }
</script>

<div class="relative {className}">
  <select
    {id}
    {name}
    {disabled}
    {required}
    aria-describedby={describedBy}
    aria-invalid={error ? "true" : undefined}
    class="w-full appearance-none rounded-md border bg-surface pr-9 pl-3 text-sm text-ink transition-colors duration-100 disabled:bg-surface-sunken disabled:text-ink-muted {error
      ? 'border-error'
      : 'border-line-strong focus:border-accent'} h-9"
    {value}
    onchange={choose}
  >
    {#if placeholder}
      <option value="" disabled>{placeholder}</option>
    {/if}
    {#each options as option (option.value)}
      <option value={option.value} disabled={option.disabled}>
        {option.label}
      </option>
    {/each}
  </select>
  <svg
    class="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-ink-muted"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M4 6l4 4 4-4"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</div>
{#if children}{@render children()}{/if}
