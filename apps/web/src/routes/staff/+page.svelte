<!--
  src/routes/staff/+page.svelte
  The roster of the property.

  An owner may add people, change their role and give them a new
  temporary password. Nobody may change an administrator.
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
  import { toast } from "$lib/components/ui/toast.svelte";
  import { roleLabel } from "$lib/ui/status";

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

  const roleOptions = [
    { value: "owner", label: "Owner" },
    { value: "manager", label: "Manager" },
    { value: "receptionist", label: "Receptionist" },
    { value: "accountant", label: "Accountant" },
    { value: "staff", label: "Staff" },
  ];

  let staff = $state<StaffMember[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // The form for adding somebody.
  let adding = $state(false);
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

  function check(): boolean {
    const problems: Record<string, string> = {};
    if (!name.trim()) problems.name = "A name is required.";
    if (!email.trim()) problems.email = "An email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      problems.email = "That does not look like an email address.";
    if (tempPassword.length < 10)
      problems.tempPassword = "Use at least 10 characters.";
    fieldErrors = problems;
    return Object.keys(problems).length === 0;
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    const propertyId = workspace.currentId;
    if (propertyId === null || !check()) return;
    busy = true;
    try {
      await api.post(`/properties/${propertyId}/staff`, {
        name: name.trim(),
        email: email.trim(),
        tempPassword,
        role,
      });
      toast.success(
        "Added to the roster",
        `${name.trim()} must change the temporary password before working.`,
      );
      name = "";
      email = "";
      tempPassword = "";
      role = "staff";
      adding = false;
      await load();
    } catch (err) {
      toast.error(
        "They could not be added",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      busy = false;
    }
  }

  async function setRole(member: StaffMember, next: string) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      await api.patch(`/properties/${propertyId}/staff/${member.id}`, {
        role: next,
      });
      toast.success(`${member.name} is now ${roleLabel(next).toLowerCase()}`);
      await load();
    } catch (err) {
      toast.error(
        "The role could not be changed",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function resetPassword(member: StaffMember) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    // A password of one's own: the owner never sees it in the clear.
    const generated = `Neo${Math.random().toString(36).slice(2, 8)}${Math.floor(
      Math.random() * 100,
    )}`;
    try {
      await api.post(
        `/properties/${propertyId}/staff/${member.id}/reset-password`,
        { newPassword: generated },
      );
      toast.success(`A new password for ${member.name}`, generated);
    } catch (err) {
      toast.error(
        "The password could not be changed",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function remove(member: StaffMember) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    if (!confirm(`Remove ${member.name} from the roster?`)) return;
    try {
      await api.delete(`/properties/${propertyId}/staff/${member.id}`);
      toast.success(`${member.name} is no longer on the roster`);
      await load();
    } catch (err) {
      toast.error(
        "They could not be removed",
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
</script>

<PageHeader title="Staff" description="The people who work in this property.">
  {#snippet actions()}
    <Button onclick={() => (adding = !adding)}>
      {adding ? "Close" : "Add somebody"}
    </Button>
  {/snippet}
</PageHeader>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else}
  {#if adding}
    <div class="mb-4">
      <Card title="Add somebody to the roster">
        <form class="grid gap-4 sm:grid-cols-2" onsubmit={add} novalidate>
          <Field label="Name" error={fieldErrors.name} required>
            {#snippet children({ id, describedBy, invalid })}
              <Input
                {id}
                {describedBy}
                bind:value={name}
                error={invalid ? fieldErrors.name : null}
                autocomplete="name"
                required
              />
            {/snippet}
          </Field>
          <Field label="Email address" error={fieldErrors.email} required>
            {#snippet children({ id, describedBy, invalid })}
              <Input
                {id}
                {describedBy}
                type="email"
                bind:value={email}
                error={invalid ? fieldErrors.email : null}
                autocomplete="email"
                required
              />
            {/snippet}
          </Field>
          <Field
            label="Temporary password"
            error={fieldErrors.tempPassword}
            hint="At least 10 characters. They will be asked to change it."
            required
          >
            {#snippet children({ id, describedBy, invalid })}
              <Input
                {id}
                {describedBy}
                bind:value={tempPassword}
                error={invalid ? fieldErrors.tempPassword : null}
                autocomplete="off"
                required
              />
            {/snippet}
          </Field>
          <Field label="Role" required>
            {#snippet children({ id, describedBy })}
              <Select
                {id}
                {describedBy}
                bind:value={role}
                options={roleOptions}
              />
            {/snippet}
          </Field>
          <div class="sm:col-span-2">
            <Button type="submit" loading={busy}>Add to the roster</Button>
          </div>
        </form>
      </Card>
    </div>
  {/if}

  {#if error}
    <div class="panel p-6">
      <p class="text-sm text-error">{error}</p>
    </div>
  {:else if loading && staff.length === 0}
    <div class="panel p-6 text-center text-sm text-ink-muted">
      Loading the roster…
    </div>
  {:else if staff.length === 0}
    <div class="panel">
      <Empty
        title="Nobody on the roster"
        description="Add somebody to let them work in this property."
      />
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
              <th class="px-4 py-2.5 font-medium text-ink-700">State</th>
              <th class="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            {#each staff as member (member.id)}
              <tr class="hover:bg-surface-muted">
                <td class="px-4 py-3 font-medium text-ink">{member.name}</td>
                <td class="px-4 py-3 text-ink-muted">{member.email}</td>
                <td class="px-4 py-3">
                  {#if session.isAdmin}
                    <div class="w-40">
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
                  <div class="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onclick={() => resetPassword(member)}
                    >
                      New password
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onclick={() => remove(member)}
                    >
                      Remove
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
{/if}
