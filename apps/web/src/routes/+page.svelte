<!--
  src/routes/+page.svelte
  Today: what is happening in the property right now.

  Arrivals, departures, the people in house, and the rooms that need
  the attention of housekeeping. This is the screen the desk keeps
  open.
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
  import Card from "$lib/components/ui/Card.svelte";
  import Empty from "$lib/components/ui/Empty.svelte";
  import {
    bookingLabel,
    bookingTone,
    formatDate,
    roomLabel,
    roomTone,
  } from "$lib/ui/status";

  type Stay = {
    id: number;
    reference: string;
    status: string;
    checkInDate: string;
    checkOutDate: string;
    adults?: number;
    children?: number;
    roomId: number;
    roomNumber: string;
  };

  type Today = {
    date: string;
    arrivals: Stay[];
    departures: Stay[];
    inHouse: Stay[];
    dirtyRooms: {
      id: number;
      roomNumber: string;
      floor: string | null;
      status: string;
    }[];
    counts: {
      arrivals: number;
      departures: number;
      inHouse: number;
      dirtyRooms: number;
      pendingProofs: number;
      totalRooms: number;
      occupancy: number;
    };
  };

  let today = $state<Today | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  /** Read the day. It is re-read whenever the property changes. */
  async function load() {
    const propertyId = workspace.currentId;
    if (propertyId === null) {
      today = null;
      return;
    }
    loading = true;
    error = null;
    try {
      today = await api.get<Today>(`/properties/${propertyId}/today`);
    } catch (err) {
      error =
        err instanceof ApiError
          ? err.message
          : "The day's bookings could not be loaded.";
      today = null;
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    // Without a session there is nothing to show.
    if (!session.loading && !session.isSignedIn) {
      await goto("/login", { replaceState: true });
      return;
    }
    // The list of properties decides what is shown; the effect below
    // reads the page's own data as soon as one is chosen.
    await workspace.load();
  });

  // The day is re-read whenever another property is chosen.
  $effect(() => {
    const id = workspace.currentId;
    if (id !== null && session.isSignedIn) {
      void load();
    }
  });

  /** A number that reads well: a count, or a percentage. */
  const percent = (value: number) => `${Math.round(value * 100)}%`;
</script>

<PageHeader
  title="Today"
  description={today
    ? new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date(today.date))
    : "What is happening in the property right now."}
