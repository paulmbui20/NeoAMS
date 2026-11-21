<!--
  src/routes/logs/+page.svelte
  The audit trail for the current property.
  Shows who did what and when. Owner-level and admin access only.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api, ApiError } from "$lib/api/client";
  import { session } from "$lib/api/session.svelte";
  import { workspace } from "$lib/api/workspace.svelte";
  import PageHeader from "$lib/components/shell/PageHeader.svelte";
  import PropertyRequired from "$lib/components/shell/PropertyRequired.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Empty from "$lib/components/ui/Empty.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { formatDate } from "$lib/ui/status";
  import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-svelte";

  type LogEntry = {
    id: number;
    userId: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    oldValues: unknown;
    newValues: unknown;
    ipAddress: string | null;
    createdAt: string;
  };

  type LogPage = {
    data: LogEntry[];
    meta: { total: number; limit: number; offset: number };
  };

  let entries = $state<LogEntry[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let offset = $state(0);
  const LIMIT = 50;

  async function load(reset = false) {
    const propertyId = workspace.currentId;
    if (propertyId === null) {
      entries = [];
      return;
    }
    if (reset) offset = 0;
    loading = true;
    error = null;
    try {
      const result = await api.get<LogPage>(
        `/properties/${propertyId}/audit-logs`,
        { query: { limit: LIMIT, offset } },
      );
      entries = result.data;
      total = result.meta.total;
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        error = "Audit logs are only visible to owners and administrators.";
      } else {
        error =
          err instanceof ApiError
            ? err.message
            : "The audit log could not be loaded.";
      }
      entries = [];
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    if (!session.loading && !session.isSignedIn) {
      await goto("/login", { replaceState: true });
      return;
    }
    await workspace.load();
  });

  $effect(() => {
    const id = workspace.currentId;
    if (id !== null && session.isSignedIn) void load(true);
  });

  function formatAction(action: string): string {
    return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatAuditValue(value: unknown): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value) ?? String(value);
  }

  function formatDetails(entry: LogEntry): string {
    const details = [];
    if (entry.oldValues !== null) {
      details.push(`Before: ${formatAuditValue(entry.oldValues)}`);
    }
    if (entry.newValues !== null) {
      details.push(`After: ${formatAuditValue(entry.newValues)}`);
    }
    if (entry.ipAddress) details.push(`IP: ${entry.ipAddress}`);
    return details.join(" · ");
  }
</script>

<PageHeader
  title="Audit Logs"
  description={total > 0
    ? `${total} event${total === 1 ? "" : "s"} recorded.`
    : "A trail of every action taken in this property."}
/>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else if error}
  <div class="panel p-6">
    <p class="text-sm text-error">{error}</p>
  </div>
{:else if loading && entries.length === 0}
  <div class="panel p-6 text-center text-sm text-ink-muted">
    Loading the audit log…
  </div>
{:else if entries.length === 0}
  <div class="panel">
    <Empty
      title="No events yet"
      description="Actions taken in this property will appear here."
    />
  </div>
{:else}
  <Card padded={false}>
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-sm">
        <thead class="border-b border-line bg-surface-muted">
          <tr class="text-left">
            <th class="px-4 py-2.5 font-medium text-ink-700">When</th>
            <th class="px-4 py-2.5 font-medium text-ink-700">Actor</th>
            <th class="px-4 py-2.5 font-medium text-ink-700">Action</th>
            <th class="px-4 py-2.5 font-medium text-ink-700">Entity</th>
            <th class="px-4 py-2.5 font-medium text-ink-700">Details</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          {#each entries as entry (entry.id)}
            <tr class="hover:bg-surface-muted">
              <td class="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(entry.createdAt))}
              </td>
              <td class="px-4 py-3">
                <span class="font-medium text-ink">
                  {entry.userId ? "User" : "System"}
                </span>
                <span class="mt-0.5 block font-mono text-xs text-ink-faint">
                  {entry.userId ? `${entry.userId.slice(0, 8)}…` : "—"}
                </span>
              </td>
              <td class="px-4 py-3 text-ink">
                {formatAction(entry.action)}
              </td>
              <td class="px-4 py-3 text-ink-muted">
                {#if entry.entity}
                  <span class="capitalize">{entry.entity}</span>
                  {#if entry.entityId !== null}
                    <span class="ml-1 font-mono text-xs text-ink-faint">
                      #{entry.entityId}
                    </span>
                  {/if}
                {:else}
                  —
                {/if}
              </td>
              <td class="px-4 py-3 text-xs text-ink-muted max-w-xs truncate">
                {formatDetails(entry) || "—"}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>

  {#if total > LIMIT}
    <div class="mt-4 flex items-center justify-between text-sm text-ink-muted">
      <span>
        Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
      </span>
      <div class="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={offset === 0 || loading}
          onclick={() => {
            offset = Math.max(0, offset - LIMIT);
            void load();
          }}
        >
          <ChevronLeft class="size-3.5 mr-1" />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={offset + LIMIT >= total || loading}
          onclick={() => {
            offset += LIMIT;
            void load();
          }}
        >
          Next
          <ChevronRight class="size-3.5 ml-1" />
        </Button>
      </div>
    </div>
  {/if}
{/if}
