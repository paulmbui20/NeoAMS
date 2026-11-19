<!--
  src/routes/change-password/+page.svelte
  Changing one's own password.

  Every account that was created with a temporary password is sent here
  and cannot go anywhere else until the password has been changed.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api, ApiError } from "$lib/api/client";
  import { session } from "$lib/api/session.svelte";
  import Alert from "$lib/components/ui/Alert.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Logo from "$lib/components/shell/Logo.svelte";

  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");

  let busy = $state(false);
  let error = $state<string | null>(null);
  let fieldErrors = $state<Record<string, string>>({});
  let done = $state(false);

  onMount(async () => {
    // Without a session there is nothing to change.
    if (!session.loading && !session.isSignedIn) {
      await goto("/login", { replaceState: true });
    }
  });

  /** The checks that can be made here, without the server. */
  function check(): boolean {
    const problems: Record<string, string> = {};
    if (!currentPassword) problems.currentPassword = "Enter your password.";
    if (newPassword.length < 10)
      problems.newPassword = "Use at least 10 characters.";
    else if (newPassword === currentPassword)
      problems.newPassword = "The new password must be different.";
    if (newPassword !== confirmPassword)
      problems.confirmPassword = "The two passwords do not match.";
    fieldErrors = problems;
    return Object.keys(problems).length === 0;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    done = false;
    if (!check()) return;

    busy = true;
    try {
      await api.post("/me/password", { currentPassword, newPassword });
      // Read the session again: the server now knows the password is settled.
      await session.load();
      currentPassword = "";
      newPassword = "";
      confirmPassword = "";
      done = true;
      // A moment to read the confirmation, then on to the dashboard.
      setTimeout(() => goto("/", { replaceState: true }), 600);
    } catch (err) {
      if (err instanceof ApiError) {
        // Better Auth says "INVALID_EMAIL_OR_PASSWORD" when the current
        // password is wrong; the person needs to know which one it was.
        error =
          err.code === "INVALID_EMAIL_OR_PASSWORD" ||
          err.message.toLowerCase().includes("password")
            ? "The current password is not correct."
            : err.message;
      } else {
        error = "The password could not be changed.";
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
        Change your password
      </h1>
      <p class="mt-1.5 text-sm text-ink-muted">
        Choose a password of at least 10 characters.
      </p>
    </div>

    {#if session.mustChangePassword}
      <div class="mb-4">
        <Alert tone="warning" title="A new password is required">
          This account was given a temporary password. Choose your own before
          you carry on.
        </Alert>
      </div>
    {/if}

    <form class="panel p-6" onsubmit={submit} novalidate>
      {#if error}
        <div class="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      {/if}
      {#if done}
        <div class="mb-4">
          <Alert tone="success">Your password has been changed.</Alert>
        </div>
      {/if}

      <div class="space-y-4">
        <Field
          label="Current password"
          error={fieldErrors.currentPassword}
          required
        >
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="password"
              bind:value={currentPassword}
              error={invalid ? fieldErrors.currentPassword : null}
              autocomplete="current-password"
              required
            />
          {/snippet}
        </Field>

        <Field
          label="New password"
          error={fieldErrors.newPassword}
          hint="At least 10 characters."
          required
        >
          {#snippet children({ id, describedBy, invalid })}
            <Input
              {id}
              {describedBy}
              type="password"
              bind:value={newPassword}
              error={invalid ? fieldErrors.newPassword : null}
              autocomplete="new-password"
              required
            />
          {/snippet}
        </Field>

        <Field
          label="Confirm the new password"
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
          {busy ? "Changing…" : "Change the password"}
        </Button>
      </div>
    </form>
  </div>
</div>