/>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else if loading && !today}
  <div class="panel p-6 text-center text-sm text-ink-muted">
    Loading the day…
  </div>
{:else if error}
  <div class="panel p-6">
    <p class="text-sm text-error">{error}</p>
  </div>
{:else if today}
  <!-- The numbers, first. -->
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <div class="panel p-4">
      <p class="text-xs font-medium text-ink-muted">Arrivals</p>
      <p class="mt-1.5 text-2xl font-semibold tabular-nums text-ink">
        {today.counts.arrivals}
      </p>
    </div>
    <div class="panel p-4">
      <p class="text-xs font-medium text-ink-muted">Departures</p>
      <p class="mt-1.5 text-2xl font-semibold tabular-nums text-ink">
        {today.counts.departures}
      </p>
    </div>
    <div class="panel p-4">
      <p class="text-xs font-medium text-ink-muted">In house</p>
      <p class="mt-1.5 text-2xl font-semibold tabular-nums text-ink">
        {today.counts.inHouse}
      </p>
    </div>
    <div class="panel p-4">
      <p class="text-xs font-medium text-ink-muted">Occupancy tonight</p>
      <p class="mt-1.5 text-2xl font-semibold tabular-nums text-ink">
        {percent(today.counts.occupancy)}
      </p>
      <p class="mt-0.5 text-xs text-ink-muted">
        of {today.counts.totalRooms} rooms
      </p>
    </div>
  </div>

  <div class="mt-4 grid gap-4 lg:grid-cols-2">
    <!-- Arrivals -->
    <Card title="Arrivals" description="Who is coming today.">
      {#if today.arrivals.length === 0}
        <Empty
          title="No arrivals"
          description="Nobody is expected to arrive today."
        />
      {:else}
        <ul class="-mx-1 divide-y divide-line">
          {#each today.arrivals as stay (stay.id)}
            <li class="flex items-center gap-3 px-1 py-2.5">
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-100 text-xs font-semibold text-ink-700"
                aria-hidden="true"
              >
                {stay.roomNumber}
              </span>
              <div class="min-w-0 flex-1">
                <a
                  href="/bookings?q={encodeURIComponent(stay.reference)}"
                  class="truncate text-sm font-medium text-ink hover:underline"
                >
                  {stay.reference}
                </a>
                <p class="truncate text-xs text-ink-muted">
                  {stay.adults ?? 0} adult{stay.adults === 1 ? "" : "s"}
                  {#if stay.children}
                    · {stay.children} child{stay.children === 1 ? "" : "ren"}
                  {/if}
                  · until {formatDate(stay.checkOutDate)}
                </p>
              </div>
              <Badge tone={bookingTone(stay.status)}>
                {bookingLabel(stay.status)}
              </Badge>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>

    <!-- Departures -->
    <Card title="Departures" description="Who is leaving today.">
      {#if today.departures.length === 0}
        <Empty title="No departures" description="Nobody is leaving today." />
      {:else}
        <ul class="-mx-1 divide-y divide-line">
          {#each today.departures as stay (stay.id)}
            <li class="flex items-center gap-3 px-1 py-2.5">
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-100 text-xs font-semibold text-ink-700"
                aria-hidden="true"
              >
                {stay.roomNumber}
              </span>
              <div class="min-w-0 flex-1">
                <a
                  href="/bookings?q={encodeURIComponent(stay.reference)}"
                  class="truncate text-sm font-medium text-ink hover:underline"
                >
                  {stay.reference}
                </a>
                <p class="truncate text-xs text-ink-muted">
                  arrived {formatDate(stay.checkInDate)}
                </p>
              </div>
              <Badge tone={bookingTone(stay.status)}>
                {bookingLabel(stay.status)}
              </Badge>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>

    <!-- In house -->
    <Card title="In house" description="The people currently staying.">
      {#if today.inHouse.length === 0}
        <Empty
          title="Nobody in house"
          description="There are no guests checked in right now."
        />
      {:else}
        <ul class="-mx-1 divide-y divide-line">
          {#each today.inHouse as stay (stay.id)}
            <li class="flex items-center gap-3 px-1 py-2.5">
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-100 text-xs font-semibold text-ink-700"
                aria-hidden="true"
              >
                {stay.roomNumber}
              </span>
              <div class="min-w-0 flex-1">
                <a
                  href="/bookings?q={encodeURIComponent(stay.reference)}"
                  class="truncate text-sm font-medium text-ink hover:underline"
                >
                  {stay.reference}
                </a>
                <p class="truncate text-xs text-ink-muted">
                  leaves {formatDate(stay.checkOutDate)}
                </p>
              </div>
              <Badge tone={bookingTone(stay.status)}>
                {bookingLabel(stay.status)}
              </Badge>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>

    <!-- Rooms needing attention -->
    <Card
      title="Rooms needing attention"
      description="Dirty, in maintenance or out of order."
    >
      {#if today.dirtyRooms.length === 0}
        <Empty
          title="Every room is ready"
          description="No room is waiting for housekeeping."
        />
      {:else}
        <ul class="-mx-1 divide-y divide-line">
          {#each today.dirtyRooms as room (room.id)}
            <li class="flex items-center gap-3 px-1 py-2.5">
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-100 text-xs font-semibold text-ink-700"
                aria-hidden="true"
              >
                {room.roomNumber}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-ink">{room.roomNumber}</p>
                <p class="truncate text-xs text-ink-muted">
                  {room.floor ? `Floor ${room.floor}` : "No floor recorded"}
                </p>
              </div>
              <Badge tone={roomTone(room.status)}>
                {roomLabel(room.status)}
              </Badge>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
  </div>

  {#if today.counts.pendingProofs > 0}
    <div class="mt-4">
      <Card title="Payments to review">
        <p class="text-sm text-ink-700">
          {today.counts.pendingProofs}
          {today.counts.pendingProofs === 1
            ? "payment proof is"
            : "payment proofs are"}
          waiting to be checked.
        </p>
        <a
          href="/finance"
          class="mt-2 inline-block text-sm font-medium text-ink underline underline-offset-2"
        >
          Go to the money
        </a>
      </Card>
    </div>
  {/if}
{/if}
