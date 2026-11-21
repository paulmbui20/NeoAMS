<!--
  src/routes/guests/+page.svelte
  The guests of the property.

  Search by name, email, phone, or identity number; view stays history;
  add and edit guests using a multi-step modal with draft persistence.
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
  import { bookingLabel, bookingTone, formatDate } from "$lib/ui/status";
  import { createDraft } from "$lib/utils/draft";
  import {
    Plus,
    Pencil,
    Search,
    User,
    Phone,
    Mail,
    MapPin,
    Eye,
    Calendar,
    X,
  } from "lucide-svelte";

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

  type GuestDraft = {
    step: number;
    firstName: string;
    middleName: string;
    lastName: string;
    gender: string;
    dateOfBirth: string;
    nationality: string;
    phone: string;
    email: string;
    country: string;
    address: string;
  };

  const guestDraft = createDraft<GuestDraft>("guest-new");

  let guests = $state<Guest[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let q = $state("");

  // Add Guest Modal state
  let addingGuest = $state(false);
  let guestStep = $state(1);
  let hasRestoredDraft = $state(false);
  let guestBusy = $state(false);
  let guestErrors = $state<Record<string, string>>({});

  let guestForm = $state<GuestDraft>({
    step: 1,
    firstName: "",
    middleName: "",
    lastName: "",
    gender: "",
    dateOfBirth: "",
    nationality: "",
    phone: "",
    email: "",
    country: "",
    address: "",
  });

  // Edit Guest Modal state
  let editingGuest = $state<Guest | null>(null);
  let editGuestForm = $state({
    firstName: "",
    middleName: "",
    lastName: "",
    gender: "",
    dateOfBirth: "",
    nationality: "",
    phone: "",
    email: "",
    country: "",
    address: "",
  });
  let editGuestBusy = $state(false);
  let editGuestErrors = $state<Record<string, string>>({});

  // Guest Detail View state
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

  async function search(e?: SubmitEvent) {
    e?.preventDefault();
    await load();
  }

  function openAddGuestModal() {
    const saved = guestDraft.load();
    if (saved) {
      guestForm = saved;
      guestStep = saved.step || 1;
      hasRestoredDraft = true;
    } else {
      guestForm = {
        step: 1,
        firstName: "",
        middleName: "",
        lastName: "",
        gender: "",
        dateOfBirth: "",
        nationality: "",
        phone: "",
        email: "",
        country: "",
        address: "",
      };
      guestStep = 1;
      hasRestoredDraft = false;
    }
    guestErrors = {};
    addingGuest = true;
  }

  function saveGuestProgress() {
    guestDraft.save({
      ...guestForm,
      step: guestStep,
    });
  }

  function discardGuestDraft() {
    guestDraft.clear();
    hasRestoredDraft = false;
    guestForm = {
      step: 1,
      firstName: "",
      middleName: "",
      lastName: "",
      gender: "",
      dateOfBirth: "",
      nationality: "",
      phone: "",
      email: "",
      country: "",
      address: "",
    };
    guestStep = 1;
  }

  function validateGuestStep1(): boolean {
    const errs: Record<string, string> = {};
    if (!guestForm.firstName.trim()) errs.firstName = "First name is required";
    if (!guestForm.lastName.trim()) errs.lastName = "Last name is required";
    guestErrors = errs;
    return Object.keys(errs).length === 0;
  }

  function validateGuestStep2(): boolean {
    const errs: Record<string, string> = {};
    if (!guestForm.phone.trim()) errs.phone = "Phone number is required";
    if (
      guestForm.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestForm.email.trim())
    ) {
      errs.email = "Invalid email format";
    }
    guestErrors = errs;
    return Object.keys(errs).length === 0;
  }

  function nextGuestStep() {
    if (guestStep === 1) {
      if (!validateGuestStep1()) return;
      guestStep = 2;
      saveGuestProgress();
    }
  }

  function prevGuestStep() {
    guestStep = Math.max(1, guestStep - 1);
    saveGuestProgress();
  }

  async function submitCreateGuest() {
    if (!validateGuestStep1() || !validateGuestStep2()) return;
    const propertyId = workspace.currentId;
    if (propertyId === null) return;

    guestBusy = true;
    try {
      await api.post(`/properties/${propertyId}/guests`, {
        firstName: guestForm.firstName.trim(),
        middleName: guestForm.middleName.trim() || undefined,
        lastName: guestForm.lastName.trim(),
        gender: guestForm.gender || undefined,
        dateOfBirth: guestForm.dateOfBirth || undefined,
        nationality: guestForm.nationality.trim() || undefined,
        phone: guestForm.phone.trim(),
        email: guestForm.email.trim() || undefined,
        country: guestForm.country.trim() || undefined,
        address: guestForm.address.trim() || undefined,
      });

      guestDraft.clear();
      toast.success(
        "Guest added",
        `${guestForm.firstName} ${guestForm.lastName} has been registered.`,
      );
      addingGuest = false;
      await load();
    } catch (err) {
      toast.error(
        "Could not add guest",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      guestBusy = false;
    }
  }

  function openEditGuest(g: Guest) {
    editingGuest = g;
    editGuestForm = {
      firstName: g.firstName,
      middleName: g.middleName ?? "",
      lastName: g.lastName,
      gender: g.gender ?? "",
      dateOfBirth: g.dateOfBirth ?? "",
      nationality: g.nationality ?? "",
      phone: g.phone,
      email: g.email ?? "",
      country: g.country ?? "",
      address: g.address ?? "",
    };
    editGuestErrors = {};
  }

  function closeEditGuest() {
    editingGuest = null;
    editGuestErrors = {};
  }

  async function submitEditGuest() {
    if (!editingGuest) return;
    const propertyId = workspace.currentId;
    if (propertyId === null) return;

    const errs: Record<string, string> = {};
    if (!editGuestForm.firstName.trim())
      errs.firstName = "First name is required";
    if (!editGuestForm.lastName.trim()) errs.lastName = "Last name is required";
    if (!editGuestForm.phone.trim()) errs.phone = "Phone is required";
    if (
      editGuestForm.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editGuestForm.email.trim())
    ) {
      errs.email = "Invalid email format";
    }

    if (Object.keys(errs).length > 0) {
      editGuestErrors = errs;
      return;
    }

    editGuestBusy = true;
    try {
      await api.patch(`/properties/${propertyId}/guests/${editingGuest.id}`, {
        firstName: editGuestForm.firstName.trim(),
        middleName: editGuestForm.middleName.trim() || undefined,
        lastName: editGuestForm.lastName.trim(),
        gender: editGuestForm.gender || undefined,
        dateOfBirth: editGuestForm.dateOfBirth || undefined,
        nationality: editGuestForm.nationality.trim() || undefined,
        phone: editGuestForm.phone.trim(),
        email: editGuestForm.email.trim() || undefined,
        country: editGuestForm.country.trim() || undefined,
        address: editGuestForm.address.trim() || undefined,
      });

      toast.success(
        "Guest updated",
        `${editGuestForm.firstName} ${editGuestForm.lastName} saved.`,
      );
      closeEditGuest();
      await load();
      if (openGuest && openGuest.id === editingGuest.id) {
        void openGuestDetails(editingGuest.id);
      }
    } catch (err) {
      toast.error(
        "Could not update guest",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      editGuestBusy = false;
    }
  }

  async function openGuestDetails(id: number) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      openGuest = await api.get<GuestWithHistory>(
        `/properties/${propertyId}/guests/${id}`,
      );
    } catch (err) {
      toast.error(
        "Could not load guest details",
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

  const fullName = (guest: Guest) =>
    `${guest.firstName} ${guest.middleName ? guest.middleName + " " : ""}${guest.lastName}`.trim();
</script>

<PageHeader
  title="Guests"
  description={total > 0
    ? `${total} guest${total === 1 ? "" : "s"} registered.`
    : "The guest directory of this property."}
/>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else}
  <!-- Header Search and Actions -->
  <div
    class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
  >
    <form class="flex flex-1 gap-2" onsubmit={search}>
      <div class="flex-1">
        <Input
          bind:value={q}
          placeholder="Search by name, email, phone, or passport…"
          aria-label="Search guests"
        />
      </div>
      <Button type="submit" {loading}>
        <Search class="size-4 mr-1.5" />
        Search
      </Button>
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

    <Button onclick={openAddGuestModal}>
      <Plus class="size-4 mr-1.5" />
      New Guest
    </Button>
  </div>

  {#if error}
    <div class="panel p-6">
      <p class="text-sm text-error">{error}</p>
    </div>
  {:else if loading && guests.length === 0}
    <div class="panel p-6 text-center text-sm text-ink-muted">
      Loading guest records…
    </div>
  {:else if guests.length === 0}
    <div class="panel">
      <Empty
        title="No guests found"
        description={q
          ? "No guest matches that search query."
          : "No guests have been registered in this property yet."}
      />
    </div>
  {:else}
    <Card padded={false}>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead class="border-b border-line bg-surface-muted">
            <tr class="text-left">
              <th class="px-4 py-2.5 font-medium text-ink-700">Guest Name</th>
              <th class="px-4 py-2.5 font-medium text-ink-700">Phone</th>
              <th class="px-4 py-2.5 font-medium text-ink-700">Email</th>
              <th class="px-4 py-2.5 font-medium text-ink-700">Country</th>
              <th class="px-4 py-2.5 text-right font-medium text-ink-700"
                >Actions</th
              >
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            {#each guests as guest (guest.id)}
              <tr class="hover:bg-surface-muted transition-colors">
                <td class="px-4 py-3">
                  <span class="font-medium text-ink">{fullName(guest)}</span>
                  {#if guest.nationality}
                    <span class="mt-0.5 block text-xs text-ink-muted">
                      {guest.nationality}
                    </span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-ink-muted">{guest.phone}</td>
                <td class="px-4 py-3 text-ink-muted">{guest.email ?? "—"}</td>
                <td class="px-4 py-3 text-ink-muted">{guest.country ?? "—"}</td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onclick={() => openGuestDetails(guest.id)}
                      title="View history"
                    >
                      <Eye class="size-3.5 mr-1" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onclick={() => openEditGuest(guest)}
                      title="Edit guest profile"
                    >
                      <Pencil class="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  {/if}

  <!-- Guest Details Drawer/Modal -->
  {#if openGuest}
    <div class="mt-6">
      <Card
        title={fullName(openGuest)}
        description={`${openGuest.phone}${openGuest.email ? ` · ${openGuest.email}` : ""}`}
      >
        {#snippet actions()}
          <Button size="sm" variant="ghost" onclick={() => (openGuest = null)}>
            <X class="size-4 mr-1" />
            Close
          </Button>
        {/snippet}

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p class="text-xs font-medium text-ink-muted">Country</p>
            <p class="mt-0.5 text-sm text-ink">{openGuest.country ?? "—"}</p>
          </div>
          <div>
            <p class="text-xs font-medium text-ink-muted">Nationality</p>
            <p class="mt-0.5 text-sm text-ink">
              {openGuest.nationality ?? "—"}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium text-ink-muted">Date of Birth</p>
            <p class="mt-0.5 text-sm text-ink">
              {openGuest.dateOfBirth ? formatDate(openGuest.dateOfBirth) : "—"}
            </p>
          </div>
          <div>
            <p class="text-xs font-medium text-ink-muted">Address</p>
            <p class="mt-0.5 text-sm text-ink">{openGuest.address ?? "—"}</p>
          </div>
        </div>

        <div class="mt-5 border-t border-line pt-4">
          <p
            class="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2"
          >
            Stay History ({openGuest.bookings.length})
          </p>
          {#if openGuest.bookings.length === 0}
            <p class="text-xs text-ink-muted">
              No reservations recorded for this guest yet.
            </p>
          {:else}
            <ul class="divide-y divide-line">
              {#each openGuest.bookings as stay (stay.id)}
                <li class="flex items-center justify-between py-2 text-xs">
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-medium text-ink"
                      >{stay.reference}</span
                    >
                    <span class="text-ink-muted">
                      {formatDate(stay.checkInDate)} → {formatDate(
                        stay.checkOutDate,
                      )}
                    </span>
                  </div>
                  <Badge tone={bookingTone(stay.status)}>
                    {bookingLabel(stay.status)}
                  </Badge>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </Card>
    </div>
  {/if}
{/if}

<!-- Multi-Step Add Guest Modal -->
<Modal
  title="New Guest Registration"
  open={addingGuest}
  onclose={() => (addingGuest = false)}
  totalSteps={2}
  currentStep={guestStep}
  width="max-w-xl"
>
  {#if hasRestoredDraft}
    <div
      class="mb-4 flex items-center justify-between rounded-lg bg-surface-muted p-2.5 text-xs border border-line"
    >
      <span class="text-ink-muted"
        >Restored your unsaved registration progress.</span
      >
      <button
        type="button"
        class="text-error font-medium hover:underline cursor-pointer"
        onclick={discardGuestDraft}
      >
        Discard
      </button>
    </div>
  {/if}

  {#if guestStep === 1}
    <div class="space-y-3">
      <p class="text-xs text-ink-muted">Step 1: Personal Identification</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label="First Name" error={guestErrors.firstName} required>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              bind:value={guestForm.firstName}
              placeholder="Jane"
              error={invalid ? guestErrors.firstName : null}
              oninput={saveGuestProgress}
            />
          {/snippet}
        </Field>

        <Field label="Middle Name">
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              bind:value={guestForm.middleName}
              placeholder="Wanjiru"
              oninput={saveGuestProgress}
            />
          {/snippet}
        </Field>

        <Field label="Last Name" error={guestErrors.lastName} required>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              bind:value={guestForm.lastName}
              placeholder="Mwangi"
              error={invalid ? guestErrors.lastName : null}
              oninput={saveGuestProgress}
            />
          {/snippet}
        </Field>

        <Field label="Gender">
          {#snippet children({ id, describedBy })}
            <Select
              {id}
              {describedBy}
              bind:value={guestForm.gender}
              options={[
                { value: "", label: "Select gender…" },
                { value: "female", label: "Female" },
                { value: "male", label: "Male" },
                { value: "other", label: "Other" },
                { value: "prefer_not_to_say", label: "Prefer not to say" },
              ]}
              onchange={saveGuestProgress}
            />
          {/snippet}
        </Field>

        <Field label="Date of Birth">
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="date"
              bind:value={guestForm.dateOfBirth}
              oninput={saveGuestProgress}
            />
          {/snippet}
        </Field>

        <Field label="Nationality">
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              bind:value={guestForm.nationality}
              placeholder="Kenyan"
              oninput={saveGuestProgress}
            />
          {/snippet}
        </Field>
      </div>
    </div>
  {:else if guestStep === 2}
    <div class="space-y-3">
      <p class="text-xs text-ink-muted">
        Step 2: Contact & Address Information
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label="Phone Number" error={guestErrors.phone} required>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="tel"
              bind:value={guestForm.phone}
              placeholder="+254 712 345 678"
              error={invalid ? guestErrors.phone : null}
              oninput={saveGuestProgress}
            />
          {/snippet}
        </Field>

        <Field label="Email Address" error={guestErrors.email}>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="email"
              bind:value={guestForm.email}
              placeholder="jane@example.com"
              error={invalid ? guestErrors.email : null}
              oninput={saveGuestProgress}
            />
          {/snippet}
        </Field>

        <div class="sm:col-span-2">
          <Field label="Country of Residence">
            {#snippet children({ id, describedBy })}
              <Input
                {id}
                {describedBy}
                bind:value={guestForm.country}
                placeholder="Kenya"
                oninput={saveGuestProgress}
              />
            {/snippet}
          </Field>
        </div>

        <div class="sm:col-span-2">
          <Field label="Residential Address">
            {#snippet children({ id, describedBy })}
              <Input
                {id}
                {describedBy}
                bind:value={guestForm.address}
                placeholder="P.O. Box 1234, Nairobi"
                oninput={saveGuestProgress}
              />
            {/snippet}
          </Field>
        </div>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex items-center justify-between">
      {#if guestStep > 1}
        <Button
          variant="secondary"
          onclick={prevGuestStep}
          disabled={guestBusy}
        >
          Back
        </Button>
      {:else}
        <div></div>
      {/if}

      <div class="flex gap-2">
        <Button
          variant="secondary"
          onclick={() => (addingGuest = false)}
          disabled={guestBusy}
        >
          Cancel
        </Button>
        {#if guestStep < 2}
          <Button onclick={nextGuestStep}>Next Step</Button>
        {:else}
          <Button
            onclick={submitCreateGuest}
            loading={guestBusy}
            disabled={guestBusy}
          >
            Save Guest Record
          </Button>
        {/if}
      </div>
    </div>
  {/snippet}
</Modal>

<!-- Edit Guest Modal -->
<Modal
  title="Edit Guest Profile"
  open={editingGuest !== null}
  onclose={closeEditGuest}
  width="max-w-xl"
>
  {#if editingGuest}
    <div class="grid gap-3 sm:grid-cols-2">
      <Field label="First Name" error={editGuestErrors.firstName} required>
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            bind:value={editGuestForm.firstName}
            error={invalid ? editGuestErrors.firstName : null}
          />
        {/snippet}
      </Field>

      <Field label="Middle Name">
        {#snippet children({ id, describedBy })}
          <Input {id} {describedBy} bind:value={editGuestForm.middleName} />
        {/snippet}
      </Field>

      <Field label="Last Name" error={editGuestErrors.lastName} required>
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            bind:value={editGuestForm.lastName}
            error={invalid ? editGuestErrors.lastName : null}
          />
        {/snippet}
      </Field>

      <Field label="Phone" error={editGuestErrors.phone} required>
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            type="tel"
            bind:value={editGuestForm.phone}
            error={invalid ? editGuestErrors.phone : null}
          />
        {/snippet}
      </Field>

      <Field label="Email Address" error={editGuestErrors.email}>
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            type="email"
            bind:value={editGuestForm.email}
            error={invalid ? editGuestErrors.email : null}
          />
        {/snippet}
      </Field>

      <Field label="Country">
        {#snippet children({ id, describedBy })}
          <Input {id} {describedBy} bind:value={editGuestForm.country} />
        {/snippet}
      </Field>

      <Field label="Nationality">
        {#snippet children({ id, describedBy })}
          <Input {id} {describedBy} bind:value={editGuestForm.nationality} />
        {/snippet}
      </Field>

      <Field label="Date of Birth">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            type="date"
            bind:value={editGuestForm.dateOfBirth}
          />
        {/snippet}
      </Field>

      <div class="sm:col-span-2">
        <Field label="Address">
          {#snippet children({ id, describedBy })}
            <Input {id} {describedBy} bind:value={editGuestForm.address} />
          {/snippet}
        </Field>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={closeEditGuest}
        disabled={editGuestBusy}
      >
        Cancel
      </Button>
      <Button
        onclick={submitEditGuest}
        loading={editGuestBusy}
        disabled={editGuestBusy}
      >
        Save Changes
      </Button>
    </div>
  {/snippet}
</Modal>
