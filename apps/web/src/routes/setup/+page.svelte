<!--
  src/routes/setup/+page.svelte
  The first-run installation.

  It appears once, on a system that has never been installed. It creates
  the first administrator and nothing else: after that the page is
  closed.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api, ApiError } from "$lib/api/client";
  import { setupStatus, session } from "$lib/api/session.svelte";
  import Alert from "$lib/components/ui/Alert.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Logo from "$lib/components/shell/Logo.svelte";

  let checking = $state(true);
  let needsSetup = $state(true);
  let tokenRequired = $state(false);

  let name = $state("");
  let email = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let setupToken = $state("");

  let busy = $state(false);
  let error = $state<string | null>(null);
  let fieldErrors = $state<Record<string, string>>({});

  onMount(async () => {
    try {
      const status = await setupStatus();
      needsSetup = status.needsSetup;
      tokenRequired = status.setupTokenRequired;
    } catch {
      error = "The server could not be reached. Check the connection.";
    } finally {
      checking = false;
    }
  });

  /** The checks that can be made here, without the server. */
  function check(): boolean {
    const problems: Record<string, string> = {};
    if (!name.trim()) problems.name = "A name is required.";
    if (!email.trim()) problems.email = "An email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      problems.email = "That does not look like an email address.";
    if (password.length < 10) problems.password = "Use at least 10 characters.";
    if (password !== confirmPassword)
      problems.confirmPassword = "The two passwords do not match.";
    fieldErrors = problems;
    return Object.keys(problems).length === 0;
  }

  async function install(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    if (!check()) return;

    busy = true;
    try {
      await api.post("/setup", {
        name: name.trim(),
        email: email.trim(),
        password,
        ...(tokenRequired ? { setupToken } : {}),
      });
      // The installation creates the account but does not open a session,
      // so the installer signs in with the password they have just chosen.
      await api.post("/api/auth/sign-in/email", {
        email: email.trim(),
        password,
      });
      await session.load();
      await goto("/", { replaceState: true });
    } catch (err) {
      if (err instanceof ApiError) {
        error =
          err.code === "SETUP_COMPLETE"
            ? "This system has already been installed."
            : err.message;
        if (err.code === "SETUP_COMPLETE") needsSetup = false;
      } else {
        error = "The installation could not be completed.";
      }
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex min-h-dvh items-center justify-center px-4 py-12">
  <div class="w-full max-w-md">
    <div class="mb-8 flex flex-col items-center text-center">
      <Logo size="lg" />
      <h1 class="mt-5 text-xl font-semibold tracking-tight text-ink">
        Welcome
      </h1>
      <p class="mt-1.5 text-sm text-ink-muted">
        Set up the first administrator for this installation.
      </p>
    </div>

    {#if checking}
      <div class="panel p-6 text-center text-sm text-ink-muted">
        Checking the installation…
      </div>
    {:else if !needsSetup}
      <div class="panel p-6">
        <Alert tone="info" title="Already installed">
          This system has been installed. Sign in with your account.
        </Alert>
        <div class="mt-4">
          <Button full href="/login">Go to the sign-in</Button>
        </div>
      </div>
    {:else}
      <form class="panel p-6" onsubmit={install} novalidate>
        {#if error}
          <div class="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        {/if}

        {#if tokenRequired}
          <div class="mb-4">
            <Alert tone="warning" title="A setup token is required">
              This installation was started with a setup token. Enter it below
              to claim the system.
            </Alert>
          </div>
        {/if}

        <div class="space-y-4">
          <Field label="Name" error={fieldErrors.name} required>
            {#snippet children({ id, describedBy, invalid })}
              <Input
                {id}
                {describedBy}
                bind:value={name}
                error={invalid ? fieldErrors.name : null}
                autocomplete="name"
                placeholder="Jane Doe"
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
                placeholder="jane@example.com"
                required
              />
            {/snippet}
          </Field>

          {#if tokenRequired}
            <Field label="Setup token" required>
              {#snippet children({ id, describedBy })}
                <Input
                  {id}
                  {describedBy}
                  bind:value={setupToken}
                  autocomplete="off"
                  required
                />
              {/snippet}
            </Field>
          {/if}

          <Field
            label="Password"
            error={fieldErrors.password}
            hint="At least 10 characters."
            required
          >
            {#snippet children({ id, describedBy, invalid })}
              <Input
                {id}
                {describedBy}
                type="password"
                bind:value={password}
                error={invalid ? fieldErrors.password : null}
                autocomplete="new-password"
                required
              />
            {/snippet}
          </Field>

          <Field
            label="Confirm the password"
            error={fieldErrors.confirmPassword}
            required
          >
            {#snippet children({ id, describedBy, invalid })}
              <Input
                {id}
                {describedBy}
                type="password"
                bind:value={confirmPassword}
                error={invalid ? fieldErrors.confirmPassword : null}
                autocomplete="new-password"
                required
              />
            {/snippet}
          </Field>
        </div>

        <div class="mt-6">
          <Button type="submit" full size="lg" loading={busy}>
            {busy ? "Installing…" : "Install and sign in"}
          </Button>
        </div>
      </form>
    {/if}
  </div>
</div>
