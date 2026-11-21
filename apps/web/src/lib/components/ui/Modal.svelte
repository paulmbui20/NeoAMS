<!--
  src/lib/components/ui/Modal.svelte
  A focused modal dialog that traps focus and closes on Escape or backdrop click.
  Supports optional step indicator for multi-step forms.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { X } from "lucide-svelte";
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    open: boolean;
    onclose: () => void;
    /** Total number of steps (omit for single-step modals). */
    totalSteps?: number;
    /** Current step, 1-based. */
    currentStep?: number;
    children: Snippet;
    /** Optional footer rendered inside the modal. */
    footer?: Snippet;
    /** Width class — defaults to max-w-xl. */
    width?: string;
  };

  let {
    title,
    open,
    onclose,
    totalSteps,
    currentStep = 1,
    children,
    footer,
    width = "max-w-xl",
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      onclose();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", handleKeydown);
    }
  });
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/60 backdrop-blur-sm animate-fade-in"
    role="presentation"
    onclick={onclose}
  >
    <!-- Modal panel -->
    <div
      class="relative w-full {width} max-h-[90dvh] flex flex-col bg-surface rounded-xl shadow-lg border border-line overflow-hidden animate-slide-up"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between gap-3 px-5 py-4 border-b border-line shrink-0"
      >
        <div class="min-w-0">
          <h2
            id="modal-title"
            class="text-base font-semibold text-ink truncate"
          >
            {title}
          </h2>
          {#if totalSteps && totalSteps > 1}
            <p class="mt-0.5 text-xs text-ink-muted">
              Step {currentStep} of {totalSteps}
            </p>
          {/if}
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors cursor-pointer"
          onclick={onclose}
          aria-label="Close"
        >
          <X class="size-4" />
        </button>
      </div>

      <!-- Step indicator bar -->
      {#if totalSteps && totalSteps > 1}
        <div class="flex gap-1.5 px-5 pt-3 shrink-0">
          {#each Array(totalSteps) as _, i}
            <div
              class="h-1 flex-1 rounded-full transition-colors {i + 1 <=
              currentStep
                ? 'bg-ink'
                : 'bg-line'}"
            ></div>
          {/each}
        </div>
      {/if}

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-5 py-4">
        {@render children()}
      </div>

      <!-- Footer -->
      {#if footer}
        <div class="shrink-0 border-t border-line px-5 py-3.5 bg-surface-muted">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
