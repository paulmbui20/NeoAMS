<!--
  src/lib/components/ui/Input.svelte
  A text field. The type decides the keyboard and the browser's own
  checks; the error state is drawn here so every field looks the same.
-->
<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  type Props = {
    value?: string | number;
    type?: string;
    name?: string;
    placeholder?: string;
    error?: string | null;
    disabled?: boolean;
    required?: boolean;
    readonly?: boolean;
    autocomplete?: string;
    class?: string;
    id?: string;
    describedBy?: string;
    min?: string | number;
    max?: string | number;
    step?: string | number;
  } & Omit<HTMLInputAttributes, "class" | "value" | "type">;

  let {
    value = $bindable(),
    type = "text",
    name,
    placeholder,
    error = null,
    disabled = false,
    required = false,
    readonly = false,
    autocomplete,
    class: className = "",
    id,
    describedBy,
    ...rest
  }: Props = $props();
</script>

<input
  {id}
  {name}
  {type}
  {placeholder}
  {disabled}
  {required}
  {readonly}
  {autocomplete}
  aria-describedby={describedBy}
  aria-invalid={error ? "true" : undefined}
  class="w-full rounded-md border bg-surface px-3 text-sm text-ink transition-colors duration-100 placeholder:text-ink-faint disabled:bg-surface-sunken disabled:text-ink-muted {error
    ? 'border-error focus:border-error'
    : 'border-line-strong focus:border-accent'} h-9 {className}"
  bind:value
  {...rest}
/>
