<!--
  src/routes/bookings/+page.svelte
  The bookings of the property.

  A list that can be searched by reference, by name or by phone, and
  filtered by state. This is the page the desk works from.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
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
  import Select from "$lib/components/ui/Select.svelte";
  import { toast } from "$lib/components/ui/toast.svelte";
  import {
    bookingLabel,
    bookingTone,
    formatDate,
    formatMoney,
  } from "$lib/ui/status";

  type Booking = {
    id: number;
    reference: string;
    status: string;
    rateType: string;
    checkInDate: string;
    checkOutDate: string;
    totalCostCents: number;
    depositRequiredCents: number;
    source: string;
    roomId: number;
    roomNumber: string;
    roomType: string;
    guestId: number;
    guestName: string;
    guestPhone: string;
  };

  type BookingPage = {
    data: Booking[];
    meta: { total: number; limit: number; offset: number };
  };

  const statusOptions = [
    { value: "", label: "Any state" },
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "checked_in", label: "Checked in" },
    { value: "checked_out", label: "Checked out" },
    { value: "cancelled", label: "Cancelled" },
    { value: "no_show", label: "No show" },
  ];

  let bookings = $state<Booking[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // The search is kept in the URL, so a link can point at a search.
  let q = $state(page.url.searchParams.get("q") ?? "");
  let status = $state(page.url.searchParams.get("status") ?? "");

  /** Read the bookings. */
  async function load() {
    const propertyId = workspace.currentId;
    if (propertyId === null) {
      bookings = [];
      return;
    }
    loading = true;
    error = null;
    try {
      const result = await api.get<BookingPage>(
        `/properties/${propertyId}/bookings`,
        {
          query: {
            q: q.trim() || undefined,
            status: status || undefined,
            limit: 50,
            offset: 0,
          },
        },
      );
      bookings = result.data;
      total = result.meta.total;
    } catch (err) {
      error =
        err instanceof ApiError
          ? err.message
          : "The bookings could not be loaded.";
      bookings = [];
    } finally {
      loading = false;
    }
  }

  /** Run the search, and remember it in the address bar. */
  async function search(event?: SubmitEvent) {
    event?.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    const query = params.toString();
    await goto(`/bookings${query ? `?${query}` : ""}`, {
      replaceState: true,
      keepFocus: true,
    });
    await load();
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

  /** What may be done to a booking from here. */
  function nextActions(booking: Booking): { label: string; action: string }[] {
    switch (booking.status) {
      case "pending":
        return [{ label: "Confirm", action: "confirm" }];
      case "confirmed":
        return [{ label: "Check in", action: "check-in" }];
      case "checked_in":
        return [{ label: "Check out", action: "check-out" }];
      default:
        return [];
    }
  }

  async function transition(booking: Booking, action: string) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      await api.post(
        `/properties/${propertyId}/bookings/${booking.id}/${action}`,
      );
      toast.success(
        `${booking.reference} — ${action.replace("-", " ")}`,
        "The booking has been updated.",
      );
      await load();
    } catch (err) {
      toast.error(
        "That could not be done",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }
</script>

<PageHeader
  title="Bookings"
  description={total > 0
    ? `${total} booking${total === 1 ? "" : "s"} found.`
    : "The reservations of this property."}
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
        placeholder="Reference, name or phone"
        aria-label="Search"
      />
    </div>
    <div class="sm:w-48">
      <Select bind:value={status} options={statusOptions} />
    </div>
    <Button type="submit" {loading}>Search</Button>
    {#if q || status}
      <Button
        variant="ghost"
        onclick={() => {
          q = "";
          status = "";
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
  {:else if loading && bookings.length === 0}
    <div class="panel p-6 text-center text-sm text-ink-muted">
      Loading the bookings…
    </div>
  {:else if bookings.length === 0}
    <div class="panel">
      <Empty
        title="No bookings"
        description={q || status
          ? "Nothing matches that search."
          : "There are no bookings in this property yet."}
      />
    </div>
  {:else}
    <Card padded={false}>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead class="border-b border-line bg-surface-muted">
            <tr class="text-left">
              <th class="px-4 py-2.5 font-medium text-ink-700">Reference</th>
              <th class="px-4 py-2.5 font-medium text-ink-700">Guest</th>
              <th class="px-4 py-2.5 font-medium text-ink-700">Room</th>
              <th class="px-4 py-2.5 font-medium text-ink-700">Stay</th>
              <th
                class="px-4 py-2.5 text-right font-medium text-ink-700"
                data-numeric
              >
                Total
              </th>
              <th class="px-4 py-2.5 font-medium text-ink-700">State</th>
              <th class="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            {#each bookings as booking (booking.id)}
              <tr class="hover:bg-surface-muted">
                <td class="px-4 py-3">
                  <span class="font-medium text-ink">{booking.reference}</span>
                  <span class="mt-0.5 block text-xs text-ink-muted">
                    {booking.source.replace(/_/g, " ")}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span class="text-ink">{booking.guestName}</span>
                  <span class="mt-0.5 block text-xs text-ink-muted">
                    {booking.guestPhone}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span class="text-ink">{booking.roomNumber}</span>
                  <span class="mt-0.5 block text-xs text-ink-muted">
                    {booking.roomType}
                  </span>
                </td>
                <td class="px-4 py-3 text-xs text-ink-muted">
                  {formatDate(booking.checkInDate)}
                  <span class="mx-1">→</span>
                  {formatDate(booking.checkOutDate)}
                </td>
                <td
                  class="px-4 py-3 text-right font-medium text-ink tabular-nums"
                  data-numeric
                >
                  {formatMoney(booking.totalCostCents)}
                </td>
                <td class="px-4 py-3">
                  <Badge tone={bookingTone(booking.status)}>
                    {bookingLabel(booking.status)}
                  </Badge>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end gap-1.5">
                    {#each nextActions(booking) as action (action.action)}
                      <Button
                        size="sm"
                        variant="secondary"
                        onclick={() => transition(booking, action.action)}
                      >
                        {action.label}
                      </Button>
                    {/each}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  {/if}
{/if}
