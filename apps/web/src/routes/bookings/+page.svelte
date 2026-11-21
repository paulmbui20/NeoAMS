<!--
  src/routes/bookings/+page.svelte
  The bookings of the property.

  Search by reference, name, or phone; filter by status; create and edit
  bookings with a multi-step draft-persisted modal.
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
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import { toast } from "$lib/components/ui/toast.svelte";
  import {
    bookingLabel,
    bookingTone,
    centsToShillings,
    formatDate,
    formatMoney,
    shillingsToCents,
  } from "$lib/ui/status";
  import { createDraft } from "$lib/utils/draft";
  import {
    Plus,
    Pencil,
    Search,
    CreditCard,
    Check,
    X,
    UserCheck,
    UserPlus,
    Calendar,
    BedDouble,
    RotateCcw,
  } from "lucide-svelte";

  type Booking = {
    id: number;
    reference: string;
    status: string;
    rateType: string;
    checkInDate: string;
    checkOutDate: string;
    totalCostCents: number;
    balanceCents: number;
    depositRequiredCents: number;
    source: string;
    roomId: number;
    roomNumber: string;
    roomType: string;
    guestId: number;
    guestName: string;
    guestPhone: string;
    adults?: number;
    children?: number;
    specialRequests?: string | null;
  };

  type Room = {
    id: number;
    roomNumber: string;
    floor: string | null;
    status: string;
    roomTypeId: number;
    isActive: boolean;
  };

  type RoomType = {
    id: number;
    name: string;
    pricePerNightCents: number;
  };

  type Guest = {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    country: string | null;
  };

  type BookingDraft = {
    step: number;
    guestMode: "existing" | "new";
    selectedGuestId: number | null;
    newGuestFirstName: string;
    newGuestLastName: string;
    newGuestPhone: string;
    newGuestEmail: string;
    newGuestCountry: string;
    roomId: number | null;
    rateType: "nightly" | "hourly";
    checkInDate: string;
    checkOutDate: string;
    adults: number;
    children: number;
    source: string;
    specialRequests: string;
  };

  const bookingDraft = createDraft<BookingDraft>("booking-new");

  const statusOptions = [
    { value: "", label: "Any state" },
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "checked_in", label: "Checked in" },
    { value: "checked_out", label: "Checked out" },
    { value: "cancelled", label: "Cancelled" },
    { value: "no_show", label: "No show" },
  ];

  const sourceOptions = [
    { value: "walk_in", label: "Walk in" },
    { value: "phone", label: "Phone call" },
    { value: "website", label: "Website" },
    { value: "social_media", label: "Social Media" },
    { value: "other", label: "Other" },
  ];

  let bookings = $state<Booking[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Search & filter
  let q = $state(page.url.searchParams.get("q") ?? "");
  let status = $state(page.url.searchParams.get("status") ?? "");

  // Available rooms & guests
  let availableRooms = $state<Room[]>([]);
  let roomTypes = $state<RoomType[]>([]);
  let existingGuests = $state<Guest[]>([]);
  let guestSearchQuery = $state("");
  let searchingGuests = $state(false);

  // Create Booking Modal state
  let addingBooking = $state(false);
  let bookingStep = $state(1);
  let hasRestoredDraft = $state(false);
  let bookingBusy = $state(false);
  let bookingErrors = $state<Record<string, string>>({});

  function getTodayString(offsetDays = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  let bookingForm = $state<BookingDraft>({
    step: 1,
    guestMode: "existing",
    selectedGuestId: null,
    newGuestFirstName: "",
    newGuestLastName: "",
    newGuestPhone: "",
    newGuestEmail: "",
    newGuestCountry: "",
    roomId: null,
    rateType: "nightly",
    checkInDate: getTodayString(0),
    checkOutDate: getTodayString(1),
    adults: 1,
    children: 0,
    source: "other",
    specialRequests: "",
  });

  // Edit Booking Modal state
  let editingBooking = $state<Booking | null>(null);
  let editForm = $state({
    adults: 1,
    children: 0,
    specialRequests: "",
    depositRequiredShillings: 0,
  });
  let editBusy = $state(false);

  // Record Payment Modal state
  let payingBooking = $state<Booking | null>(null);
  let paymentForm = $state({
    type: "payment",
    amountShillings: 0,
    paymentMethod: "mpesa",
    transactionReferenceCode: "",
  });
  let paymentBusy = $state(false);

  async function load() {
    const propertyId = workspace.currentId;
    if (propertyId === null) {
      bookings = [];
      return;
    }
    loading = true;
    error = null;
    try {
      const result = await api.get<{
        data: Booking[];
        meta: { total: number; limit: number; offset: number };
      }>(`/properties/${propertyId}/bookings`, {
        query: {
          q: q.trim() || undefined,
          status: status || undefined,
          limit: 50,
          offset: 0,
        },
      });
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

  async function loadRoomsAndTypes() {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      const [roomsRes, typesRes] = await Promise.all([
        api.get<{ data: Room[] }>(`/properties/${propertyId}/rooms`),
        api.get<{ data: RoomType[] }>(`/properties/${propertyId}/room-types`),
      ]);
      availableRooms = roomsRes.data;
      roomTypes = typesRes.data;
    } catch {
      // Non-fatal if prefetch fails
    }
  }

  async function searchGuests(searchTerm: string) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    searchingGuests = true;
    try {
      const res = await api.get<{ data: Guest[] }>(
        `/properties/${propertyId}/guests`,
        { query: { q: searchTerm.trim() || undefined, limit: 20 } },
      );
      existingGuests = res.data;
    } catch {
      existingGuests = [];
    } finally {
      searchingGuests = false;
    }
  }

  function openCreateBookingModal() {
    void loadRoomsAndTypes();
    void searchGuests("");

    const saved = bookingDraft.load();
    if (saved) {
      bookingForm = {
        ...saved,
        source: sourceOptions.some((option) => option.value === saved.source)
          ? saved.source
          : "other",
      };
      bookingStep = saved.step || 1;
      hasRestoredDraft = true;
    } else {
      bookingForm = {
        step: 1,
        guestMode: "existing",
        selectedGuestId: null,
        newGuestFirstName: "",
        newGuestLastName: "",
        newGuestPhone: "",
        newGuestEmail: "",
        newGuestCountry: "",
        roomId: availableRooms[0]?.id ?? null,
        rateType: "nightly",
        checkInDate: getTodayString(0),
        checkOutDate: getTodayString(1),
        adults: 1,
        children: 0,
        source: "other",
        specialRequests: "",
      };
      bookingStep = 1;
      hasRestoredDraft = false;
    }
    bookingErrors = {};
    addingBooking = true;
  }

  function saveBookingProgress() {
    bookingDraft.save({
      ...bookingForm,
      step: bookingStep,
    });
  }

  function discardBookingDraft() {
    bookingDraft.clear();
    hasRestoredDraft = false;
    bookingForm = {
      step: 1,
      guestMode: "existing",
      selectedGuestId: null,
      newGuestFirstName: "",
      newGuestLastName: "",
      newGuestPhone: "",
      newGuestEmail: "",
      newGuestCountry: "",
      roomId: availableRooms[0]?.id ?? null,
      rateType: "nightly",
      checkInDate: getTodayString(0),
      checkOutDate: getTodayString(1),
      adults: 1,
      children: 0,
      source: "other",
      specialRequests: "",
    };
    bookingStep = 1;
  }

  function validateBookingStep1(): boolean {
    const errs: Record<string, string> = {};
    if (bookingForm.guestMode === "existing") {
      if (!bookingForm.selectedGuestId) {
        errs.selectedGuestId = "Please pick a guest from the directory";
      }
    } else {
      if (!bookingForm.newGuestFirstName.trim()) {
        errs.newGuestFirstName = "First name is required";
      }
      if (!bookingForm.newGuestLastName.trim()) {
        errs.newGuestLastName = "Last name is required";
      }
      if (!bookingForm.newGuestPhone.trim()) {
        errs.newGuestPhone = "Phone number is required";
      }
    }
    bookingErrors = errs;
    return Object.keys(errs).length === 0;
  }

  function validateBookingStep2(): boolean {
    const errs: Record<string, string> = {};
    if (!bookingForm.roomId) {
      errs.roomId = "Please choose a room";
    }
    if (!bookingForm.checkInDate) {
      errs.checkInDate = "Check-in date is required";
    }
    if (!bookingForm.checkOutDate) {
      errs.checkOutDate = "Check-out date is required";
    } else if (bookingForm.checkOutDate <= bookingForm.checkInDate) {
      errs.checkOutDate = "Check-out must be after check-in";
    }
    if (
      !Number.isInteger(bookingForm.adults) ||
      bookingForm.adults < 1 ||
      bookingForm.adults > 20
    ) {
      errs.adults = "At least 1 adult required";
    }
    const children = bookingForm.children ?? 0;
    if (!Number.isInteger(children) || children < 0 || children > 20) {
      errs.children = "Children must be between 0 and 20";
    }
    bookingErrors = errs;
    return Object.keys(errs).length === 0;
  }

  function nextBookingStep() {
    if (bookingStep === 1) {
      if (!validateBookingStep1()) return;
      bookingStep = 2;
      saveBookingProgress();
    } else if (bookingStep === 2) {
      if (!validateBookingStep2()) return;
      bookingStep = 3;
      saveBookingProgress();
    }
  }

  function prevBookingStep() {
    bookingStep = Math.max(1, bookingStep - 1);
    saveBookingProgress();
  }

  async function submitCreateBooking() {
    if (!validateBookingStep1() || !validateBookingStep2()) return;
    const propertyId = workspace.currentId;
    if (propertyId === null) return;

    bookingBusy = true;
    try {
      const payload: Record<string, unknown> = {
        roomId: bookingForm.roomId,
        stay: {
          type: bookingForm.rateType,
          checkInDate: bookingForm.checkInDate,
          checkOutDate: bookingForm.checkOutDate,
        },
        adults: bookingForm.adults,
        children: bookingForm.children || 0,
        source: bookingForm.source,
        specialRequests: bookingForm.specialRequests.trim() || undefined,
      };

      if (bookingForm.guestMode === "existing" && bookingForm.selectedGuestId) {
        payload.guestId = bookingForm.selectedGuestId;
      } else {
        payload.guest = {
          firstName: bookingForm.newGuestFirstName.trim(),
          lastName: bookingForm.newGuestLastName.trim(),
          phone: bookingForm.newGuestPhone.trim(),
          email: bookingForm.newGuestEmail.trim() || undefined,
          country: bookingForm.newGuestCountry.trim() || undefined,
        };
      }

      await api.post(`/properties/${propertyId}/bookings`, payload);
      bookingDraft.clear();
      toast.success("Booking created", "The reservation is saved.");
      addingBooking = false;
      await load();
    } catch (err) {
      toast.error(
        "Could not create booking",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      bookingBusy = false;
    }
  }

  function openEditBooking(b: Booking) {
    editingBooking = b;
    editForm = {
      adults: b.adults ?? 1,
      children: b.children ?? 0,
      specialRequests: b.specialRequests ?? "",
      depositRequiredShillings: centsToShillings(b.depositRequiredCents),
    };
  }

  function closeEditBooking() {
    editingBooking = null;
  }

  async function submitEditBooking() {
    if (!editingBooking) return;
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    const depositShillings = editForm.depositRequiredShillings ?? 0;
    const depositRequiredCents = shillingsToCents(depositShillings);
    if (
      !Number.isFinite(depositShillings) ||
      depositRequiredCents < 0 ||
      depositRequiredCents > 100_000_000
    ) {
      toast.error("Please enter a valid deposit amount.");
      return;
    }

    editBusy = true;
    try {
      await api.patch(
        `/properties/${propertyId}/bookings/${editingBooking.id}`,
        {
          adults: editForm.adults,
          children: editForm.children,
          specialRequests: editForm.specialRequests.trim() || undefined,
          depositRequiredCents,
        },
      );

      toast.success(
        "Booking updated",
        `${editingBooking.reference} has been saved.`,
      );
      closeEditBooking();
      await load();
    } catch (err) {
      toast.error(
        "Could not update booking",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      editBusy = false;
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
        "The booking state has been updated.",
      );
      await load();
    } catch (err) {
      toast.error(
        "Action failed",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  function openRecordPayment(b: Booking) {
    payingBooking = b;
    paymentForm = {
      type: "payment",
      amountShillings: centsToShillings(Math.max(0, b.balanceCents)),
      paymentMethod: "mpesa",
      transactionReferenceCode: "",
    };
  }

  function closeRecordPayment() {
    payingBooking = null;
  }

  async function submitRecordPayment() {
    if (!payingBooking) return;
    const propertyId = workspace.currentId;
    if (propertyId === null) return;

    const amountCents = shillingsToCents(paymentForm.amountShillings);
    if (
      !Number.isFinite(paymentForm.amountShillings) ||
      amountCents <= 0 ||
      amountCents > payingBooking.balanceCents ||
      amountCents > 100_000_000
    ) {
      toast.error(
        amountCents > payingBooking.balanceCents
          ? `The remaining balance is ${formatMoney(payingBooking.balanceCents)}.`
          : "Please enter a valid amount",
      );
      return;
    }

    paymentBusy = true;
    try {
      await api.post(
        `/properties/${propertyId}/bookings/${payingBooking.id}/payments`,
        {
          type: paymentForm.type,
          amountCents,
          paymentMethod: paymentForm.paymentMethod,
          transactionReferenceCode:
            paymentForm.transactionReferenceCode.trim() || undefined,
        },
      );

      toast.success(
        "Payment recorded",
        `${formatMoney(amountCents)} received for ${payingBooking.reference}.`,
      );
      closeRecordPayment();
      await load();
    } catch (err) {
      toast.error(
        "Could not record payment",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      paymentBusy = false;
    }
  }

  async function search(e?: SubmitEvent) {
    e?.preventDefault();
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
    await workspace.load();
  });

  $effect(() => {
    const id = workspace.currentId;
    if (id !== null && session.isSignedIn) void load();
  });

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

  const selectedGuestObj = $derived(
    existingGuests.find((g) => g.id === bookingForm.selectedGuestId),
  );

  const selectedRoomObj = $derived(
    availableRooms.find((r) => r.id === bookingForm.roomId),
  );

  const selectedRoomTypeObj = $derived(
    roomTypes.find((t) => t.id === selectedRoomObj?.roomTypeId),
  );
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
  <!-- Header controls -->
  <div
    class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
  >
    <form class="flex flex-1 flex-col gap-2 sm:flex-row" onsubmit={search}>
      <div class="flex-1">
        <Input
          bind:value={q}
          placeholder="Reference, guest name or phone"
          aria-label="Search bookings"
        />
      </div>
      <div class="sm:w-44">
        <Select bind:value={status} options={statusOptions} />
      </div>
      <Button type="submit" {loading}>
        <Search class="size-4 mr-1.5" />
        Search
      </Button>
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

    <Button onclick={openCreateBookingModal}>
      <Plus class="size-4 mr-1.5" />
      New Booking
    </Button>
  </div>

  {#if error}
    <div class="panel p-6">
      <p class="text-sm text-error">{error}</p>
    </div>
  {:else if loading && bookings.length === 0}
    <div class="panel p-6 text-center text-sm text-ink-muted">
      Loading bookings…
    </div>
  {:else if bookings.length === 0}
    <div class="panel">
      <Empty
        title="No bookings found"
        description={q || status
          ? "No reservations match your search filter."
          : "There are no bookings recorded in this property yet."}
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
              <th class="px-4 py-2.5 font-medium text-ink-700">Dates</th>
              <th
                class="px-4 py-2.5 text-right font-medium text-ink-700"
                data-numeric
              >
                Total
              </th>
              <th class="px-4 py-2.5 font-medium text-ink-700">Status</th>
              <th class="px-4 py-2.5 text-right font-medium text-ink-700"
                >Actions</th
              >
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            {#each bookings as booking (booking.id)}
              <tr class="hover:bg-surface-muted transition-colors">
                <td class="px-4 py-3">
                  <span class="font-medium text-ink">{booking.reference}</span>
                  <span class="mt-0.5 block text-xs text-ink-muted">
                    {booking.source.replace(/_/g, " ")}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span class="text-ink font-medium">{booking.guestName}</span>
                  <span class="mt-0.5 block text-xs text-ink-muted">
                    {booking.guestPhone}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span class="text-ink font-medium"
                    >Room {booking.roomNumber}</span
                  >
                  <span class="mt-0.5 block text-xs text-ink-muted">
                    {booking.roomType}
                  </span>
                </td>
                <td class="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">
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
                  <div class="flex justify-end items-center gap-1.5">
                    {#if booking.balanceCents > 0}
                      <Button
                        size="sm"
                        variant="secondary"
                        onclick={() => openRecordPayment(booking)}
                        title="Record payment"
                      >
                        <CreditCard class="size-3.5 mr-1" />
                        Pay
                      </Button>
                    {/if}
                    <Button
                      size="sm"
                      variant="secondary"
                      onclick={() => openEditBooking(booking)}
                      title="Edit reservation"
                    >
                      <Pencil class="size-3.5" />
                    </Button>
                    {#each nextActions(booking) as act (act.action)}
                      <Button
                        size="sm"
                        variant="secondary"
                        onclick={() => transition(booking, act.action)}
                      >
                        {act.label}
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

<!-- Multi-Step Create Booking Modal -->
<Modal
  title="Create Booking"
  open={addingBooking}
  onclose={() => (addingBooking = false)}
  totalSteps={3}
  currentStep={bookingStep}
  width="max-w-2xl"
>
  {#if hasRestoredDraft}
    <div
      class="mb-4 flex items-center justify-between rounded-lg bg-surface-muted p-2.5 text-xs border border-line"
    >
      <span class="text-ink-muted"
        >Saved booking draft restored from your browser.</span
      >
      <button
        type="button"
        class="text-error font-medium hover:underline cursor-pointer"
        onclick={discardBookingDraft}
      >
        Discard draft
      </button>
    </div>
  {/if}

  {#if bookingStep === 1}
    <div class="space-y-4">
      <div>
        <p class="text-xs text-ink-muted">Step 1: Guest Selection</p>
        <p class="mt-0.5 text-sm text-ink">
          Select an existing guest from your directory or register a new one.
        </p>
      </div>

      <!-- Guest mode toggle -->
      <div class="flex rounded-lg border border-line bg-surface-muted p-1">
        <button
          type="button"
          class="flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer {bookingForm.guestMode ===
          'existing'
            ? 'bg-surface text-ink shadow-xs'
            : 'text-ink-muted hover:text-ink'}"
          onclick={() => {
            bookingForm.guestMode = "existing";
            saveBookingProgress();
          }}
        >
          <UserCheck class="size-3.5" />
          Pick Existing Guest
        </button>
        <button
          type="button"
          class="flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer {bookingForm.guestMode ===
          'new'
            ? 'bg-surface text-ink shadow-xs'
            : 'text-ink-muted hover:text-ink'}"
          onclick={() => {
            bookingForm.guestMode = "new";
            saveBookingProgress();
          }}
        >
          <UserPlus class="size-3.5" />
          New Guest
        </button>
      </div>

      {#if bookingForm.guestMode === "existing"}
        <div class="space-y-3">
          <div class="relative">
            <Search class="absolute left-2.5 top-2.5 size-4 text-ink-muted" />
            <input
              type="text"
              class="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              placeholder="Search by name, email, or phone…"
              bind:value={guestSearchQuery}
              oninput={() => searchGuests(guestSearchQuery)}
            />
          </div>

          {#if bookingErrors.selectedGuestId}
            <p class="text-xs text-error">{bookingErrors.selectedGuestId}</p>
          {/if}

          <div
            class="max-h-56 overflow-y-auto divide-y divide-line rounded-lg border border-line bg-surface"
          >
            {#if searchingGuests}
              <div class="p-4 text-center text-xs text-ink-muted">
                Searching guests…
              </div>
            {:else if existingGuests.length === 0}
              <div class="p-4 text-center text-xs text-ink-muted">
                No guests found. Switch to "New Guest" to create one.
              </div>
            {:else}
              {#each existingGuests as g (g.id)}
                <label
                  class="flex items-center gap-3 p-3 hover:bg-surface-muted cursor-pointer transition-colors"
                >
                  <input
                    type="radio"
                    name="selectedGuest"
                    value={g.id}
                    checked={bookingForm.selectedGuestId === g.id}
                    onchange={() => {
                      bookingForm.selectedGuestId = g.id;
                      saveBookingProgress();
                    }}
                    class="size-4 text-ink focus:ring-ink"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-ink">
                      {g.firstName}
                      {g.lastName}
                    </p>
                    <p class="text-xs text-ink-muted">
                      {g.phone}{g.email ? ` · ${g.email}` : ""}
                    </p>
                  </div>
                  {#if g.country}
                    <Badge tone="neutral">{g.country}</Badge>
                  {/if}
                </label>
              {/each}
            {/if}
          </div>
        </div>
      {:else}
        <div class="grid gap-3 sm:grid-cols-2">
          <Field
            label="First Name"
            error={bookingErrors.newGuestFirstName}
            required
          >
            {#snippet children({ id, describedBy, invalid })}
              <Input
                {id}
                {describedBy}
                bind:value={bookingForm.newGuestFirstName}
                placeholder="Jane"
                error={invalid ? bookingErrors.newGuestFirstName : null}
                oninput={saveBookingProgress}
              />
            {/snippet}
          </Field>

          <Field
            label="Last Name"
            error={bookingErrors.newGuestLastName}
            required
          >
            {#snippet children({ id, describedBy, invalid })}
              <Input
                {id}
                {describedBy}
                bind:value={bookingForm.newGuestLastName}
                placeholder="Mwangi"
                error={invalid ? bookingErrors.newGuestLastName : null}
                oninput={saveBookingProgress}
              />
            {/snippet}
          </Field>

          <Field
            label="Phone Number"
            error={bookingErrors.newGuestPhone}
            required
          >
            {#snippet children({ id, describedBy, invalid })}
              <Input
                {id}
                {describedBy}
                type="tel"
                bind:value={bookingForm.newGuestPhone}
                placeholder="+254 712 345 678"
                error={invalid ? bookingErrors.newGuestPhone : null}
                oninput={saveBookingProgress}
              />
            {/snippet}
          </Field>

          <Field label="Email Address">
            {#snippet children({ id, describedBy })}
              <Input
                {id}
                {describedBy}
                type="email"
                bind:value={bookingForm.newGuestEmail}
                placeholder="jane@example.com"
                oninput={saveBookingProgress}
              />
            {/snippet}
          </Field>

          <div class="sm:col-span-2">
            <Field label="Country of Residence">
              {#snippet children({ id, describedBy })}
                <Input
                  {id}
                  {describedBy}
                  bind:value={bookingForm.newGuestCountry}
                  placeholder="e.g. Kenya"
                  oninput={saveBookingProgress}
                />
              {/snippet}
            </Field>
          </div>
        </div>
      {/if}
    </div>
  {:else if bookingStep === 2}
    <div class="space-y-4">
      <div>
        <p class="text-xs text-ink-muted">Step 2: Room & Dates</p>
        <p class="mt-0.5 text-sm text-ink">
          Select an available room, stay dates, and party details.
        </p>
      </div>

      <!-- Room Selection -->
      <Field label="Select Room" error={bookingErrors.roomId} required>
        {#snippet children({ id, describedBy })}
          <div class="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto p-1">
            {#if availableRooms.length === 0}
              <p class="text-xs text-ink-muted sm:col-span-2">
                No rooms configured. Add rooms in the Rooms section first.
              </p>
            {:else}
              {#each availableRooms as room (room.id)}
                {@const type = roomTypes.find((t) => t.id === room.roomTypeId)}
                <label
                  class="flex items-center gap-3 p-2.5 rounded-lg border border-line hover:bg-surface-muted cursor-pointer transition-colors {bookingForm.roomId ===
                  room.id
                    ? 'border-ink bg-surface-muted'
                    : ''}"
                >
                  <input
                    type="radio"
                    name="bookingRoom"
                    value={room.id}
                    checked={bookingForm.roomId === room.id}
                    onchange={() => {
                      bookingForm.roomId = room.id;
                      saveBookingProgress();
                    }}
                    class="size-4 text-ink focus:ring-ink"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-semibold text-ink">
                      Room {room.roomNumber}
                      {#if room.floor}
                        <span class="text-ink-muted font-normal"
                          >({room.floor})</span
                        >
                      {/if}
                    </p>
                    <p class="text-xs text-ink-muted truncate">
                      {type?.name ?? "Room"}
                      {#if type?.pricePerNightCents}
                        · {formatMoney(type.pricePerNightCents)}/night
                      {/if}
                    </p>
                  </div>
                </label>
              {/each}
            {/if}
          </div>
        {/snippet}
      </Field>

      <div class="grid gap-3 sm:grid-cols-2">
        <Field label="Check-in Date" error={bookingErrors.checkInDate} required>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="date"
              bind:value={bookingForm.checkInDate}
              error={invalid ? bookingErrors.checkInDate : null}
              oninput={saveBookingProgress}
            />
          {/snippet}
        </Field>

        <Field
          label="Check-out Date"
          error={bookingErrors.checkOutDate}
          required
        >
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="date"
              bind:value={bookingForm.checkOutDate}
              error={invalid ? bookingErrors.checkOutDate : null}
              oninput={saveBookingProgress}
            />
          {/snippet}
        </Field>

        <Field label="Adults" error={bookingErrors.adults} required>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="number"
              min="1"
              max="20"
              bind:value={bookingForm.adults}
              error={invalid ? bookingErrors.adults : null}
              oninput={saveBookingProgress}
            />
          {/snippet}
        </Field>

        <Field label="Children" error={bookingErrors.children}>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="number"
              min="0"
              max="20"
              bind:value={bookingForm.children}
              error={invalid ? bookingErrors.children : null}
              oninput={saveBookingProgress}
            />
          {/snippet}
        </Field>
      </div>
    </div>
  {:else if bookingStep === 3}
    <div class="space-y-4">
      <div>
        <p class="text-xs text-ink-muted">Step 3: Details & Confirmation</p>
        <p class="mt-0.5 text-sm text-ink">
          Review the reservation summary and enter booking source or notes.
        </p>
      </div>

      <!-- Booking summary card -->
      <div class="rounded-lg border border-line bg-surface-muted p-4 space-y-3">
        <div
          class="flex items-center justify-between border-b border-line pb-2.5"
        >
          <span class="text-xs text-ink-muted">Guest</span>
          <span class="text-xs font-semibold text-ink">
            {#if bookingForm.guestMode === "existing"}
              {selectedGuestObj?.firstName}
              {selectedGuestObj?.lastName} ({selectedGuestObj?.phone})
            {:else}
              {bookingForm.newGuestFirstName}
              {bookingForm.newGuestLastName} ({bookingForm.newGuestPhone})
            {/if}
          </span>
        </div>

        <div
          class="flex items-center justify-between border-b border-line pb-2.5"
        >
          <span class="text-xs text-ink-muted">Assigned Room</span>
          <span class="text-xs font-semibold text-ink">
            Room {selectedRoomObj?.roomNumber ?? "—"} · {selectedRoomTypeObj?.name ??
              "Standard"}
          </span>
        </div>

        <div
          class="flex items-center justify-between border-b border-line pb-2.5"
        >
          <span class="text-xs text-ink-muted">Stay Dates</span>
          <span class="text-xs font-semibold text-ink">
            {formatDate(bookingForm.checkInDate)} → {formatDate(
              bookingForm.checkOutDate,
            )}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-xs text-ink-muted">Party Size</span>
          <span class="text-xs font-semibold text-ink">
            {bookingForm.adults} adult{bookingForm.adults === 1 ? "" : "s"}
            {#if bookingForm.children > 0}
              , {bookingForm.children} child{bookingForm.children === 1
                ? ""
                : "ren"}
            {/if}
          </span>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <Field label="Reservation Source">
          {#snippet children({ id, describedBy })}
            <Select
              {id}
              {describedBy}
              bind:value={bookingForm.source}
              options={sourceOptions}
            />
          {/snippet}
        </Field>

        <div class="sm:col-span-2">
          <Field label="Special Requests / Staff Notes">
            {#snippet children({ id, describedBy })}
              <Input
                {id}
                {describedBy}
                bind:value={bookingForm.specialRequests}
                placeholder="Late check-in, dietary preferences, extra bedding…"
                oninput={saveBookingProgress}
              />
            {/snippet}
          </Field>
        </div>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex items-center justify-between">
      {#if bookingStep > 1}
        <Button
          variant="secondary"
          onclick={prevBookingStep}
          disabled={bookingBusy}
        >
          Back
        </Button>
      {:else}
        <div></div>
      {/if}

      <div class="flex gap-2">
        <Button
          variant="secondary"
          onclick={() => (addingBooking = false)}
          disabled={bookingBusy}
        >
          Cancel
        </Button>
        {#if bookingStep < 3}
          <Button onclick={nextBookingStep}>Next Step</Button>
        {:else}
          <Button
            onclick={submitCreateBooking}
            loading={bookingBusy}
            disabled={bookingBusy}
          >
            Confirm Reservation
          </Button>
        {/if}
      </div>
    </div>
  {/snippet}
</Modal>

<!-- Edit Booking Modal -->
<Modal
  title="Edit Booking"
  open={editingBooking !== null}
  onclose={closeEditBooking}
  width="max-w-md"
>
  {#if editingBooking}
    <div class="space-y-3">
      <div class="rounded-lg bg-surface-muted p-3 text-xs border border-line">
        <div class="flex justify-between py-1">
          <span class="text-ink-muted">Booking Reference:</span>
          <span class="font-mono font-medium text-ink"
            >{editingBooking.reference}</span
          >
        </div>
        <div class="flex justify-between py-1">
          <span class="text-ink-muted">Guest:</span>
          <span class="font-medium text-ink">{editingBooking.guestName}</span>
        </div>
        <div class="flex justify-between py-1">
          <span class="text-ink-muted">Dates:</span>
          <span class="font-medium text-ink">
            {formatDate(editingBooking.checkInDate)} → {formatDate(
              editingBooking.checkOutDate,
            )}
          </span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <Field label="Adults" required>
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="number"
              min="1"
              max="20"
              required
              bind:value={editForm.adults}
            />
          {/snippet}
        </Field>

        <Field label="Children">
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="number"
              min="0"
              max="20"
              bind:value={editForm.children}
            />
          {/snippet}
        </Field>
      </div>

      <Field label="Deposit Required (KES)">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            type="number"
            min="0"
            step="0.01"
            max="1000000"
            bind:value={editForm.depositRequiredShillings}
          />
        {/snippet}
      </Field>

      <Field label="Special Requests">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            bind:value={editForm.specialRequests}
            placeholder="Notes…"
          />
        {/snippet}
      </Field>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={closeEditBooking}
        disabled={editBusy}
      >
        Cancel
      </Button>
      <Button
        onclick={submitEditBooking}
        loading={editBusy}
        disabled={editBusy}
      >
        Save Changes
      </Button>
    </div>
  {/snippet}
</Modal>

<!-- Record Payment Modal -->
<Modal
  title="Record Payment"
  open={payingBooking !== null}
  onclose={closeRecordPayment}
  width="max-w-md"
>
  {#if payingBooking}
    <div class="space-y-3">
      <div class="rounded-lg bg-surface-muted p-3 text-xs border border-line">
        <p class="font-medium text-ink">
          {payingBooking.reference} · {payingBooking.guestName}
        </p>
        <p class="text-ink-muted mt-0.5">
          Total reservation cost: {formatMoney(payingBooking.totalCostCents)}
        </p>
        <p class="text-ink-muted mt-0.5">
          Remaining balance: {formatMoney(payingBooking.balanceCents)}
        </p>
      </div>

      <Field label="Payment Type" required>
        {#snippet children({ id, describedBy })}
          <Select
            {id}
            {describedBy}
            bind:value={paymentForm.type}
            options={[
              { value: "payment", label: "Payment (Room / Services)" },
              { value: "deposit", label: "Initial Deposit" },
            ]}
          />
        {/snippet}
      </Field>

      <Field label="Amount (KES)" required>
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            type="number"
            min="0.01"
            max={centsToShillings(payingBooking?.balanceCents ?? 0)}
            step="0.01"
            required
            bind:value={paymentForm.amountShillings}
          />
        {/snippet}
      </Field>

      <Field label="Payment Method" required>
        {#snippet children({ id, describedBy })}
          <Select
            {id}
            {describedBy}
            bind:value={paymentForm.paymentMethod}
            options={[
              { value: "mpesa", label: "M-PESA" },
              { value: "cash", label: "Cash" },
              { value: "card", label: "Credit / Debit Card" },
              { value: "bank_transfer", label: "Bank Transfer" },
              { value: "airtel_money", label: "Airtel Money" },
              { value: "other", label: "Other" },
            ]}
          />
        {/snippet}
      </Field>

      <Field
        label="Transaction / Receipt Reference"
        hint="e.g. M-PESA Confirmation Code"
      >
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            bind:value={paymentForm.transactionReferenceCode}
            placeholder="QJH58X912K"
          />
        {/snippet}
      </Field>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={closeRecordPayment}
        disabled={paymentBusy}
      >
        Cancel
      </Button>
      <Button
        onclick={submitRecordPayment}
        loading={paymentBusy}
        disabled={paymentBusy}
      >
        Record Payment
      </Button>
    </div>
  {/snippet}
</Modal>
