<!--
  src/routes/+layout.svelte
  The frame around every page: the navigation, the header and the
  notices.

  The sign-in and the first-run installation have no frame, so they ask
  for one by being outside the group.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import "../app.css";
  import { session, setupStatus } from "$lib/api/session.svelte";
  import { workspace } from "$lib/api/workspace.svelte";
  import Logo from "$lib/components/shell/Logo.svelte";
  import PropertyPicker from "$lib/components/shell/PropertyPicker.svelte";
  import Sidebar from "$lib/components/shell/Sidebar.svelte";
  import Toaster from "$lib/components/ui/Toaster.svelte";
  import { Menu, Moon, Sun } from "lucide-svelte";

  let { children } = $props();

  // The pages that stand on their own: no navigation, no frame.
  const bare = $derived(
    page.url.pathname === "/login" ||
      page.url.pathname === "/setup" ||
      page.url.pathname === "/change-password",
  );

  let mobileOpen = $state(false);
  // Read initial dark state from the class the inline script already applied.
  let isDark = $state(
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );

  onMount(async () => {
    await session.load();
    // Re-read in case the reactive assignment above ran during SSR.
    isDark = document.documentElement.classList.contains("dark");
  });

  /**
   * Where the person may be, given the session.
   *
   * This is an effect rather than a one-off, because the session changes
   * while the frame is standing: somebody signs in, signs out, or is told
   * to change their password.
   */
  $effect(() => {
    if (session.loading) return;
    const path = page.url.pathname;

    if (!session.isSignedIn) {
      // The two entry pages are the only places a signed-out person may be.
      if (path === "/login" || path === "/setup") return;
      // A system that has never been installed asks for its first
      // administrator before anything else.
      void setupStatus()
        .then((status) => {
          goto(status.needsSetup ? "/setup" : "/login", { replaceState: true });
        })
        .catch(() => goto("/login", { replaceState: true }));
      return;
    }

    // A person who has to change their password goes there first, and
    // cannot go anywhere else until they have.
    if (session.mustChangePassword && path !== "/change-password") {
      void goto("/change-password");
    }
  });

  /** The list of properties depends on the session, so it is read after. */
  $effect(() => {
    if (!session.current) return;
    void workspace.load();
  });

  function toggleDarkModeNative() {
    const html = document.documentElement;
    const dark = html.classList.toggle("dark");
    localStorage.setItem("neoams-dark-mode", dark ? "true" : "false");
    isDark = dark;
  }
</script>

<svelte:head>
  <title>NeoAMS — Staff Dashboard</title>
  <meta
    name="description"
    content="Accommodation management for guesthouses, bed and breakfasts and boutique hotels."
  />
</svelte:head>

{#if bare}
  {@render children()}
{:else}
  <div class="flex min-h-dvh">
    <!-- The navigation. -->
    <aside
      class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-transform duration-200 lg:static lg:translate-x-0 {mobileOpen
        ? 'translate-x-0'
        : '-translate-x-full'}"
    >
      <div
        class="flex h-14 items-center justify-between border-b border-line px-4"
      >
        <Logo />
        <button
          id="dark-mode-toggle"
          class="p-2 rounded-md hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink cursor-pointer"
          onclick={() => {
            toggleDarkModeNative();
            isDark = document.documentElement.classList.contains("dark");
          }}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          <span class="sr-only">Toggle dark mode</span>
          {#if isDark}
            <Moon class="size-4" />
          {:else}
            <Sun class="size-4" />
          {/if}
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-3 py-4">
        <Sidebar onNavigate={() => (mobileOpen = false)} />
      </div>

      {#if session.user}
        <div class="border-t border-line p-3">
          <div class="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-ink-50"
              aria-hidden="true"
            >
              {session.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-ink">
                {session.user.name}
              </p>
              <p class="truncate text-xs text-ink-muted">
                {session.user.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            class="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-ink-muted transition-colors hover:bg-ink-100 hover:text-ink"
            onclick={() => session.signOut()}
          >
            Sign out
          </button>
        </div>
      {/if}
    </aside>

    {#if mobileOpen}
      <button
        type="button"
        class="fixed inset-0 z-30 bg-ink-950/30 lg:hidden"
        onclick={() => (mobileOpen = false)}
        aria-label="Close the navigation"
      ></button>
    {/if}

    <!-- The content. -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6"
      >
        <button
          type="button"
          class="-ml-1 rounded-md p-1.5 text-ink-600 hover:bg-ink-100 hover:text-ink cursor-pointer lg:hidden"
          onclick={() => (mobileOpen = true)}
          aria-label="Open the navigation"
        >
          <Menu class="size-5" />
        </button>

        <PropertyPicker
          properties={workspace.properties.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            role: p.role ?? "staff",
          }))}
          current={workspace.currentId}
          isAdmin={session.isAdmin}
          onchange={(id) => workspace.select(id)}
        />

        <div class="flex-1"></div>

        <button
          type="button"
          class="p-2 rounded-md hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink cursor-pointer lg:hidden"
          onclick={() => {
            toggleDarkModeNative();
            isDark = document.documentElement.classList.contains("dark");
          }}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          <span class="sr-only">Toggle dark mode</span>
          {#if isDark}
            <Moon class="size-4" />
          {:else}
            <Sun class="size-4" />
          {/if}
        </button>

        {#if session.user}
          <a
            href="/change-password"
            class="rounded-md px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-ink-100 hover:text-ink"
          >
            Change password
          </a>
        {/if}
      </header>

      <main class="flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {@render children()}
      </main>
    </div>
  </div>
{/if}

<Toaster />
