<!--
  src/routes/rooms/+page.svelte
  The rooms of the property and the room types they belong to.

  Manage rooms, room types, housekeeping status transitions, and inventory.
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
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import { toast } from "$lib/components/ui/toast.svelte";
  import {
    centsToShillings,
    formatMoney,
    roomLabel,
    roomTone,
    shillingsToCents,
  } from "$lib/ui/status";
  import { createDraft } from "$lib/utils/draft";
  import {
    Plus,
    Pencil,
    BedDouble,
    Trash2,
    Check,
    Layers,
    DollarSign,
  } from "lucide-svelte";

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

  type RoomDraft = {
    step: number;
    roomTypeId: string;
    roomNumber: string;
    floor: string;
    status: string;
    description: string;
  };

  const roomDraft = createDraft<RoomDraft>("room-new");

  const statusOptions = [
    { value: "", label: "Any state" },
    { value: "available", label: "Available" },
    { value: "occupied", label: "Occupied" },
    { value: "dirty", label: "Needs cleaning" },
    { value: "maintenance", label: "In maintenance" },
    { value: "out_of_order", label: "Out of order" },
  ];

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

  // Add Room Modal state (Multi-step)
  let addingRoom = $state(false);
  let roomStep = $state(1);
  let hasRestoredRoomDraft = $state(false);
  let roomBusy = $state(false);
  let roomErrors = $state<Record<string, string>>({});

  let roomForm = $state<RoomDraft>({
    step: 1,
    roomTypeId: "",
    roomNumber: "",
    floor: "",
    status: "available",
    description: "",
  });

  // Edit Room Modal state
  let editingRoom = $state<Room | null>(null);
  let editRoomForm = $state({
    roomNumber: "",
    floor: "",
    roomTypeId: "",
    description: "",
    isActive: true,
  });
  let editRoomBusy = $state(false);
  let editRoomErrors = $state<Record<string, string>>({});

  // Room Type Modal state
  let addingRoomType = $state(false);
  let editingRoomType = $state<RoomType | null>(null);
  let roomTypeForm = $state({
    name: "",
    description: "",
    pricePerNightShillings: 5000,
    pricePerHourShillings: 1000,
    maxOccupancy: 2,
    bedConfiguration: "",
    isActive: true,
  });
  let roomTypeBusy = $state(false);
  let roomTypeErrors = $state<Record<string, string>>({});

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
        "Could not update status",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  // --- Add Room Multi-step ---
  function openAddRoomModal() {
    const saved = roomDraft.load();
    if (saved) {
      roomForm = saved;
      roomStep = saved.step || 1;
      hasRestoredRoomDraft = true;
    } else {
      roomForm = {
        step: 1,
        roomTypeId: roomTypes[0] ? String(roomTypes[0].id) : "",
        roomNumber: "",
        floor: "Ground Floor",
        status: "available",
        description: "",
      };
      roomStep = 1;
      hasRestoredRoomDraft = false;
    }
    roomErrors = {};
    addingRoom = true;
  }

  function saveRoomProgress() {
    roomDraft.save({
      ...roomForm,
      step: roomStep,
    });
  }

  function discardRoomDraft() {
    roomDraft.clear();
    hasRestoredRoomDraft = false;
    roomForm = {
      step: 1,
      roomTypeId: roomTypes[0] ? String(roomTypes[0].id) : "",
      roomNumber: "",
      floor: "Ground Floor",
      status: "available",
      description: "",
    };
    roomStep = 1;
  }

  function validateRoomStep1(): boolean {
    const errs: Record<string, string> = {};
    const roomTypeId = Number(roomForm.roomTypeId);
    if (!Number.isSafeInteger(roomTypeId) || roomTypeId < 1) {
      errs.roomTypeId = "Please select a room type";
    }
    if (!roomForm.roomNumber.trim())
      errs.roomNumber = "Room number is required";
    roomErrors = errs;
    return Object.keys(errs).length === 0;
  }

  function nextRoomStep() {
    if (roomStep === 1) {
      if (!validateRoomStep1()) return;
      roomStep = 2;
      saveRoomProgress();
    }
  }

  function prevRoomStep() {
    roomStep = Math.max(1, roomStep - 1);
    saveRoomProgress();
  }

  async function submitCreateRoom() {
    if (!validateRoomStep1()) return;
    const propertyId = workspace.currentId;
    if (propertyId === null || !roomForm.roomTypeId) return;

    roomBusy = true;
    try {
      await api.post(`/properties/${propertyId}/rooms`, {
        roomTypeId: Number(roomForm.roomTypeId),
        roomNumber: roomForm.roomNumber.trim(),
        floor: roomForm.floor.trim() || undefined,
        description: roomForm.description.trim() || undefined,
        status: roomForm.status,
        isActive: true,
      });

      roomDraft.clear();
      toast.success("Room created", `Room ${roomForm.roomNumber} is ready.`);
      addingRoom = false;
      await load();
    } catch (err) {
      toast.error(
        "Could not create room",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      roomBusy = false;
    }
  }

  // --- Edit Room ---
  function openEditRoom(r: Room) {
    editingRoom = r;
    editRoomForm = {
      roomNumber: r.roomNumber,
      floor: r.floor ?? "",
      roomTypeId: String(r.roomTypeId),
      description: r.description ?? "",
      isActive: r.isActive,
    };
    editRoomErrors = {};
  }

  function closeEditRoom() {
    editingRoom = null;
    editRoomErrors = {};
  }

  async function submitEditRoom() {
    if (!editingRoom) return;
    const propertyId = workspace.currentId;
    if (propertyId === null) return;

    const roomTypeId = Number(editRoomForm.roomTypeId);
    if (
      !editRoomForm.roomNumber.trim() ||
      !Number.isSafeInteger(roomTypeId) ||
      roomTypeId < 1
    ) {
      editRoomErrors = {
        ...(!editRoomForm.roomNumber.trim()
          ? { roomNumber: "Room number is required" }
          : {}),
        ...(!Number.isSafeInteger(roomTypeId) || roomTypeId < 1
          ? { roomTypeId: "Please select a room type" }
          : {}),
      };
      return;
    }

    editRoomBusy = true;
    try {
      await api.patch(`/properties/${propertyId}/rooms/${editingRoom.id}`, {
        roomNumber: editRoomForm.roomNumber.trim(),
        floor: editRoomForm.floor.trim() || null,
        roomTypeId,
        description: editRoomForm.description.trim() || null,
        isActive: editRoomForm.isActive,
      });

      toast.success("Room updated", `Room ${editRoomForm.roomNumber} saved.`);
      closeEditRoom();
      await load();
    } catch (err) {
      toast.error(
        "Could not update room",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      editRoomBusy = false;
    }
  }

  async function deleteRoom(room: Room) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    if (!window.confirm(`Delete room ${room.roomNumber}?`)) return;
    try {
      await api.delete(`/properties/${propertyId}/rooms/${room.id}`);
      toast.success(`Room ${room.roomNumber} deleted`);
      await load();
    } catch (err) {
      toast.error(
        "Could not delete room",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  // --- Room Type Modal ---
  function openAddRoomType() {
    editingRoomType = null;
    roomTypeForm = {
      name: "",
      description: "",
      pricePerNightShillings: 5000,
      pricePerHourShillings: 1000,
      maxOccupancy: 2,
      bedConfiguration: "1 King Bed",
      isActive: true,
    };
    roomTypeErrors = {};
    addingRoomType = true;
  }

  function openEditRoomType(type: RoomType) {
    editingRoomType = type;
    roomTypeForm = {
      name: type.name,
      description: type.description ?? "",
      pricePerNightShillings: centsToShillings(type.pricePerNightCents),
      pricePerHourShillings: centsToShillings(type.pricePerHourCents ?? 0),
      maxOccupancy: type.maxOccupancy,
      bedConfiguration: type.bedConfiguration ?? "",
      isActive: type.isActive,
    };
    roomTypeErrors = {};
    addingRoomType = true;
  }

  function closeRoomTypeForm() {
    addingRoomType = false;
    editingRoomType = null;
    roomTypeErrors = {};
  }

  async function submitRoomType() {
    const pricePerHourShillings = roomTypeForm.pricePerHourShillings ?? 0;
    const pricePerNightCents = shillingsToCents(
      roomTypeForm.pricePerNightShillings,
    );
    const pricePerHourCents = shillingsToCents(pricePerHourShillings);
    const maxOccupancy = roomTypeForm.maxOccupancy ?? 2;
    const errors: Record<string, string> = {};
    if (!roomTypeForm.name.trim()) errors.name = "Name is required";
    if (
      !Number.isFinite(roomTypeForm.pricePerNightShillings) ||
      pricePerNightCents < 0 ||
      pricePerNightCents > 100_000_000
    ) {
      errors.pricePerNight = "Enter a valid nightly price";
    }
    if (
      !Number.isFinite(pricePerHourShillings) ||
      pricePerHourCents < 0 ||
      pricePerHourCents > 100_000_000
    ) {
      errors.pricePerHour = "Enter a valid hourly price";
    }
    if (
      !Number.isInteger(maxOccupancy) ||
      maxOccupancy < 1 ||
      maxOccupancy > 20
    ) {
      errors.maxOccupancy = "Occupancy must be between 1 and 20";
    }
    if (Object.keys(errors).length > 0) {
      roomTypeErrors = errors;
      return;
    }
    const propertyId = workspace.currentId;
    if (propertyId === null) return;

    roomTypeBusy = true;
    try {
      const payload = {
        name: roomTypeForm.name.trim(),
        description:
          roomTypeForm.description.trim() ||
          (editingRoomType ? null : undefined),
        pricePerNightCents,
        pricePerHourCents:
          pricePerHourCents > 0
            ? pricePerHourCents
            : editingRoomType
              ? null
              : undefined,
        maxOccupancy,
        bedConfiguration:
          roomTypeForm.bedConfiguration.trim() ||
          (editingRoomType ? null : undefined),
        isActive: roomTypeForm.isActive,
      };

      if (editingRoomType) {
        await api.patch(
          `/properties/${propertyId}/room-types/${editingRoomType.id}`,
          payload,
        );
        toast.success("Room type updated");
      } else {
        await api.post(`/properties/${propertyId}/room-types`, payload);
        toast.success("Room type created");
      }
      closeRoomTypeForm();
      await load();
    } catch (err) {
      toast.error(
        "Could not save room type",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      roomTypeBusy = false;
    }
  }

  async function deleteRoomType(type: RoomType) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    if (!window.confirm(`Delete room type "${type.name}"?`)) return;
    try {
      await api.delete(`/properties/${propertyId}/room-types/${type.id}`);
      toast.success("Room type deleted", type.name);
      await load();
    } catch (err) {
      toast.error(
        "Could not delete room type",
        err instanceof ApiError ? err.message : "Please try again.",
      );
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
    if (id !== null && session.isSignedIn) void load();
  });

  const typeName = (id: number) =>
    roomTypes.find((t) => t.id === id)?.name ?? "Room";
</script>

<PageHeader
  title="Rooms & Room Types"
  description="Manage physical rooms, room categories, pricing, and housekeeping readiness."
/>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else}
  <!-- Action bar -->
  <div
    class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="flex items-center gap-2">
      <div class="sm:w-56">
        <Select bind:value={status} options={statusOptions} />
      </div>
      <span class="text-xs text-ink-muted">
        {rooms.length} room{rooms.length === 1 ? "" : "s"}
      </span>
    </div>

    <div class="flex gap-2">
      <Button variant="secondary" onclick={openAddRoomType}>
        <Plus class="size-4 mr-1.5" />
        New Room Type
      </Button>
      <Button onclick={openAddRoomModal}>
        <Plus class="size-4 mr-1.5" />
        New Room
      </Button>
    </div>
  </div>

  {#if error}
    <div class="panel p-6">
      <p class="text-sm text-error">{error}</p>
    </div>
  {:else if loading && rooms.length === 0}
    <div class="panel p-6 text-center text-sm text-ink-muted">
      Loading rooms…
    </div>
  {:else if rooms.length === 0}
    <div class="panel">
      <Empty
        title="No rooms found"
        description={status
          ? "No rooms match that status filter."
          : "Get started by adding your first room type and room."}
      />
    </div>
  {:else}
    <!-- Rooms Grid -->
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {#each rooms as room (room.id)}
        <div class="panel p-4 flex flex-col justify-between">
          <div>
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-base font-semibold text-ink">
                    Room {room.roomNumber}
                  </p>
                  <button
                    type="button"
                    class="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-muted cursor-pointer"
                    onclick={() => openEditRoom(room)}
                    title="Edit room"
                  >
                    <Pencil class="size-3" />
                  </button>
                  <button
                    type="button"
                    class="p-1 rounded text-ink-muted hover:text-error hover:bg-surface-muted cursor-pointer"
                    onclick={() => deleteRoom(room)}
                    title="Delete room"
                    aria-label={`Delete room ${room.roomNumber}`}
                  >
                    <Trash2 class="size-3" />
                  </button>
                </div>
                <p class="mt-0.5 truncate text-xs text-ink-muted">
                  {typeName(room.roomTypeId)}
                  {#if room.floor}
                    · {room.floor}
                  {/if}
                </p>
              </div>
              <Badge tone={roomTone(room.status)}>
                {roomLabel(room.status)}
              </Badge>
            </div>
            {#if room.description}
              <p class="mt-2 text-xs text-ink-muted line-clamp-2">
                {room.description}
              </p>
            {/if}
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

  <!-- Room Types Section -->
  {#if roomTypes.length > 0}
    <div class="mt-8">
      <Card
        title="Room Types"
        description="The pricing and bed configurations sold to guests."
      >
        {#snippet actions()}
          <Button size="sm" onclick={openAddRoomType}>
            <Plus class="size-3.5 mr-1" />
            Add Type
          </Button>
        {/snippet}

        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <thead class="border-b border-line bg-surface-muted">
              <tr class="text-left">
                <th class="px-4 py-2.5 font-medium text-ink-700"
                  >Category Name</th
                >
                <th class="px-4 py-2.5 font-medium text-ink-700">Bed Setup</th>
                <th class="px-4 py-2.5 font-medium text-ink-700">Sleeps</th>
                <th
                  class="px-4 py-2.5 text-right font-medium text-ink-700"
                  data-numeric
                >
                  Per Night
                </th>
                <th
                  class="px-4 py-2.5 text-right font-medium text-ink-700"
                  data-numeric
                >
                  Per Hour
                </th>
                <th class="px-4 py-2.5 text-right font-medium text-ink-700"
                  >Actions</th
                >
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              {#each roomTypes as type (type.id)}
                <tr class="hover:bg-surface-muted transition-colors">
                  <td class="px-4 py-3">
                    <span class="font-medium text-ink">{type.name}</span>
                    {#if type.description}
                      <span
                        class="mt-0.5 block text-xs text-ink-muted truncate max-w-xs"
                      >
                        {type.description}
                      </span>
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-ink-muted"
                    >{type.bedConfiguration ?? "—"}</td
                  >
                  <td class="px-4 py-3 text-ink-muted tabular-nums"
                    >{type.maxOccupancy}</td
                  >
                  <td
                    class="px-4 py-3 text-right font-medium text-ink tabular-nums"
                    data-numeric
                  >
                    {formatMoney(type.pricePerNightCents)}
                  </td>
                  <td
                    class="px-4 py-3 text-right text-ink-muted tabular-nums"
                    data-numeric
                  >
                    {type.pricePerHourCents
                      ? formatMoney(type.pricePerHourCents)
                      : "—"}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onclick={() => openEditRoomType(type)}
                      title="Edit room category"
                    >
                      <Pencil class="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onclick={() => deleteRoomType(type)}
                      title="Delete room type"
                      aria-label={`Delete room type ${type.name}`}
                    >
                      <Trash2 class="size-3.5 text-error" />
                    </Button>
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

<!-- Multi-Step Add Room Modal -->
<Modal
  title="Add New Room"
  open={addingRoom}
  onclose={() => (addingRoom = false)}
  totalSteps={2}
  currentStep={roomStep}
  width="max-w-md"
>
  {#if hasRestoredRoomDraft}
    <div
      class="mb-4 flex items-center justify-between rounded-lg bg-surface-muted p-2.5 text-xs border border-line"
    >
      <span class="text-ink-muted">Restored your unsaved room progress.</span>
      <button
        type="button"
        class="text-error font-medium hover:underline cursor-pointer"
        onclick={discardRoomDraft}
      >
        Discard
      </button>
    </div>
  {/if}

  {#if roomStep === 1}
    <div class="space-y-3">
      <p class="text-xs text-ink-muted">
        Step 1: Room Identification & Category
      </p>

      <Field label="Room Category" error={roomErrors.roomTypeId} required>
        {#snippet children({ id, describedBy, invalid })}
          <Select
            {id}
            {describedBy}
            required
            error={invalid ? roomErrors.roomTypeId : null}
            bind:value={roomForm.roomTypeId}
            options={[
              { value: "", label: "Select a category…" },
              ...roomTypes.map((t) => ({ value: String(t.id), label: t.name })),
            ]}
            onchange={saveRoomProgress}
          />
        {/snippet}
      </Field>

      <Field label="Room Number" error={roomErrors.roomNumber} required>
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            required
            bind:value={roomForm.roomNumber}
            placeholder="e.g. 101, 204B"
            error={invalid ? roomErrors.roomNumber : null}
            oninput={saveRoomProgress}
          />
        {/snippet}
      </Field>

      <Field label="Floor / Location">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            bind:value={roomForm.floor}
            placeholder="Ground Floor, Wing A…"
            oninput={saveRoomProgress}
          />
        {/snippet}
      </Field>
    </div>
  {:else if roomStep === 2}
    <div class="space-y-3">
      <p class="text-xs text-ink-muted">Step 2: Readiness Status & Details</p>

      <Field label="Initial Physical Status">
        {#snippet children({ id, describedBy })}
          <Select
            {id}
            {describedBy}
            bind:value={roomForm.status}
            options={[
              { value: "available", label: "Clean & Available" },
              { value: "dirty", label: "Needs cleaning" },
              { value: "maintenance", label: "Under maintenance" },
              { value: "out_of_order", label: "Out of order" },
            ]}
            onchange={saveRoomProgress}
          />
        {/snippet}
      </Field>

      <Field label="Room Description">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            bind:value={roomForm.description}
            placeholder="Garden view, balcony, corner room…"
            oninput={saveRoomProgress}
          />
        {/snippet}
      </Field>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex items-center justify-between">
      {#if roomStep > 1}
        <Button variant="secondary" onclick={prevRoomStep} disabled={roomBusy}>
          Back
        </Button>
      {:else}
        <div></div>
      {/if}

      <div class="flex gap-2">
        <Button
          variant="secondary"
          onclick={() => (addingRoom = false)}
          disabled={roomBusy}
        >
          Cancel
        </Button>
        {#if roomStep < 2}
          <Button onclick={nextRoomStep}>Next Step</Button>
        {:else}
          <Button
            onclick={submitCreateRoom}
            loading={roomBusy}
            disabled={roomBusy}
          >
            Add Room
          </Button>
        {/if}
      </div>
    </div>
  {/snippet}
</Modal>

<!-- Edit Room Modal -->
<Modal
  title={`Edit Room ${editingRoom?.roomNumber ?? ""}`}
  open={editingRoom !== null}
  onclose={closeEditRoom}
  width="max-w-md"
>
  {#if editingRoom}
    <div class="space-y-3">
      <Field label="Room Number" error={editRoomErrors.roomNumber} required>
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            required
            bind:value={editRoomForm.roomNumber}
            error={invalid ? editRoomErrors.roomNumber : null}
          />
        {/snippet}
      </Field>

      <Field label="Room Category" error={editRoomErrors.roomTypeId} required>
        {#snippet children({ id, describedBy, invalid })}
          <Select
            {id}
            {describedBy}
            required
            error={invalid ? editRoomErrors.roomTypeId : null}
            bind:value={editRoomForm.roomTypeId}
            options={roomTypes.map((t) => ({
              value: String(t.id),
              label: t.name,
            }))}
          />
        {/snippet}
      </Field>

      <Field label="Floor / Location">
        {#snippet children({ id, describedBy })}
          <Input {id} {describedBy} bind:value={editRoomForm.floor} />
        {/snippet}
      </Field>

      <Field label="Description">
        {#snippet children({ id, describedBy })}
          <Input {id} {describedBy} bind:value={editRoomForm.description} />
        {/snippet}
      </Field>

      <div class="flex items-center gap-2 pt-1">
        <label class="flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            bind:checked={editRoomForm.isActive}
            class="size-4 rounded border-line text-ink focus:ring-ink"
          />
          <span>Room is active in inventory</span>
        </label>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={closeEditRoom}
        disabled={editRoomBusy}
      >
        Cancel
      </Button>
      <Button
        onclick={submitEditRoom}
        loading={editRoomBusy}
        disabled={editRoomBusy}
      >
        Save Changes
      </Button>
    </div>
  {/snippet}
</Modal>

<!-- Room Type Modal (Add & Edit) -->
<Modal
  title={editingRoomType ? "Edit Room Category" : "New Room Category"}
  open={addingRoomType}
  onclose={closeRoomTypeForm}
  width="max-w-lg"
>
  <div class="grid gap-3 sm:grid-cols-2">
    <div class="sm:col-span-2">
      <Field label="Category Name" error={roomTypeErrors.name} required>
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            bind:value={roomTypeForm.name}
            placeholder="e.g. Deluxe Suite"
            error={invalid ? roomTypeErrors.name : null}
          />
        {/snippet}
      </Field>
    </div>

    <Field
      label="Price per Night (KES)"
      hint="Enter the nightly price in shillings."
      error={roomTypeErrors.pricePerNight}
      required
    >
      {#snippet children({ id, describedBy, invalid })}
        <Input
          {id}
          {describedBy}
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          required
          bind:value={roomTypeForm.pricePerNightShillings}
          error={invalid ? roomTypeErrors.pricePerNight : null}
        />
      {/snippet}
    </Field>

    <Field
      label="Price per Hour (KES)"
      hint="Optional (e.g. day use). Enter the price in shillings."
      error={roomTypeErrors.pricePerHour}
    >
      {#snippet children({ id, describedBy, invalid })}
        <Input
          {id}
          {describedBy}
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          bind:value={roomTypeForm.pricePerHourShillings}
          error={invalid ? roomTypeErrors.pricePerHour : null}
        />
      {/snippet}
    </Field>

    <Field label="Max Occupancy (Guests)" error={roomTypeErrors.maxOccupancy}>
      {#snippet children({ id, describedBy, invalid })}
        <Input
          {id}
          {describedBy}
          type="number"
          min="1"
          max="20"
          bind:value={roomTypeForm.maxOccupancy}
          error={invalid ? roomTypeErrors.maxOccupancy : null}
        />
      {/snippet}
    </Field>

    <Field label="Bed Setup">
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          {describedBy}
          bind:value={roomTypeForm.bedConfiguration}
          placeholder="1 King Bed"
        />
      {/snippet}
    </Field>

    <div class="sm:col-span-2">
      <Field label="Description">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            bind:value={roomTypeForm.description}
            placeholder="Spacious suite with garden view, private terrace…"
          />
        {/snippet}
      </Field>
    </div>
  </div>

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={closeRoomTypeForm}
        disabled={roomTypeBusy}
      >
        Cancel
      </Button>
      <Button
        onclick={submitRoomType}
        loading={roomTypeBusy}
        disabled={roomTypeBusy}
      >
        {editingRoomType ? "Save Changes" : "Create Category"}
      </Button>
    </div>
  {/snippet}
</Modal>
