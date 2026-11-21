<script lang="ts">
  import { getLucideIcon } from "$lib/utils/lucide-icons";

  type Props = {
    name: string | null;
    class?: string;
  };

  let { name, class: className = "size-4" }: Props = $props();
  let IconComponent = $derived(getLucideIcon(name));
</script>

{#if IconComponent}
  {@const LoadedIcon = IconComponent}
  <LoadedIcon class={className} aria-hidden="true" />
{/if}
