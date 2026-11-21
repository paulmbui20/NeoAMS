<!--
  src/routes/admin/+page.svelte
  Administration.

  The global administrator's view: the properties of the installation
  and the accounts of the people who use it.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api, ApiError } from "$lib/api/client";
  import { session } from "$lib/api/session.svelte";
  import { workspace } from "$lib/api/workspace.svelte";
  import PageHeader from "$lib/components/shell/PageHeader.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Empty from "$lib/components/ui/Empty.svelte";
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import { toast } from "$lib/components/ui/toast.svelte";
  import { formatDate, roleLabel } from "$lib/ui/status";
  import { createDraft } from "$lib/utils/draft";
  import {
    Building2,
    Users,
    Plus,
    Pencil,
    KeyRound,
    Ban,
    CheckCircle2,
    RotateCcw,
    Search,
  } from "lucide-svelte";

  type Property = {
    id: number;
    name: string;
    slug: string;
    county: string;
    town: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    checkInTime: string;
    checkOutTime: string;
    depositPercent: number;
    isActive: boolean;
  };

  type Account = {
    id: string;
    name: string;
    email: string;
    role: string;
    banned: boolean;
    banReason: string | null;
    mustChangePassword: boolean;
    emailVerified: boolean;
    createdAt: string;
  };

  type PropertyDraft = {
    name: string;
    county: string;
    town: string;
    address: string;
    phone: string;
    email: string;
    checkInTime: string;
    checkOutTime: string;
    depositPercent: number;
    ownerMode: "existing" | "new";
    selectedUserId: string;
    newOwnerName: string;
    newOwnerEmail: string;
    newOwnerPassword: string;
    step: number;
  };

  const propertyDraft = createDraft<PropertyDraft>("property-new");

  let properties = $state<Property[]>([]);
  let accounts = $state<Account[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let tab = $state<"properties" | "accounts">("properties");

  // Create Property Modal state
  let addingProperty = $state(false);
  let propertyStep = $state(1);
  let propertyForm = $state<PropertyDraft>({
    name: "",
    county: "",
    town: "",
    address: "",
    phone: "",
    email: "",
    checkInTime: "14:00",
    checkOutTime: "10:00",
    depositPercent: 30,
    ownerMode: "existing",
    selectedUserId: "",
    newOwnerName: "",
    newOwnerEmail: "",
    newOwnerPassword: "",
    step: 1,
  });
  let ownerUserSearch = $state("");
  let propertyBusy = $state(false);
  let propertyErrors = $state<Record<string, string>>({});
  let hasRestoredDraft = $state(false);

  // Edit Property Modal state
  let editingProperty = $state<Property | null>(null);
  let editPropertyForm = $state({
    name: "",
    county: "",
    town: "",
    address: "",
    checkInTime: "14:00",
    checkOutTime: "10:00",
    depositPercent: 30,
    phone: "",
    email: "",
    isActive: true,
  });
  let editPropertyBusy = $state(false);
  let editPropertyErrors = $state<Record<string, string>>({});

  // Add Account Modal state
  let addingAccount = $state(false);
  let accountName = $state("");
  let accountEmail = $state("");
  let accountRole = $state("user");
  let accountPassword = $state("");
  let accountBusy = $state(false);

  async function load() {
    loading = true;
    error = null;
    try {
      const [propertyResult, userResult] = await Promise.all([
        api.get<{ data: Property[] }>("/admin/properties", {
          query: { limit: 100, offset: 0 },
        }),
        api.get<{ data: Account[] }>("/admin/users", {
          query: { limit: 100, offset: 0 },
        }),
      ]);
      properties = propertyResult.data;
      accounts = userResult.data;
    } catch (err) {
      error =
        err instanceof ApiError && err.status === 403
          ? "This area is for system administrators."
          : err instanceof ApiError
            ? err.message
            : "The administration pages could not be loaded.";
      properties = [];
      accounts = [];
    } finally {
      loading = false;
    }
  }

  function openCreatePropertyModal() {
    const saved = propertyDraft.load();
    if (saved) {
      propertyForm = saved;
      propertyStep = saved.step || 1;
      hasRestoredDraft = true;
    } else {
      propertyForm = {
        name: "",
        county: "",
        town: "",
        address: "",
        phone: "",
        email: "",
        checkInTime: "14:00",
        checkOutTime: "10:00",
        depositPercent: 30,
        ownerMode: accounts.length > 0 ? "existing" : "new",
        selectedUserId: accounts[0]?.id ?? "",
        newOwnerName: "",
        newOwnerEmail: "",
        newOwnerPassword: "",
        step: 1,
      };
      propertyStep = 1;
      hasRestoredDraft = false;
    }
    propertyErrors = {};
    addingProperty = true;
  }

  function savePropertyProgress() {
    propertyDraft.save({
      ...propertyForm,
      step: propertyStep,
    });
  }

  function discardPropertyDraft() {
    propertyDraft.clear();
    hasRestoredDraft = false;
    propertyForm = {
      name: "",
      county: "",
      town: "",
      address: "",
      phone: "",
      email: "",
      checkInTime: "14:00",
      checkOutTime: "10:00",
      depositPercent: 30,
      ownerMode: accounts.length > 0 ? "existing" : "new",
      selectedUserId: accounts[0]?.id ?? "",
      newOwnerName: "",
      newOwnerEmail: "",
      newOwnerPassword: "",
      step: 1,
    };
    propertyStep = 1;
  }

  function validatePropertyStep1(): boolean {
    const errs: Record<string, string> = {};
    if (!propertyForm.name.trim()) errs.name = "Property name is required";
    if (!propertyForm.county.trim()) errs.county = "County is required";
    if (!propertyForm.town.trim()) errs.town = "Town is required";
    if (propertyForm.depositPercent < 0 || propertyForm.depositPercent > 100) {
      errs.depositPercent = "Deposit must be between 0 and 100%";
    }
    propertyErrors = errs;
    return Object.keys(errs).length === 0;
  }

  function validatePropertyStep2(): boolean {
    const errs: Record<string, string> = {};
    if (propertyForm.ownerMode === "existing") {
      if (!propertyForm.selectedUserId) {
        errs.selectedUserId = "Please choose an existing user to be the owner";
      }
    } else {
      if (!propertyForm.newOwnerName.trim()) {
        errs.newOwnerName = "Owner name is required";
      }
      if (!propertyForm.newOwnerEmail.trim()) {
        errs.newOwnerEmail = "Owner email is required";
      } else if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(propertyForm.newOwnerEmail.trim())
      ) {
        errs.newOwnerEmail = "Invalid email format";
      }
      if (propertyForm.newOwnerPassword.length < 10) {
        errs.newOwnerPassword = "Password must be at least 10 characters";
      }
    }
    propertyErrors = errs;
    return Object.keys(errs).length === 0;
  }

  function nextPropertyStep() {
    if (propertyStep === 1) {
      if (!validatePropertyStep1()) return;
      propertyStep = 2;
      savePropertyProgress();
    } else if (propertyStep === 2) {
      if (!validatePropertyStep2()) return;
      propertyStep = 3;
      savePropertyProgress();
    }
  }

  function prevPropertyStep() {
    propertyStep = Math.max(1, propertyStep - 1);
    savePropertyProgress();
  }

  async function submitCreateProperty() {
    if (!validatePropertyStep1() || !validatePropertyStep2()) return;
    propertyBusy = true;
    try {
      const ownerPayload =
        propertyForm.ownerMode === "existing"
          ? { userId: propertyForm.selectedUserId }
          : {
              name: propertyForm.newOwnerName.trim(),
              email: propertyForm.newOwnerEmail.trim(),
              tempPassword: propertyForm.newOwnerPassword,
            };

      await api.post("/admin/properties", {
        name: propertyForm.name.trim(),
        county: propertyForm.county.trim(),
        town: propertyForm.town.trim(),
        address: propertyForm.address.trim() || undefined,
        phone: propertyForm.phone.trim() || undefined,
        email: propertyForm.email.trim() || undefined,
        checkInTime: propertyForm.checkInTime || "14:00",
        checkOutTime: propertyForm.checkOutTime || "10:00",
        depositPercent: propertyForm.depositPercent,
        owner: ownerPayload,
      });

      propertyDraft.clear();
      toast.success(
        "Property created",
        `${propertyForm.name} is ready for management.`,
      );
      addingProperty = false;
      await load();
      await workspace.load();
    } catch (err) {
      toast.error(
        "Could not create property",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      propertyBusy = false;
    }
  }

  function openEditProperty(p: Property) {
    editingProperty = p;
    editPropertyForm = {
      name: p.name,
      county: p.county,
      town: p.town,
      address: p.address ?? "",
      checkInTime: p.checkInTime,
      checkOutTime: p.checkOutTime,
      depositPercent: p.depositPercent,
      phone: p.phone ?? "",
      email: p.email ?? "",
      isActive: p.isActive,
    };
    editPropertyErrors = {};
  }

  function closeEditProperty() {
    editingProperty = null;
    editPropertyErrors = {};
  }

  async function submitEditProperty() {
    if (!editingProperty) return;
    const errs: Record<string, string> = {};
    if (!editPropertyForm.name.trim()) errs.name = "Name is required";
    if (!editPropertyForm.county.trim()) errs.county = "County is required";
    if (!editPropertyForm.town.trim()) errs.town = "Town is required";
    if (
      editPropertyForm.depositPercent < 0 ||
      editPropertyForm.depositPercent > 100
    ) {
      errs.depositPercent = "Deposit must be 0-100%";
    }
    if (Object.keys(errs).length > 0) {
      editPropertyErrors = errs;
      return;
    }

    editPropertyBusy = true;
    try {
      await api.patch(`/admin/properties/${editingProperty.id}`, {
        name: editPropertyForm.name.trim(),
        county: editPropertyForm.county.trim(),
        town: editPropertyForm.town.trim(),
        address: editPropertyForm.address.trim() || undefined,
        checkInTime: editPropertyForm.checkInTime,
        checkOutTime: editPropertyForm.checkOutTime,
        depositPercent: editPropertyForm.depositPercent,
        phone: editPropertyForm.phone.trim() || undefined,
        email: editPropertyForm.email.trim() || undefined,
        isActive: editPropertyForm.isActive,
      });

      toast.success(
        "Property updated",
        `${editPropertyForm.name} has been updated.`,
      );
      closeEditProperty();
      await load();
      await workspace.load();
    } catch (err) {
      toast.error(
        "Could not update property",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      editPropertyBusy = false;
    }
  }

  async function submitAddAccount(e: SubmitEvent) {
    e.preventDefault();
    if (!accountName.trim() || !accountEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    accountBusy = true;
    try {
      await api.post("/admin/users", {
        name: accountName.trim(),
        email: accountEmail.trim(),
        role: accountRole,
        tempPassword: accountPassword || undefined,
      });
      toast.success(
        "Account created",
        accountPassword
          ? "User must change their temporary password."
          : "User account is active.",
      );
      accountName = "";
      accountEmail = "";
      accountRole = "user";
      accountPassword = "";
      addingAccount = false;
      await load();
    } catch (err) {
      toast.error(
        "Could not create account",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      accountBusy = false;
    }
  }

  async function setRole(account: Account, role: string) {
    try {
      await api.patch(`/admin/users/${account.id}`, { role });
      toast.success(`${account.name} is now ${roleLabel(role).toLowerCase()}`);
      await load();
    } catch (err) {
      toast.error(
        "Could not change role",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function ban(account: Account) {
    const reason = prompt(`Why is ${account.name} being banned?`);
    if (reason === null) return;
    try {
      await api.post(`/admin/users/${account.id}/ban`, { reason });
      toast.success(`${account.name} has been banned`);
      await load();
    } catch (err) {
      toast.error(
        "Could not ban user",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function unban(account: Account) {
    try {
      await api.post(`/admin/users/${account.id}/unban`);
      toast.success(`${account.name} unbanned`);
      await load();
    } catch (err) {
      toast.error(
        "Could not unban user",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function resetPassword(account: Account) {
    const generated = `Neo${Math.random().toString(36).slice(2, 8)}${Math.floor(
      Math.random() * 100,
    )}`;
    try {
      await api.post(`/admin/users/${account.id}/reset-password`, {
        newPassword: generated,
      });
      toast.success(`New password for ${account.name}`, generated);
    } catch (err) {
      toast.error(
        "Password could not be reset",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  onMount(async () => {
    if (!session.loading && !session.isSignedIn) {
      await goto("/login", { replaceState: true });
      return;
    }
    if (session.isSignedIn && !session.isAdmin) {
      await goto("/", { replaceState: true });
      return;
    }
    await load();
  });

  const filteredAccountsForOwner = $derived(
    accounts.filter((a) => {
      if (!ownerUserSearch.trim()) return true;
      const q = ownerUserSearch.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      );
    }),
  );

  const selectedOwnerAccount = $derived(
    accounts.find((a) => a.id === propertyForm.selectedUserId),
  );
</script>

<PageHeader
  title="Administration"
  description="Manage the properties of this installation and the users who run them."
/>

{#if error}
  <div class="panel p-6">
    <p class="text-sm text-error">{error}</p>
  </div>
{:else if loading && properties.length === 0 && accounts.length === 0}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else}
  <div class="mb-4 flex items-center justify-between border-b border-line">
    <div class="flex gap-1">
      {#each [{ key: "properties", label: `Properties (${properties.length})` }, { key: "accounts", label: `Accounts (${accounts.length})` }] as option (option.key)}
        <button
          type="button"
          class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer {tab ===
          option.key
            ? 'border-ink-900 text-ink'
            : 'border-transparent text-ink-muted hover:text-ink'}"
          onclick={() => (tab = option.key as typeof tab)}
        >
          {option.label}
        </button>
      {/each}
    </div>

    {#if tab === "properties"}
      <Button onclick={openCreatePropertyModal}>
        <Plus class="size-4 mr-1.5" />
        Add Property
      </Button>
    {:else}
      <Button onclick={() => (addingAccount = true)}>
        <Plus class="size-4 mr-1.5" />
        Add Account
      </Button>
    {/if}
  </div>

  {#if tab === "properties"}
    {#if properties.length === 0}
      <div class="panel">
        <Empty
          title="No properties yet"
          description="Create the first property to begin setting up rooms and bookings."
        />
      </div>
    {:else}
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each properties as property (property.id)}
          <div class="panel p-4 flex flex-col justify-between">
            <div>
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-base font-semibold text-ink">
                    {property.name}
                  </p>
                  <p class="mt-0.5 truncate text-xs text-ink-muted">
                    {property.town}, {property.county}
                  </p>
                </div>
                <div class="flex items-center gap-1.5">
                  {#if property.isActive}
                    <Badge tone="success">Active</Badge>
                  {:else}
                    <Badge tone="neutral">Inactive</Badge>
                  {/if}
                  <Button
                    size="sm"
                    variant="secondary"
                    onclick={() => openEditProperty(property)}
                    title="Edit property"
                  >
                    <Pencil class="size-3.5" />
                  </Button>
                </div>
              </div>

              <dl class="mt-3 space-y-1 border-t border-line pt-3 text-xs">
                <div class="flex justify-between gap-2">
                  <dt class="text-ink-muted">Check in / out</dt>
                  <dd class="font-medium text-ink tabular-nums">
                    {property.checkInTime} / {property.checkOutTime}
                  </dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-ink-muted">Deposit required</dt>
                  <dd class="font-medium text-ink tabular-nums">
                    {property.depositPercent}%
                  </dd>
                </div>
                {#if property.phone}
                  <div class="flex justify-between gap-2">
                    <dt class="text-ink-muted">Phone</dt>
                    <dd class="text-ink">{property.phone}</dd>
                  </div>
                {/if}
                <div class="flex justify-between gap-2">
                  <dt class="text-ink-muted">Slug</dt>
                  <dd class="truncate font-mono text-ink-faint">
                    /{property.slug}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <!-- Accounts list -->
    {#if accounts.length === 0}
      <div class="panel">
        <Empty title="No accounts" description="Nobody has an account yet." />
      </div>
    {:else}
      <Card padded={false}>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <thead class="border-b border-line bg-surface-muted">
              <tr class="text-left">
                <th class="px-4 py-2.5 font-medium text-ink-700">Name</th>
                <th class="px-4 py-2.5 font-medium text-ink-700">Email</th>
                <th class="px-4 py-2.5 font-medium text-ink-700">Role</th>
                <th class="px-4 py-2.5 font-medium text-ink-700">Status</th>
                <th class="px-4 py-2.5 font-medium text-ink-700">Created</th>
                <th class="px-4 py-2.5 text-right font-medium text-ink-700"
                  >Actions</th
                >
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              {#each accounts as account (account.id)}
                <tr class="hover:bg-surface-muted">
                  <td class="px-4 py-3 font-medium text-ink">{account.name}</td>
                  <td class="px-4 py-3 text-ink-muted">{account.email}</td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center gap-1.5">
                      <Badge
                        tone={account.role === "admin" ? "info" : "neutral"}
                      >
                        {roleLabel(account.role)}
                      </Badge>
                      {#if account.id !== session.user?.id}
                        <button
                          type="button"
                          class="text-xs text-ink-muted hover:text-ink underline cursor-pointer"
                          onclick={() =>
                            setRole(
                              account,
                              account.role === "admin" ? "user" : "admin",
                            )}
                        >
                          Change
                        </button>
                      {/if}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    {#if account.banned}
                      <Badge tone="error">Banned</Badge>
                    {:else if account.mustChangePassword}
                      <Badge tone="warning">Must change password</Badge>
                    {:else}
                      <Badge tone="success">Active</Badge>
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-xs text-ink-muted">
                    {formatDate(account.createdAt)}
                  </td>
                  <td class="px-4 py-3 text-right">
                    {#if account.id !== session.user?.id}
                      <div class="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onclick={() => resetPassword(account)}
                          title="Generate temporary password"
                        >
                          <KeyRound class="size-3.5 mr-1" />
                          Reset
                        </Button>
                        {#if account.banned}
                          <Button
                            size="sm"
                            variant="secondary"
                            onclick={() => unban(account)}
                            title="Unban user"
                          >
                            <CheckCircle2 class="size-3.5 mr-1 text-success" />
                            Unban
                          </Button>
                        {:else}
                          <Button
                            size="sm"
                            variant="secondary"
                            onclick={() => ban(account)}
                            title="Ban user"
                          >
                            <Ban class="size-3.5 mr-1 text-error" />
                            Ban
                          </Button>
                        {/if}
                      </div>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Card>
    {/if}
  {/if}
{/if}

<!-- Multi-Step Create Property Modal -->
<Modal
  title="Create Property"
  open={addingProperty}
  onclose={() => (addingProperty = false)}
  totalSteps={3}
  currentStep={propertyStep}
  width="max-w-2xl"
>
  {#if hasRestoredDraft}
    <div
      class="mb-4 flex items-center justify-between rounded-lg bg-surface-muted p-2.5 text-xs border border-line"
    >
      <span class="text-ink-muted"
        >Unsaved progress was restored from your browser.</span
      >
      <button
        type="button"
        class="text-error font-medium hover:underline cursor-pointer"
        onclick={discardPropertyDraft}
      >
        Discard draft
      </button>
    </div>
  {/if}

  {#if propertyStep === 1}
    <div class="space-y-4">
      <p class="text-xs text-ink-muted">Step 1: Basic Property Information</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label="Property Name" error={propertyErrors.name} required>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              bind:value={propertyForm.name}
              placeholder="e.g. Serengeti Sunrise Lodge"
              error={invalid ? propertyErrors.name : null}
              oninput={savePropertyProgress}
            />
          {/snippet}
        </Field>

        <Field label="County / Region" error={propertyErrors.county} required>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              bind:value={propertyForm.county}
              placeholder="e.g. Nairobi"
              error={invalid ? propertyErrors.county : null}
              oninput={savePropertyProgress}
            />
          {/snippet}
        </Field>

        <Field label="Town / City" error={propertyErrors.town} required>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              bind:value={propertyForm.town}
              placeholder="e.g. Karen"
              error={invalid ? propertyErrors.town : null}
              oninput={savePropertyProgress}
            />
          {/snippet}
        </Field>

        <Field label="Address">
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              bind:value={propertyForm.address}
              placeholder="Physical street address"
              oninput={savePropertyProgress}
            />
          {/snippet}
        </Field>

        <Field label="Check-in Time">
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="time"
              bind:value={propertyForm.checkInTime}
              oninput={savePropertyProgress}
            />
          {/snippet}
        </Field>

        <Field label="Check-out Time">
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="time"
              bind:value={propertyForm.checkOutTime}
              oninput={savePropertyProgress}
            />
          {/snippet}
        </Field>

        <Field
          label="Deposit Required (%)"
          error={propertyErrors.depositPercent}
          hint="0 to 100 percent"
        >
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="number"
              min="0"
              max="100"
              bind:value={propertyForm.depositPercent}
              error={invalid ? propertyErrors.depositPercent : null}
              oninput={savePropertyProgress}
            />
          {/snippet}
        </Field>

        <Field label="Contact Phone">
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="tel"
              bind:value={propertyForm.phone}
              placeholder="+254 700 000 000"
              oninput={savePropertyProgress}
            />
          {/snippet}
        </Field>

        <div class="sm:col-span-2">
          <Field label="Contact Email">
            {#snippet children({ id, describedBy })}
              <Input
                {id}
                {describedBy}
                type="email"
                bind:value={propertyForm.email}
                placeholder="contact@property.com"
                oninput={savePropertyProgress}
              />
            {/snippet}
          </Field>
        </div>
      </div>
    </div>
  {:else if propertyStep === 2}
    <div class="space-y-4">
      <div>
        <p class="text-xs text-ink-muted">Step 2: Assign Property Owner</p>
        <p class="mt-0.5 text-sm text-ink">
          Choose whether to select an existing user or create a new user account
          as the owner.
        </p>
      </div>

      <!-- Mode toggle -->
      <div class="flex rounded-lg border border-line bg-surface-muted p-1">
        <button
          type="button"
          class="flex-1 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer {propertyForm.ownerMode ===
          'existing'
            ? 'bg-surface text-ink shadow-xs'
            : 'text-ink-muted hover:text-ink'}"
          onclick={() => {
            propertyForm.ownerMode = "existing";
            savePropertyProgress();
          }}
        >
          Pick Existing User ({accounts.length})
        </button>
        <button
          type="button"
          class="flex-1 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer {propertyForm.ownerMode ===
          'new'
            ? 'bg-surface text-ink shadow-xs'
            : 'text-ink-muted hover:text-ink'}"
          onclick={() => {
            propertyForm.ownerMode = "new";
            savePropertyProgress();
          }}
        >
          Create New User
        </button>
      </div>

      {#if propertyForm.ownerMode === "existing"}
        <div class="space-y-3">
          <div class="relative">
            <Search class="absolute left-2.5 top-2.5 size-4 text-ink-muted" />
            <input
              type="text"
              class="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
              placeholder="Filter users by name or email…"
              bind:value={ownerUserSearch}
            />
          </div>

          {#if propertyErrors.selectedUserId}
            <p class="text-xs text-error">{propertyErrors.selectedUserId}</p>
          {/if}

          <div
            class="max-h-56 overflow-y-auto divide-y divide-line rounded-lg border border-line bg-surface"
          >
            {#if filteredAccountsForOwner.length === 0}
              <div class="p-4 text-center text-xs text-ink-muted">
                No matching users found.
              </div>
            {:else}
              {#each filteredAccountsForOwner as user (user.id)}
                <label
                  class="flex items-center gap-3 p-3 hover:bg-surface-muted cursor-pointer transition-colors"
                >
                  <input
                    type="radio"
                    name="selectedOwner"
                    value={user.id}
                    checked={propertyForm.selectedUserId === user.id}
                    onchange={() => {
                      propertyForm.selectedUserId = user.id;
                      savePropertyProgress();
                    }}
                    class="size-4 text-ink focus:ring-ink"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-ink">{user.name}</p>
                    <p class="text-xs text-ink-muted">{user.email}</p>
                  </div>
                  <Badge tone={user.role === "admin" ? "info" : "neutral"}>
                    {user.role}
                  </Badge>
                </label>
              {/each}
            {/if}
          </div>
        </div>
      {:else}
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <Field
              label="Owner Name"
              error={propertyErrors.newOwnerName}
              required
            >
              {#snippet children({ id, describedBy, invalid })}
                <Input
                  {id}
                  {describedBy}
                  bind:value={propertyForm.newOwnerName}
                  placeholder="e.g. Jane Doe"
                  error={invalid ? propertyErrors.newOwnerName : null}
                  oninput={savePropertyProgress}
                />
              {/snippet}
            </Field>
          </div>

          <div class="sm:col-span-2">
            <Field
              label="Owner Email"
              error={propertyErrors.newOwnerEmail}
              required
            >
              {#snippet children({ id, describedBy, invalid })}
                <Input
                  {id}
                  {describedBy}
                  type="email"
                  bind:value={propertyForm.newOwnerEmail}
                  placeholder="jane@example.com"
                  error={invalid ? propertyErrors.newOwnerEmail : null}
                  oninput={savePropertyProgress}
                />
              {/snippet}
            </Field>
          </div>

          <div class="sm:col-span-2">
            <Field
              label="Temporary Password"
              error={propertyErrors.newOwnerPassword}
              hint="At least 10 characters. User will be asked to change on first login."
              required
            >
              {#snippet children({ id, describedBy, invalid })}
                <Input
                  {id}
                  {describedBy}
                  type="password"
                  bind:value={propertyForm.newOwnerPassword}
                  error={invalid ? propertyErrors.newOwnerPassword : null}
                  oninput={savePropertyProgress}
                />
              {/snippet}
            </Field>
          </div>
        </div>
      {/if}
    </div>
  {:else if propertyStep === 3}
    <div class="space-y-4">
      <p class="text-xs text-ink-muted">Step 3: Review and Confirm</p>

      <div class="rounded-lg border border-line bg-surface-muted p-4 space-y-3">
        <h4 class="font-semibold text-sm text-ink">{propertyForm.name}</h4>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span class="text-ink-muted">Location:</span>
            <span class="font-medium text-ink ml-1"
              >{propertyForm.town}, {propertyForm.county}</span
            >
          </div>
          <div>
            <span class="text-ink-muted">Deposit:</span>
            <span class="font-medium text-ink ml-1"
              >{propertyForm.depositPercent}%</span
            >
          </div>
          <div>
            <span class="text-ink-muted">Check In / Out:</span>
            <span class="font-medium text-ink ml-1"
              >{propertyForm.checkInTime} / {propertyForm.checkOutTime}</span
            >
          </div>
          {#if propertyForm.phone}
            <div>
              <span class="text-ink-muted">Phone:</span>
              <span class="font-medium text-ink ml-1">{propertyForm.phone}</span
              >
            </div>
          {/if}
        </div>

        <div class="border-t border-line pt-3 text-xs">
          <span class="text-ink-muted block mb-1">Assigned Owner:</span>
          {#if propertyForm.ownerMode === "existing"}
            {#if selectedOwnerAccount}
              <div class="flex items-center gap-2">
                <span class="font-semibold text-ink"
                  >{selectedOwnerAccount.name}</span
                >
                <span class="text-ink-muted"
                  >({selectedOwnerAccount.email})</span
                >
                <Badge tone="info">Existing account</Badge>
              </div>
            {:else}
              <span class="text-error">No owner selected</span>
            {/if}
          {:else}
            <div class="flex items-center gap-2">
              <span class="font-semibold text-ink"
                >{propertyForm.newOwnerName}</span
              >
              <span class="text-ink-muted">({propertyForm.newOwnerEmail})</span>
              <Badge tone="success">New user account will be created</Badge>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex items-center justify-between">
      {#if propertyStep > 1}
        <Button
          variant="secondary"
          onclick={prevPropertyStep}
          disabled={propertyBusy}
        >
          Back
        </Button>
      {:else}
        <div></div>
      {/if}

      <div class="flex gap-2">
        <Button
          variant="secondary"
          onclick={() => (addingProperty = false)}
          disabled={propertyBusy}
        >
          Cancel
        </Button>
        {#if propertyStep < 3}
          <Button onclick={nextPropertyStep}>Next Step</Button>
        {:else}
          <Button
            onclick={submitCreateProperty}
            loading={propertyBusy}
            disabled={propertyBusy}
          >
            Create Property
          </Button>
        {/if}
      </div>
    </div>
  {/snippet}
</Modal>

<!-- Edit Property Modal -->
<Modal
  title="Edit Property"
  open={editingProperty !== null}
  onclose={closeEditProperty}
  width="max-w-xl"
>
  {#if editingProperty}
    <div class="grid gap-3 sm:grid-cols-2">
      <Field label="Property Name" error={editPropertyErrors.name} required>
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            bind:value={editPropertyForm.name}
            error={invalid ? editPropertyErrors.name : null}
          />
        {/snippet}
      </Field>

      <Field label="County" error={editPropertyErrors.county} required>
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            bind:value={editPropertyForm.county}
            error={invalid ? editPropertyErrors.county : null}
          />
        {/snippet}
      </Field>

      <Field label="Town" error={editPropertyErrors.town} required>
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            bind:value={editPropertyForm.town}
            error={invalid ? editPropertyErrors.town : null}
          />
        {/snippet}
      </Field>

      <Field label="Address">
        {#snippet children({ id, describedBy })}
          <Input {id} {describedBy} bind:value={editPropertyForm.address} />
        {/snippet}
      </Field>

      <Field label="Check-in Time">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            type="time"
            bind:value={editPropertyForm.checkInTime}
          />
        {/snippet}
      </Field>

      <Field label="Check-out Time">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            type="time"
            bind:value={editPropertyForm.checkOutTime}
          />
        {/snippet}
      </Field>

      <Field
        label="Deposit Required (%)"
        error={editPropertyErrors.depositPercent}
      >
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            type="number"
            min="0"
            max="100"
            bind:value={editPropertyForm.depositPercent}
            error={invalid ? editPropertyErrors.depositPercent : null}
          />
        {/snippet}
      </Field>

      <Field label="Contact Phone">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            type="tel"
            bind:value={editPropertyForm.phone}
          />
        {/snippet}
      </Field>

      <div class="sm:col-span-2">
        <Field label="Contact Email">
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="email"
              bind:value={editPropertyForm.email}
            />
          {/snippet}
        </Field>
      </div>

      <div class="sm:col-span-2 flex items-center gap-2 pt-1">
        <label class="flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            bind:checked={editPropertyForm.isActive}
            class="size-4 rounded border-line text-ink focus:ring-ink"
          />
          <span>Property is active and accepting bookings</span>
        </label>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={closeEditProperty}
        disabled={editPropertyBusy}
      >
        Cancel
      </Button>
      <Button
        onclick={submitEditProperty}
        loading={editPropertyBusy}
        disabled={editPropertyBusy}
      >
        Save Changes
      </Button>
    </div>
  {/snippet}
</Modal>

<!-- Add Account Modal -->
<Modal
  title="Create User Account"
  open={addingAccount}
  onclose={() => (addingAccount = false)}
  width="max-w-md"
>
  <form id="add-account-form" onsubmit={submitAddAccount} class="space-y-3">
    <Field label="Full Name" required>
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          {describedBy}
          bind:value={accountName}
          placeholder="Jane Doe"
          required
        />
      {/snippet}
    </Field>

    <Field label="Email Address" required>
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          {describedBy}
          type="email"
          bind:value={accountEmail}
          placeholder="jane@example.com"
          required
        />
      {/snippet}
    </Field>

    <Field label="Role" required>
      {#snippet children({ id, describedBy })}
        <Select
          {id}
          {describedBy}
          bind:value={accountRole}
          options={[
            { value: "user", label: "User (Staff / Property Manager)" },
            { value: "admin", label: "System Administrator" },
          ]}
        />
      {/snippet}
    </Field>

    <Field
      label="Temporary Password"
      hint="Leave blank to let system generate one"
    >
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          {describedBy}
          type="password"
          bind:value={accountPassword}
          placeholder="Minimum 10 characters"
        />
      {/snippet}
    </Field>
  </form>

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={() => (addingAccount = false)}
        disabled={accountBusy}
      >
        Cancel
      </Button>
      <Button
        form="add-account-form"
        type="submit"
        loading={accountBusy}
        disabled={accountBusy}
      >
        Create Account
      </Button>
    </div>
  {/snippet}
</Modal>
