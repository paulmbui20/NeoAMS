<!--
  src/lib/components/ui/Toaster.svelte
  Where the notices appear.
-->
<script lang="ts">
  import { toast } from "./toast.svelte";
  import Alert from "./Alert.svelte";
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:bottom-0 sm:items-end"
  role="region"
  aria-label="Notifications"
>
  {#each toast.items as item (item.id)}
    <div class="pointer-events-auto w-full max-w-sm animate-slide-up">
      <div class="panel p-3 shadow-lg">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <Alert tone={item.tone}>
              <p class="font-medium">{item.title}</p>
              {#if item.description}
                <p class="mt-0.5 text-xs opacity-90">{item.description}</p>
              {/if}
            </Alert>
          </div>
          <button
            type="button"
            class="-mt-0.5 -mr-0.5 rounded p-1 text-ink-faint transition-colors hover:text-ink"
            onclick={() => toast.dismiss(item.id)}
            aria-label="Dismiss"
          >
            <svg
              class="size-4"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  {/each}
</div>
