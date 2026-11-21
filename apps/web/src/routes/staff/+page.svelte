<!--
  src/routes/staff/+page.svelte
  The roster of the property.

  An owner may add existing or new users to the property roster,
  change their role, and reset temporary passwords.
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
  import { roleLabel } from "$lib/ui/status";
  import {
    Plus,
    KeyRound,
    UserMinus,
    Search,
    UserCheck,
    UserPlus,
  } from "lucide-svelte";

  type StaffMember = {
    id: number;
    userId: string;
    role: string;
    name: string;
    email: string;
    banned: boolean;
    mustChangePassword: boolean;
    createdAt: string;
  };

  type Account = {
    id: string;
    name: string;
    email: string;
    role: string;
  };

  const roleOptions = [
    { value: "owner", label: "Owner" },
    { value: "manager", label: "Manager" },
    { value: "receptionist", label: "Receptionist" },
    { value: "accountant", label: "Accountant" },
    { value: "staff", label: "Staff" },
  ];

  let staff = $state<StaffMember[]>([]);
  let allUsers = $state<Account[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Add staff modal state
  let adding = $state(false);
  let mode = $state<"existing" | "new">("existing");
  let selectedUserId = $state("");
  let userSearchQuery = $state("");
  let name = $state("");
  let email = $state("");
  let tempPassword = $state("");
  let role = $state("staff");
  let busy = $state(false);
  let fieldErrors = $state<Record<string, string>>({});

  async function load() {
    const propertyId = workspace.currentId;
    if (propertyId === null) {
      staff = [];
      return;
    }
    loading = true;
    error = null;
    try {
      const result = await api.get<{ data: StaffMember[] }>(
        `/properties/${propertyId}/staff`,
      );
      staff = result.data;
    } catch (err) {
      error =
        err instanceof ApiError && err.status === 403
          ? "Only an owner may look at the roster of a property."
          : err instanceof ApiError
            ? err.message
            : "The roster could not be loaded.";
      staff = [];
    } finally {
      loading = false;
    }
  }

  async function loadUsersIfAdmin() {
    if (!session.isAdmin) return;
    try {
      const res = await api.get<{ data: Account[] }>("/admin/users", {
        query: { limit: 100, offset: 0 },
      });
      allUsers = res.data;
      if (allUsers.length > 0 && !selectedUserId) {
        selectedUserId = allUsers[0].id;
      }
    } catch {
      allUsers = [];
    }
  }

  function openAddModal() {
    fieldErrors = {};
    name = "";
    email = "";
    tempPassword = "";
    role = "staff";
    mode = allUsers.length > 0 ? "existing" : "new";
    adding = true;
    void loadUsersIfAdmin();
  }

  function check(): boolean {
    const problems: Record<string, string> = {};
    if (mode === "existing") {
      if (!selectedUserId) problems.selectedUserId = "Please choose a user";
    } else {
      if (!name.trim()) problems.name = "A name is required.";
      if (!email.trim()) problems.email = "An email address is required.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        problems.email = "Invalid email format.";
      if (tempPassword.length < 10)
        problems.tempPassword = "Use at least 10 characters.";
    }
    fieldErrors = problems;
    return Object.keys(problems).length === 0;
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const propertyId = workspace.currentId;
    if (propertyId === null || !check()) return;
    busy = true;
    try {
      const payload =
        mode === "existing"
          ? { userId: selectedUserId, role }
          : {
              name: name.trim(),
              email: email.trim(),
              tempPassword,
              role,
            };

      await api.post(`/properties/${propertyId}/staff`, payload);
      toast.success(
        "Added to roster",
        mode === "new"
          ? `${name.trim()} must change the temporary password before working.`
          : "User assigned to property.",
      );
      adding = false;
      await load();
    } catch (err) {
      toast.error(
        "Could not add staff member",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      busy = false;
    }
  }

  async function setRole(member: StaffMember, nextRole: string) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      await api.patch(`/properties/${propertyId}/staff/${member.id}`, {
        role: nextRole,
      });
      toast.success(
        "Role changed",
        `${member.name} is now ${roleLabel(nextRole).toLowerCase()}.`,
      );
      await load();
    } catch (err) {
      toast.error(
        "Role could not be changed",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function resetPassword(member: StaffMember) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    const generated = `Neo${Math.random().toString(36).slice(2, 8)}${Math.floor(
      Math.random() * 100,
    )}`;
    try {
      await api.post(
        `/properties/${propertyId}/staff/${member.id}/reset-password`,
        { newPassword: generated },
      );
      toast.success(`Temporary password for ${member.name}`, generated);
    } catch (err) {
      toast.error(
        "Password could not be reset",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function remove(member: StaffMember) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    if (
      !confirm(
        `Remove ${member.name} from this property? They will no longer have access.`,
      )
    ) {
      return;
    }
    try {
      await api.delete(`/properties/${propertyId}/staff/${member.id}`);
      toast.success("Removed from roster", `${member.name} has been removed.`);
      await load();
    } catch (err) {
      toast.error(
        "Could not remove member",
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
    await loadUsersIfAdmin();
  });

  $effect(() => {
    const id = workspace.currentId;
    if (id !== null && session.isSignedIn) void load();
  });

  const filteredUsers = $derived(
    allUsers.filter((u) => {
      // Don't show users already on this property roster
      if (staff.some((s) => s.userId === u.id)) return false;
      if (!userSearchQuery.trim()) return true;
      const q = userSearchQuery.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }),
  );
</script>

<PageHeader
  title="Staff"
  description="The roster of the property and who is allowed to work here."
>
  {#snippet actions()}
    <Button onclick={openAddModal}>
      <Plus class="size-4 mr-1.5" />
      Add Member
    </Button>
  {/snippet}
</PageHeader>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else if error}
  <div class="panel p-6">
    <p class="text-sm text-error">{error}</p>
  </div>
{:else if loading && staff.length === 0}
  <div class="panel p-6 text-center text-sm text-ink-muted">
    Loading roster…
  </div>
{:else if staff.length === 0}
  <div class="panel">
    <Empty
      title="Nobody on the roster"
      description="Add team members to allow them to manage bookings and rooms in this property."
    />
  </div>
{:else}
  <Card padded={false}>
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-sm">
        <thead class="border-b border-line bg-surface-muted">
          <tr class="text-left">
            <th class="px-4 py-2.5 font-medium text-ink-700">Staff Member</th>
            <th class="px-4 py-2.5 font-medium text-ink-700">Email</th>
            <th class="px-4 py-2.5 font-medium text-ink-700">Assigned Role</th>
            <th class="px-4 py-2.5 font-medium text-ink-700">Account Status</th>
            <th class="px-4 py-2.5 text-right font-medium text-ink-700"
              >Actions</th
            >
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          {#each staff as member (member.id)}
            <tr class="hover:bg-surface-muted transition-colors">
              <td class="px-4 py-3 font-medium text-ink">{member.name}</td>
              <td class="px-4 py-3 text-ink-muted">{member.email}</td>
              <td class="px-4 py-3">
                {#if session.isAdmin || workspace.current?.role === "owner"}
                  <div class="w-36">
                    <Select
                      value={member.role}
                      options={roleOptions}
                      onchange={(next) => setRole(member, next)}
                    />
                  </div>
                {:else}
                  <Badge>{roleLabel(member.role)}</Badge>
                {/if}
              </td>
              <td class="px-4 py-3">
                {#if member.banned}
                  <Badge tone="error">Banned</Badge>
                {:else if member.mustChangePassword}
                  <Badge tone="warning">Must change password</Badge>
                {:else}
                  <Badge tone="success">Active</Badge>
                {/if}
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onclick={() => resetPassword(member)}
                    title="Generate temporary password"
                  >
                    <KeyRound class="size-3.5 mr-1" />
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onclick={() => remove(member)}
                    title="Remove from roster"
                  >
                    <UserMinus class="size-3.5 text-error" />
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

<!-- Add Staff Modal -->
<Modal
  title="Add Staff Member"
  open={adding}
  onclose={() => (adding = false)}
  width="max-w-lg"
>
  <form id="add-staff-form" class="space-y-4" onsubmit={add} novalidate>
    {#if allUsers.length > 0}
      <!-- Mode selection toggle -->
      <div class="flex rounded-lg border border-line bg-surface-muted p-1">
        <button
          type="button"
          class="flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer {mode ===
          'existing'
            ? 'bg-surface text-ink shadow-xs'
            : 'text-ink-muted hover:text-ink'}"
          onclick={() => (mode = "existing")}
        >
          <UserCheck class="size-3.5" />
          Pick Existing User ({allUsers.length})
        </button>
        <button
          type="button"
          class="flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer {mode ===
          'new'
            ? 'bg-surface text-ink shadow-xs'
            : 'text-ink-muted hover:text-ink'}"
          onclick={() => (mode = "new")}
        >
          <UserPlus class="size-3.5" />
          Create New Account
        </button>
      </div>
    {/if}

    {#if mode === "existing" && allUsers.length > 0}
      <div class="space-y-3">
        <div class="relative">
          <Search class="absolute left-2.5 top-2.5 size-4 text-ink-muted" />
          <input
            type="text"
            class="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
            placeholder="Search users by name or email…"
            bind:value={userSearchQuery}
          />
        </div>

        {#if fieldErrors.selectedUserId}
          <p class="text-xs text-error">{fieldErrors.selectedUserId}</p>
        {/if}

        <div
          class="max-h-48 overflow-y-auto divide-y divide-line rounded-lg border border-line bg-surface"
        >
          {#if filteredUsers.length === 0}
            <div class="p-3 text-center text-xs text-ink-muted">
              No available users found. Switch to "Create New Account".
            </div>
          {:else}
            {#each filteredUsers as user (user.id)}
              <label
                class="flex items-center gap-3 p-2.5 hover:bg-surface-muted cursor-pointer transition-colors"
              >
                <input
                  type="radio"
                  name="selectedStaffUser"
                  value={user.id}
                  checked={selectedUserId === user.id}
                  onchange={() => (selectedUserId = user.id)}
                  class="size-4 text-ink focus:ring-ink"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium text-ink">{user.name}</p>
                  <p class="text-xs text-ink-muted">{user.email}</p>
                </div>
              </label>
            {/each}
          {/if}
        </div>
      </div>
    {:else}
      <div class="space-y-3">
        <Field label="Full Name" error={fieldErrors.name} required>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              bind:value={name}
              error={invalid ? fieldErrors.name : null}
              autocomplete="name"
              placeholder="Jane Mwangi"
              required
            />
          {/snippet}
        </Field>

        <Field label="Email Address" error={fieldErrors.email} required>
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="email"
              bind:value={email}
              error={invalid ? fieldErrors.email : null}
              autocomplete="email"
              placeholder="jane@property.com"
              required
            />
          {/snippet}
        </Field>

        <Field
          label="Temporary Password"
          error={fieldErrors.tempPassword}
          hint="At least 10 characters. User must change on first login."
          required
        >
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="password"
              bind:value={tempPassword}
              error={invalid ? fieldErrors.tempPassword : null}
              autocomplete="off"
              required
            />
          {/snippet}
        </Field>
      </div>
    {/if}

    <Field label="Property Role" required>
      {#snippet children({ id, describedBy })}
        <Select {id} {describedBy} bind:value={role} options={roleOptions} />
      {/snippet}
    </Field>
  </form>

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={() => (adding = false)}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button
        form="add-staff-form"
        type="submit"
        loading={busy}
        disabled={busy}
      >
        Add to Roster
      </Button>
    </div>
  {/snippet}
</Modal>
