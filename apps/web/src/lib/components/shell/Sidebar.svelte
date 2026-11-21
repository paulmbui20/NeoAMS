<!--
  src/lib/components/shell/Sidebar.svelte
  The navigation. It lists what the person may actually do, so there
  are no dead ends.
-->
<script lang="ts">
  import { page } from "$app/state";
  import { rolePermissions, type Permission } from "@neoams/shared";
  import { session } from "$lib/api/session.svelte";
  import { workspace } from "$lib/api/workspace.svelte";
  import {
    Home,
    CalendarDays,
    Users,
    BedDouble,
    DollarSign,
    Package,
    BadgeCheck,
    Settings,
    ScrollText,
  } from "lucide-svelte";

  type Props = {
    onNavigate?: () => void;
  };

  let { onNavigate }: Props = $props();

  type Item = {
    href: string;
    label: string;
    icon: typeof Home;
    /** The permission the person needs. */
    requires?: Permission;
    /** Only for the global administrator. */
    adminOnly?: boolean;
  };

  const items: Item[] = [
    { href: "/", label: "Today", icon: Home, requires: "booking:read" },
    {
      href: "/bookings",
      label: "Bookings",
      icon: CalendarDays,
      requires: "booking:read",
    },
    { href: "/guests", label: "Guests", icon: Users, requires: "guest:read" },
    {
      href: "/rooms",
      label: "Rooms",
      icon: BedDouble,
      requires: "booking:read",
    },
    {
      href: "/catalog",
      label: "Catalog",
      icon: Package,
      requires: "catalog:manage",
    },
    {
      href: "/finance",
      label: "Finance",
      icon: DollarSign,
      requires: "report:read",
    },
    {
      href: "/logs",
      label: "Audit Logs",
      icon: ScrollText,
      requires: "booking:read",
    },
    {
      href: "/staff",
      label: "Staff",
      icon: BadgeCheck,
      requires: "staff:manage",
    },
    {
      href: "/admin",
      label: "Administration",
      icon: Settings,
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
        <item.icon class="size-4" />
      </span>
      {item.label}
    </a>
  {/each}
</nav>
