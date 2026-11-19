<!--
  src/routes/rooms/+page.svelte
  The rooms of the property and the room types they belong to.

  Housekeeping can change the physical state of a room here: clean, out
  of order, back in service.
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
  import Select from "$lib/components/ui/Select.svelte";
  import { toast } from "$lib/components/ui/toast.svelte";
  import { formatMoney, roomLabel, roomTone } from "$lib/ui/status";

  type Room = {
    id: number;
    roomNumber: string;
    floor: string | null;
    description: string | null;
    status: string;
    isActive: boolean;
    roomTypeId: number;
  };

  type RoomType = {
    id: number;
    name: string;
    description: string | null;
    pricePerNightCents: number;
    pricePerHourCents: number | null;
    maxOccupancy: number;
    bedConfiguration: string | null;
    isActive: boolean;
  };

  const statusOptions = [
    { value: "", label: "Any state" },
    { value: "available", label: "Available" },
    { value: "occupied", label: "Occupied" },
    { value: "dirty", label: "Needs cleaning" },
    { value: "maintenance", label: "In maintenance" },
    { value: "out_of_order", label: "Out of order" },
  ];

  /** What housekeeping may set a room to, from its current state. */
  const nextStates: Record<string, { value: string; label: string }[]> = {
    dirty: [
      { value: "available", label: "Clean" },
      { value: "maintenance", label: "Maintenance" },
      { value: "out_of_order", label: "Out of order" },
    ],
    maintenance: [
      { value: "available", label: "Back in service" },
      { value: "out_of_order", label: "Out of order" },
    ],
    out_of_order: [
      { value: "available", label: "Back in service" },
      { value: "maintenance", label: "Maintenance" },
    ],
    available: [{ value: "dirty", label: "Needs cleaning" }],
    occupied: [{ value: "dirty", label: "Needs cleaning" }],
  };

  let rooms = $state<Room[]>([]);
  let roomTypes = $state<RoomType[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let status = $state("");

  async function load() {
    const propertyId = workspace.currentId;
    if (propertyId === null) {
      rooms = [];
      roomTypes = [];
      return;
    }
    loading = true;
    error = null;
    try {
      const [roomResult, typeResult] = await Promise.all([
        api.get<{ data: Room[] }>(`/properties/${propertyId}/rooms`, {
          query: { status: status || undefined },
        }),
        api.get<{ data: RoomType[] }>(`/properties/${propertyId}/room-types`),
      ]);
      rooms = roomResult.data;
      roomTypes = typeResult.data;
    } catch (err) {
      error =
        err instanceof ApiError
          ? err.message
          : "The rooms could not be loaded.";
      rooms = [];
      roomTypes = [];
    } finally {
      loading = false;
    }
  }

  /** Change the physical state of a room. */
  async function setStatus(room: Room, next: string) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      await api.patch(`/properties/${propertyId}/rooms/${room.id}/status`, {
        status: next,
      });
      toast.success(
        `Room ${room.roomNumber}`,
        `It is now ${roomLabel(next).toLowerCase()}.`,
      );
      await load();
    } catch (err) {
      toast.error(
        "The room could not be changed",
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

  const typeName = (id: number) =>
    roomTypes.find((t) => t.id === id)?.name ?? "—";
</script>

<PageHeader
  title="Rooms"
  description="The inventory of the property and the state of every room."
/>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else}
  <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
    <div class="sm:w-56">
      <Select bind:value={status} options={statusOptions} />
    </div>
    <span class="text-xs text-ink-muted">
      {rooms.length} room{rooms.length === 1 ? "" : "s"}
    </span>
  </div>

  {#if error}
    <div class="panel p-6">
      <p class="text-sm text-error">{error}</p>
    </div>
  {:else if loading && rooms.length === 0}
    <div class="panel p-6 text-center text-sm text-ink-muted">
      Loading the rooms…
    </div>
  {:else if rooms.length === 0}
    <div class="panel">
      <Empty title="No rooms" description="No room matches that filter." />
    </div>
  {:else}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {#each rooms as room (room.id)}
        <div class="panel p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-base font-semibold text-ink">{room.roomNumber}</p>
              <p class="mt-0.5 truncate text-xs text-ink-muted">
                {typeName(room.roomTypeId)}
                {#if room.floor}
                  · Floor {room.floor}{/if}
              </p>
            </div>
            <Badge tone={roomTone(room.status)}>
              {roomLabel(room.status)}
            </Badge>
          </div>

          {#if nextStates[room.status]?.length}
            <div class="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {#each nextStates[room.status] as next (next.value)}
                <Button
                  size="sm"
                  variant="secondary"
                  onclick={() => setStatus(room, next.value)}
                >
                  {next.label}
                </Button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if roomTypes.length > 0}
    <div class="mt-6">
      <Card title="Room types" description="What is sold, and at what price.">
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <thead class="border-b border-line">
              <tr class="text-left">
                <th class="py-2 pr-4 font-medium text-ink-700">Name</th>
                <th class="py-2 pr-4 font-medium text-ink-700">Beds</th>
                <th class="py-2 pr-4 font-medium text-ink-700">Sleeps</th>
                <th
                  class="py-2 pr-4 text-right font-medium text-ink-700"
                  data-numeric
                >
                  Per night
                </th>
                <th
                  class="py-2 text-right font-medium text-ink-700"
                  data-numeric
                >
                  Per hour
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              {#each roomTypes as type (type.id)}
                <tr>
                  <td class="py-2.5 pr-4 font-medium text-ink">{type.name}</td>
                  <td class="py-2.5 pr-4 text-ink-muted">
                    {type.bedConfiguration ?? "—"}
                  </td>
                  <td class="py-2.5 pr-4 text-ink-muted tabular-nums">
                    {type.maxOccupancy}
                  </td>
                  <td
                    class="py-2.5 pr-4 text-right font-medium text-ink tabular-nums"
                    data-numeric
                  >
                    {formatMoney(type.pricePerNightCents)}
                  </td>
                  <td
                    class="py-2.5 text-right text-ink-muted tabular-nums"
                    data-numeric
                  >
                    {type.pricePerHourCents
                      ? formatMoney(type.pricePerHourCents)
                      : "—"}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  {/if}
{/if}
