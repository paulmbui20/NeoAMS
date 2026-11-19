<!--
  src/routes/login/+page.svelte
  Signing in.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api, ApiError } from "$lib/api/client";
  import { session, setupStatus } from "$lib/api/session.svelte";
  import Alert from "$lib/components/ui/Alert.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Logo from "$lib/components/shell/Logo.svelte";

  let email = $state("");
  let password = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let tooMany = $state(false);

  onMount(async () => {
    // A system that has never been installed sends the person to the setup.
    try {
      const status = await setupStatus();
      if (status.needsSetup) await goto("/setup", { replaceState: true });
    } catch {
      /* the sign-in form is still worth showing */
    }
    // Somebody who is already signed in has no business here.
    if (session.isSignedIn) await goto("/", { replaceState: true });
  });

  async function signIn(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    tooMany = false;
    busy = true;
    try {
      await api.post("/api/auth/sign-in/email", {
        email: email.trim(),
        password,
      });
      await session.load();
      if (session.mustChangePassword) {
        await goto("/change-password", { replaceState: true });
      } else {
        await goto("/", { replaceState: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          tooMany = true;
          error = "Too many sign-in attempts. Wait a moment and try again.";
        } else if (err.status === 401) {
          error = "That email address and password do not match.";
        } else {
          error = err.message;
        }
      } else {
        error = "The sign-in could not be completed.";
      }
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex min-h-dvh items-center justify-center px-4 py-12">
  <div class="w-full max-w-sm">
    <div class="mb-8 flex flex-col items-center text-center">
      <Logo size="lg" />
      <h1 class="mt-5 text-xl font-semibold tracking-tight text-ink">
        Sign in
      </h1>
      <p class="mt-1.5 text-sm text-ink-muted">
        The staff dashboard of your property.
      </p>
    </div>

    <form class="panel p-6" onsubmit={signIn} novalidate>
      {#if error}
        <div class="mb-4">
          <Alert tone={tooMany ? "warning" : "error"}>{error}</Alert>
        </div>
      {/if}

      <div class="space-y-4">
        <Field label="Email address" required>
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="email"
              bind:value={email}
              autocomplete="email"
              placeholder="you@example.com"
              required
            />
          {/snippet}
        </Field>

        <Field label="Password" required>
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="password"
              bind:value={password}
              autocomplete="current-password"
              required
            />
          {/snippet}
        </Field>
      </div>

      <div class="mt-6">
        <Button type="submit" full size="lg" loading={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </div>
    </form>

    <p class="mt-6 text-center text-xs text-ink-muted">
      Accounts are created by an administrator. There is no public sign-up.
    </p>
  </div>
</div>
