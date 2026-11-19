<!--
  src/routes/admin/+page.svelte
  Administration.

  The global administrator's view: the properties of the installation
  and the accounts of the people who use it. An administrator cannot be
  changed by anybody else, and cannot change another administrator.
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
  import { toast } from "$lib/components/ui/toast.svelte";
  import { formatDate, roleLabel } from "$lib/ui/status";

  type Property = {
    id: number;
    name: string;
    slug: string;
    county: string;
    town: string;
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

  let properties = $state<Property[]>([]);
  let accounts = $state<Account[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let tab = $state<"properties" | "accounts">("properties");

  // The form for a new property.
  let addingProperty = $state(false);
  let propertyName = $state("");
  let county = $state("");
  let town = $state("");
  let ownerName = $state("");
  let ownerEmail = $state("");
  let ownerPassword = $state("");
  let busy = $state(false);
  let fieldErrors = $state<Record<string, string>>({});

  // The form for a new account.
  let addingAccount = $state(false);
  let accountName = $state("");
  let accountEmail = $state("");
  let accountRole = $state("user");
  let accountPassword = $state("");

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

  function checkProperty(): boolean {
    const problems: Record<string, string> = {};
    if (!propertyName.trim()) problems.propertyName = "A name is required.";
    if (!county.trim()) problems.county = "A county is required.";
    if (!town.trim()) problems.town = "A town is required.";
    if (!ownerName.trim()) problems.ownerName = "The owner's name is required.";
    if (!ownerEmail.trim())
      problems.ownerEmail = "An email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim()))
      problems.ownerEmail = "That does not look like an email address.";
    if (ownerPassword.length < 10)
      problems.ownerPassword = "Use at least 10 characters.";
    fieldErrors = problems;
    return Object.keys(problems).length === 0;
  }

  async function addProperty(event: SubmitEvent) {
    event.preventDefault();
    if (!checkProperty()) return;
    busy = true;
    try {
      await api.post("/admin/properties", {
        name: propertyName.trim(),
        county: county.trim(),
        town: town.trim(),
        owner: {
          name: ownerName.trim(),
          email: ownerEmail.trim(),
          tempPassword: ownerPassword,
        },
      });
      toast.success(
        "The property has been created",
        `${ownerName.trim()} is its owner.`,
      );
      propertyName = "";
      county = "";
      town = "";
      ownerName = "";
      ownerEmail = "";
      ownerPassword = "";
      addingProperty = false;
      await load();
      await workspace.load();
    } catch (err) {
      toast.error(
        "The property could not be created",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      busy = false;
    }
  }

  async function addAccount(event: SubmitEvent) {
    event.preventDefault();
    if (!accountName.trim() || !accountEmail.trim()) {
      toast.error("A name and an email address are required.");
      return;
    }
    busy = true;
    try {
      await api.post("/admin/users", {
        name: accountName.trim(),
        email: accountEmail.trim(),
        role: accountRole,
        tempPassword: accountPassword || undefined,
      });
      toast.success(
        "The account has been created",
        accountPassword
          ? "They must change the temporary password before working."
          : undefined,
      );
      accountName = "";
      accountEmail = "";
      accountRole = "user";
      accountPassword = "";
      addingAccount = false;
      await load();
    } catch (err) {
      toast.error(
        "The account could not be created",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      busy = false;
    }
  }

  async function setRole(account: Account, role: string) {
    try {
      await api.patch(`/admin/users/${account.id}`, { role });
      toast.success(`${account.name} is now ${roleLabel(role).toLowerCase()}`);
      await load();
    } catch (err) {
      toast.error(
        "The role could not be changed",
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
        "They could not be banned",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function unban(account: Account) {
    try {
      await api.post(`/admin/users/${account.id}/unban`);
      toast.success(`${account.name} may sign in again`);
      await load();
    } catch (err) {
      toast.error(
        "They could not be unbanned",
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
      toast.success(`A new password for ${account.name}`, generated);
    } catch (err) {
      toast.error(
        "The password could not be changed",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  onMount(async () => {
    if (!session.loading && !session.isSignedIn) {
      await goto("/login", { replaceState: true });
      return;
    }
    // Only an administrator may be here.
    if (session.isSignedIn && !session.isAdmin) {
      await goto("/", { replaceState: true });
      return;
    }
    await load();
  });
</script>

<PageHeader
  title="Administration"
  description="The properties of this installation and the accounts of the people who use it."
/>

{#if error}
  <div class="panel p-6">
    <p class="text-sm text-error">{error}</p>
  </div>
{:else if loading && properties.length === 0 && accounts.length === 0}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else}
  <div class="mb-4 flex gap-1 border-b border-line">
    {#each [{ key: "properties", label: `Properties (${properties.length})` }, { key: "accounts", label: `Accounts (${accounts.length})` }] as option (option.key)}
      <button
        type="button"
        class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors {tab ===
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
    <div class="mb-4 flex justify-end">
      <Button onclick={() => (addingProperty = !addingProperty)}>
        {addingProperty ? "Close" : "Add a property"}
      </Button>
    </div>

    {#if addingProperty}
      <div class="mb-4">
        <Card title="A new property">
          <form
            class="grid gap-4 sm:grid-cols-2"
            onsubmit={addProperty}
            novalidate
          >
            <Field
              label="Name of the property"
              error={fieldErrors.propertyName}
              required
            >
              {#snippet children({ id, describedBy, invalid })}
                <Input
                  {id}
                  {describedBy}
                  bind:value={propertyName}
                  error={invalid ? fieldErrors.propertyName : null}
                  placeholder="Lakeside Lodge"
                  required
                />
              {/snippet}
            </Field>
            <Field label="County" error={fieldErrors.county} required>
              {#snippet children({ id, describedBy, invalid })}
                <Input
                  {id}
                  {describedBy}
                  bind:value={county}
                  error={invalid ? fieldErrors.county : null}
                  required
                />
              {/snippet}
            </Field>
            <Field label="Town" error={fieldErrors.town} required>
              {#snippet children({ id, describedBy, invalid })}
                <Input
                  {id}
                  {describedBy}
                  bind:value={town}
                  error={invalid ? fieldErrors.town : null}
                  required
                />
              {/snippet}
            </Field>
            <div class="sm:col-span-2">
              <p class="text-xs font-medium text-ink-700">The first owner</p>
              <p class="mt-0.5 text-xs text-ink-muted">
                The owner may manage everybody below them.
              </p>
            </div>
            <Field label="Owner's name" error={fieldErrors.ownerName} required>
              {#snippet children({ id, describedBy, invalid })}
                <Input
                  {id}
                  {describedBy}
                  bind:value={ownerName}
                  error={invalid ? fieldErrors.ownerName : null}
                  autocomplete="name"
                  required
                />
              {/snippet}
            </Field>
            <Field
              label="Owner's email"
              error={fieldErrors.ownerEmail}
              required
            >
              {#snippet children({ id, describedBy, invalid })}
                <Input
                  {id}
                  {describedBy}
                  type="email"
                  bind:value={ownerEmail}
                  error={invalid ? fieldErrors.ownerEmail : null}
                  autocomplete="email"
                  required
                />
              {/snippet}
            </Field>
            <Field
              label="Temporary password"
              error={fieldErrors.ownerPassword}
              hint="At least 10 characters. They will be asked to change it."
              required
            >
              {#snippet children({ id, describedBy, invalid })}
                <Input
                  {id}
                  {describedBy}
                  bind:value={ownerPassword}
                  error={invalid ? fieldErrors.ownerPassword : null}
                  autocomplete="off"
                  required
                />
              {/snippet}
            </Field>
            <div class="flex items-end sm:col-span-2">
              <Button type="submit" loading={busy}>Create the property</Button>
            </div>
          </form>
        </Card>
      </div>
    {/if}

    {#if properties.length === 0}
      <div class="panel">
        <Empty
          title="No properties"
          description="Create the first property to get started."
        />
      </div>
    {:else}
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each properties as property (property.id)}
          <div class="panel p-4">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-base font-semibold text-ink">{property.name}</p>
                <p class="mt-0.5 truncate text-xs text-ink-muted">
                  {property.town}, {property.county}
                </p>
              </div>
              {#if property.isActive}
                <Badge tone="success">Active</Badge>
              {:else}
                <Badge tone="neutral">Inactive</Badge>
              {/if}
            </div>
            <dl class="mt-3 space-y-1 border-t border-line pt-3 text-xs">
              <div class="flex justify-between gap-2">
                <dt class="text-ink-muted">Check in</dt>
                <dd class="font-medium text-ink tabular-nums">
                  {property.checkInTime}
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-ink-muted">Check out</dt>
                <dd class="font-medium text-ink tabular-nums">
                  {property.checkOutTime}
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-ink-muted">Deposit</dt>
                <dd class="font-medium text-ink tabular-nums">
                  {property.depositPercent}%
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt class="text-ink-muted">Address on the web</dt>
                <dd class="truncate font-mono text-ink-faint">
                  /{property.slug}
                </dd>
              </div>
            </dl>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="mb-4 flex justify-end">
      <Button onclick={() => (addingAccount = !addingAccount)}>
        {addingAccount ? "Close" : "Add an account"}
      </Button>
    </div>

    {#if addingAccount}
      <div class="mb-4">
        <Card title="A new account">
          <form
            class="grid gap-4 sm:grid-cols-2"
            onsubmit={addAccount}
            novalidate
          >
            <Field label="Name" required>
              {#snippet children({ id, describedBy })}
                <Input
                  {id}
                  {describedBy}
                  bind:value={accountName}
                  autocomplete="name"
                  required
                />
              {/snippet}
            </Field>
            <Field label="Email address" required>
              {#snippet children({ id, describedBy })}
                <Input
                  {id}
                  {describedBy}
                  type="email"
                  bind:value={accountEmail}
                  autocomplete="email"
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
                    { value: "user", label: "User" },
                    { value: "admin", label: "Administrator" },
                  ]}
                />
              {/snippet}
            </Field>
            <Field
              label="Temporary password"
              hint="Leave empty to have one made for you."
            >
              {#snippet children({ id, describedBy })}
                <Input
                  {id}
                  {describedBy}
                  bind:value={accountPassword}
                  autocomplete="off"
                />
              {/snippet}
            </Field>
            <div class="sm:col-span-2">
              <Button type="submit" loading={busy}>Create the account</Button>
            </div>
          </form>
        </Card>
      </div>
    {/if}

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
                <th class="px-4 py-2.5 font-medium text-ink-700">State</th>
                <th class="px-4 py-2.5 font-medium text-ink-700">Created</th>
                <th class="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              {#each accounts as account (account.id)}
                <tr class="hover:bg-surface-muted">
                  <td class="px-4 py-3 font-medium text-ink">{account.name}</td>
                  <td class="px-4 py-3 text-ink-muted">{account.email}</td>
                  <td class="px-4 py-3">
                    {#if account.id === session.user?.id}
                      <Badge>{roleLabel(account.role)}</Badge>
                    {:else}
                      <div class="w-40">
                        <Select
                          value={account.role}
                          options={[
                            { value: "user", label: "User" },
                            { value: "admin", label: "Administrator" },
                          ]}
                          onchange={(role) => setRole(account, role)}
                        />
                      </div>
                    {/if}
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
                    <div class="flex justify-end gap-1.5">
                      {#if account.id !== session.user?.id}
                        <Button
                          size="sm"
                          variant="secondary"
                          onclick={() => resetPassword(account)}
                        >
                          New password
                        </Button>
                        {#if account.banned}
                          <Button
                            size="sm"
                            variant="ghost"
                            onclick={() => unban(account)}
                          >
                            Unban
                          </Button>
                        {:else}
                          <Button
                            size="sm"
                            variant="ghost"
                            onclick={() => ban(account)}
                          >
                            Ban
                          </Button>
                        {/if}
                      {/if}
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
{/if}
