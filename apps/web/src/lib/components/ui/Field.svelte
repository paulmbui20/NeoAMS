<!--
  src/lib/components/ui/Field.svelte
  A labelled field: the label, the control, the hint and the error.
  The control is passed in, so a field can hold an input, a select or a
  textarea without the field knowing the difference.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    label: string;
    name?: string;
    hint?: string;
    error?: string | null;
    required?: boolean;
    class?: string;
    children: Snippet<
      [{ id: string; describedBy: string | undefined; invalid: boolean }]
    >;
  };

  let {
    label,
    name,
    hint,
    error = null,
    required = false,
    class: className = "",
    children,
  }: Props = $props();

  // A stable id, so the label can point at the control.
  const id = $props.id();
  const hintId = $derived(hint ? `${id}-hint` : undefined);
  const errorId = $derived(error ? `${id}-error` : undefined);
  const describedBy = $derived(
    [errorId, hintId].filter(Boolean).join(" ") || undefined,
  );
</script>

<div class={className}>
  <label class="label" for={id}>
    {label}
    {#if required}<span class="text-error" aria-hidden="true">*</span>{/if}
  </label>
  {@render children({ id, describedBy, invalid: Boolean(error) })}
  {#if error}
    <p class="field-error" id={errorId}>{error}</p>
  {:else if hint}
    <p class="hint" id={hintId}>{hint}</p>
  {/if}
</div>
