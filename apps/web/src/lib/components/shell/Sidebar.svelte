<!--
  src/lib/components/shell/Sidebar.svelte
  The navigation. It lists what the person may actually do, so there
  are no dead ends.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { rolePermissions, type Permission } from "@neoams/shared";
  import { session } from "$lib/api/session.svelte";
  import { workspace } from "$lib/api/workspace.svelte";

  type Props = {
    onNavigate?: () => void;
  };

  let { onNavigate }: Props = $props();

  type Item = {
    href: string;
    label: string;
    icon: string;
    /** The permission the person needs. */
    requires?: Permission;
    /** Only for the global administrator. */
    adminOnly?: boolean;
  };

  const items: Item[] = [
    { href: "/", label: "Today", icon: "home", requires: "booking:read" },
    {
      href: "/bookings",
      label: "Bookings",
      icon: "calendar",
      requires: "booking:read",
    },
    { href: "/guests", label: "Guests", icon: "users", requires: "guest:read" },
    { href: "/rooms", label: "Rooms", icon: "bed", requires: "booking:read" },
    {
      href: "/finance",
      label: "Finance",
      icon: "money",
      requires: "report:read",
    },
    { href: "/staff", label: "Staff", icon: "badge", requires: "staff:manage" },
    {
      href: "/admin",
      label: "Administration",
      icon: "settings",
      adminOnly: true,
    },
  ];

  const isActive = (href: string) =>
    href === "/"
      ? page.url.pathname === "/"
      : page.url.pathname.startsWith(href);

  /**
   * What the person may actually do.
   *
   * The role at the property being worked in decides, and the global
   * administrator may do everything. Until a property is chosen the links
   * are left alone: the page itself explains what is needed.
   */
  const visible = $derived(
    items.filter((item) => {
      if (item.adminOnly) return session.isAdmin;
      if (!item.requires || session.isAdmin) return true;
      const role = workspace.current?.role;
      if (!role) return true;
      const allowed = rolePermissions[role as keyof typeof rolePermissions];
      return allowed ? allowed.has(item.requires) : true;
    }),
  );
</script>

<nav class="flex flex-col gap-0.5" aria-label="Main">
  {#each visible as item (item.href)}
    <a
      href={item.href}
      onclick={onNavigate}
      aria-current={isActive(item.href) ? "page" : undefined}
      class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-100 {isActive(
        item.href,
      )
        ? 'bg-ink-900 font-medium text-ink-50'
        : 'text-ink-600 hover:bg-ink-100 hover:text-ink'}"
    >
      <span
        class="flex size-5 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        {#if item.icon === "home"}
          <svg class="size-4" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 8.5L10 3l7 5.5V16a1 1 0 01-1 1h-3.5v-5h-5v5H4a1 1 0 01-1-1V8.5z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
        {:else if item.icon === "calendar"}
          <svg class="size-4" viewBox="0 0 20 20" fill="none">
            <rect
              x="3"
              y="4.5"
              width="14"
              height="12"
              rx="1.5"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path
              d="M3 8.5h14M7 3v3M13 3v3"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        {:else if item.icon === "users"}
          <svg class="size-4" viewBox="0 0 20 20" fill="none">
            <circle
              cx="8"
              cy="7"
              r="3"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path
              d="M2.5 16.5c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <path
              d="M14 5.2a3 3 0 010 5.6M15.5 12.5c1.3.8 2 2 2 3.4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        {:else if item.icon === "bed"}
          <svg class="size-4" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 16V6M3 11h14v5M17 16v-3.5a2.5 2.5 0 00-2.5-2.5H10V8.5a1.5 1.5 0 00-1.5-1.5H3"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
        {:else if item.icon === "money"}
          <svg class="size-4" viewBox="0 0 20 20" fill="none">
            <rect
              x="2.5"
              y="5"
              width="15"
              height="10"
              rx="1.5"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <circle
              cx="10"
              cy="10"
              r="2.5"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        {:else if item.icon === "badge"}
          <svg class="size-4" viewBox="0 0 20 20" fill="none">
            <rect
              x="4"
              y="5"
              width="12"
              height="10"
              rx="1.5"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path
              d="M8 5V3.5h4V5M7.5 10h5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        {:else}
          <svg class="size-4" viewBox="0 0 20 20" fill="none">
            <circle
              cx="10"
              cy="10"
              r="3"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path
              d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        {/if}
      </span>
      {item.label}
    </a>
  {/each}
</nav>
