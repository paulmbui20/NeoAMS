<!--
  src/routes/guests/+page.svelte
  The guests of the property.

  A search by name, email, identity number or phone, and the record of
  one guest with the stays that guest has made.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api, ApiError } from "$lib/api/client";
  import { session } from "$lib/api/session.svelte";
  import { workspace } from "$lib/api/workspace.svelte";
  import PageHeader from "$lib/components/shell/PageHeader.svelte";
  import PropertyRequired from "$lib/components/shell/PropertyRequired.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Empty from "$lib/components/ui/Empty.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { toast } from "$lib/components/ui/toast.svelte";
  import { bookingLabel, bookingTone, formatDate } from "$lib/ui/status";

  type Guest = {
    id: number;
    firstName: string;
    middleName: string | null;
    lastName: string;
    email: string | null;
    phone: string;
    country: string | null;
    nationality: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    address: string | null;
  };

  type GuestWithHistory = Guest & {
    bookings: {
      id: number;
      reference: string;
      status: string;
      checkInDate: string;
      checkOutDate: string;
    }[];
  };

  let guests = $state<Guest[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let q = $state("");

  /** The guest whose record is open, if any. */
  let openGuest = $state<GuestWithHistory | null>(null);

  async function load() {
    const propertyId = workspace.currentId;
    if (propertyId === null) {
      guests = [];
      return;
    }
    loading = true;
    error = null;
    try {
      const result = await api.get<{ data: Guest[]; meta: { total: number } }>(
        `/properties/${propertyId}/guests`,
        { query: { q: q.trim() || undefined, limit: 50, offset: 0 } },
      );
      guests = result.data;
      total = result.meta.total;
    } catch (err) {
      error =
        err instanceof ApiError
          ? err.message
          : "The guests could not be loaded.";
      guests = [];
    } finally {
      loading = false;
    }
  }

  async function search(event?: SubmitEvent) {
    event?.preventDefault();
    await load();
  }

  /** Open the record of one guest, with the stays that guest has made. */
  async function open(id: number) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      openGuest = await api.get<GuestWithHistory>(
        `/properties/${propertyId}/guests/${id}`,
      );
    } catch (err) {
      toast.error(
        "The record could not be opened",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  onMount(async () => {
    if (!session.loading && !session.isSignedIn) {
      await goto("/login", { replaceState: true });
      return;
    }
    // The list of properties decides what is shown; the effect below
    // reads the page's own data as soon as one is chosen.
    await workspace.load();
  });

  $effect(() => {
    const id = workspace.currentId;
    if (id !== null && session.isSignedIn) void load();
  });

  const fullName = (guest: Guest) =>
    `${guest.firstName} ${guest.lastName}`.trim();
</script>

<PageHeader
  title="Guests"
  description={total > 0
    ? `${total} guest${total === 1 ? "" : "s"} found.`
    : "The people who have stayed, or are staying, in this property."}
/>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else}
  <form class="mb-4 flex flex-col gap-2 sm:flex-row" onsubmit={search}>
    <div class="flex-1">
      <Input
        bind:value={q}
        placeholder="Name, email, phone or identity number"
        aria-label="Search"
      />
    </div>
    <Button type="submit" {loading}>Search</Button>
    {#if q}
      <Button
        variant="ghost"
        onclick={() => {
          q = "";
          void search();
        }}
      >
        Clear
      </Button>
    {/if}
  </form>

  {#if error}
    <div class="panel p-6">
      <p class="text-sm text-error">{error}</p>
    </div>
  {:else if loading && guests.length === 0}
    <div class="panel p-6 text-center text-sm text-ink-muted">
      Loading the guests…
    </div>
  {:else if guests.length === 0}
    <div class="panel">
      <Empty
        title="No guests"
        description={q
          ? "Nothing matches that search."
          : "No guest has been recorded in this property yet."}
      />
    </div>
  {:else}
    <Card padded={false}>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead class="border-b border-line bg-surface-muted">
            <tr class="text-left">
              <th class="px-4 py-2.5 font-medium text-ink-700">Name</th>
              <th class="px-4 py-2.5 font-medium text-ink-700">Phone</th>
              <th class="px-4 py-2.5 font-medium text-ink-700">Email</th>
              <th class="px-4 py-2.5 font-medium text-ink-700">Country</th>
              <th class="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            {#each guests as guest (guest.id)}
              <tr class="hover:bg-surface-muted">
                <td class="px-4 py-3 font-medium text-ink">
                  {fullName(guest)}
                </td>
                <td class="px-4 py-3 text-ink-muted">{guest.phone}</td>
                <td class="px-4 py-3 text-ink-muted">
                  {guest.email ?? "—"}
                </td>
                <td class="px-4 py-3 text-ink-muted">
                  {guest.country ?? "—"}
                </td>
                <td class="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onclick={() => open(guest.id)}
                  >
                    Open
                  </Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  {/if}

  {#if openGuest}
    <div class="mt-4">
      <Card
        title={fullName(openGuest)}
        description={`${openGuest.phone}${openGuest.email ? ` · ${openGuest.email}` : ""}`}
      >
        {#snippet actions()}
          <Button size="sm" variant="ghost" onclick={() => (openGuest = null)}>
            Close
          </Button>
        {/snippet}

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <p class="text-xs font-medium text-ink-muted">Country</p>
            <p class="mt-0.5 text-sm text-ink">
              {openGuest.country ?? "—"}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium text-ink-muted">Nationality</p>
            <p class="mt-0.5 text-sm text-ink">
              {openGuest.nationality ?? "—"}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium text-ink-muted">Date of birth</p>
            <p class="mt-0.5 text-sm text-ink">
              {openGuest.dateOfBirth ? formatDate(openGuest.dateOfBirth) : "—"}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium text-ink-muted">Address</p>
            <p class="mt-0.5 text-sm text-ink">{openGuest.address ?? "—"}</p>
          </div>
        </div>

        <div class="mt-5">
          <p class="text-xs font-medium text-ink-muted">The stays</p>
          {#if openGuest.bookings.length === 0}
            <p class="mt-1.5 text-sm text-ink-muted">No stays recorded.</p>
          {:else}
            <ul class="mt-2 divide-y divide-line">
              {#each openGuest.bookings as stay (stay.id)}
                <li class="flex items-center gap-3 py-2">
                  <span class="font-medium text-ink">{stay.reference}</span>
                  <span class="text-xs text-ink-muted">
                    {formatDate(stay.checkInDate)}
                    <span class="mx-1">→</span>
                    {formatDate(stay.checkOutDate)}
                  </span>
                  <span class="ml-auto">
                    <Badge tone={bookingTone(stay.status)}>
                      {bookingLabel(stay.status)}
                    </Badge>
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </Card>
    </div>
  {/if}
{/if}
