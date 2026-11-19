<!--
  src/lib/components/shell/PropertyPicker.svelte
  Which property the person is working in.

  A global administrator may work in every property; everybody else
  works in the ones they are on the roster of. The choice is kept
  between visits, so the desk does not have to make it again every
  morning.
-->
<script lang="ts">
  import type { PropertyAccess } from "$lib/api/session.svelte";

  type Props = {
    properties: PropertyAccess[];
    current: number | null;
    onchange: (propertyId: number | null) => void;
    /** True for the global administrator, who may work in any property. */
    isAdmin?: boolean;
  };

  let { properties, current, onchange, isAdmin = false }: Props = $props();

  const select = (event: Event) => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    onchange(value === "" ? null : Number(value));
  };
</script>

{#if properties.length === 0}
  <div class="flex items-center gap-2 text-xs text-ink-muted">
    <span class="rounded bg-ink-100 px-1.5 py-0.5 font-medium text-ink-700">
      Administrator
    </span>
    <span>Every property</span>
  </div>
{:else if properties.length === 1 && !isAdmin}
  <div class="flex items-center gap-2">
    <span class="text-sm font-medium text-ink">{properties[0]!.name}</span>
    <span
      class="rounded bg-ink-100 px-1.5 py-0.5 text-2xs font-medium text-ink-600"
    >
      {properties[0]!.role}
    </span>
  </div>
{:else}
  <label class="flex items-center gap-2">
    <span class="sr-only">Property</span>
    <select
      class="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink focus:border-accent"
      value={current ?? ""}
      onchange={select}
    >
      <option value="">Choose a property…</option>
      {#each properties as property (property.id)}
        <option value={property.id}>{property.name}</option>
      {/each}
    </select>
  </label>
{/if}
