<!--
  src/routes/finance/+page.svelte
  The money.

  What was earned, what was spent, what was collected, and the payments
  waiting to be checked.
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
  import Input from "$lib/components/ui/Input.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import { toast } from "$lib/components/ui/toast.svelte";
  import {
    formatDate,
    formatMoney,
    paymentLabel,
    paymentTone,
  } from "$lib/ui/status";

  type Summary = {
    roomRevenueCents: number;
    collectedCents: number;
    expenseCents: number;
    netCents: number;
    bookings: number;
  };

  type Revenue = {
    groupBy: string;
    data: { period: string; totalCents: number; bookings: number }[];
  };

  type Expense = {
    id: number;
    categoryId: number;
    categoryName: string;
    description: string;
    amountCents: number;
    paymentMethod: string | null;
    reference: string | null;
    expenseDate: string;
  };

  type Payment = {
    id: number;
    bookingId: number;
    bookingReference: string;
    guestName: string;
    type: string;
    status: string;
    amountCents: number;
    paymentMethod: string | null;
    transactionReferenceCode: string | null;
    proofMessage: string | null;
    submittedByGuest: boolean;
    paymentDate: string;
  };

  /** The first day of this month, and today. */
  const today = new Date();
  const monthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  )
    .toISOString()
    .slice(0, 10);
  const todayString = today.toISOString().slice(0, 10);

  let from = $state(monthStart);
  let to = $state(todayString);

  let summary = $state<Summary | null>(null);
  let revenue = $state<Revenue | null>(null);
  let expenses = $state<Expense[]>([]);
  let payments = $state<Payment[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  /** Which of the three lists is shown. */
  let tab = $state<"payments" | "expenses">("payments");

  async function load() {
    const propertyId = workspace.currentId;
    if (propertyId === null) {
      summary = null;
      revenue = null;
      expenses = [];
      payments = [];
      return;
    }
    loading = true;
    error = null;
    try {
      const [summaryResult, revenueResult, expenseResult, paymentResult] =
        await Promise.all([
          api.get<Summary>(`/properties/${propertyId}/reports/summary`, {
            query: { from, to },
          }),
          api.get<Revenue>(`/properties/${propertyId}/reports/revenue`, {
            query: { from, to, groupBy: "day" },
          }),
          api.get<{ data: Expense[] }>(`/properties/${propertyId}/expenses`, {
            query: { from, to, limit: 50, offset: 0 },
          }),
          api.get<{ data: Payment[] }>(`/properties/${propertyId}/payments`, {
            query: { limit: 50, offset: 0 },
          }),
        ]);
      summary = summaryResult;
      revenue = revenueResult;
      expenses = expenseResult.data;
      payments = paymentResult.data;
    } catch (err) {
      // A person without the permission to see the money still gets the
      // page; the API says what is not allowed.
      if (err instanceof ApiError && err.status === 403) {
        error =
          "You are not allowed to see the money of this property. Ask the owner.";
      } else {
        error =
          err instanceof ApiError
            ? err.message
            : "The figures could not be loaded.";
      }
      summary = null;
      revenue = null;
      expenses = [];
      payments = [];
    } finally {
      loading = false;
    }
  }

  /** Check or refuse a payment that a guest submitted. */
  async function review(payment: Payment, approve: boolean) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      await api.post(
        `/properties/${propertyId}/payments/${payment.id}/review`,
        { status: approve ? "succeeded" : "failed" },
      );
      toast.success(
        approve ? "Payment accepted" : "Payment refused",
        `${payment.bookingReference} · ${formatMoney(payment.amountCents)}`,
      );
      await load();
    } catch (err) {
      toast.error(
        "The payment could not be reviewed",
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

  /** The tallest bar in the revenue chart, for the scale. */
  const peak = $derived(
    Math.max(1, ...(revenue?.data.map((r) => r.totalCents) ?? [1])),
  );
</script>

<PageHeader
  title="Finance"
  description="What was earned, what was spent, and what is still to be checked."
/>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else}
  <form
    class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end"
    onsubmit={(e) => {
      e.preventDefault();
      void load();
    }}
  >
    <div class="sm:w-44">
      <label class="label" for="from">From</label>
      <Input id="from" type="date" bind:value={from} />
    </div>
    <div class="sm:w-44">
      <label class="label" for="to">To</label>
      <Input id="to" type="date" bind:value={to} />
    </div>
    <Button type="submit" {loading}>Show</Button>
  </form>

  {#if error}
    <div class="panel p-6">
      <p class="text-sm text-error">{error}</p>
    </div>
  {:else if summary}
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="panel p-4">
        <p class="text-xs font-medium text-ink-muted">Room revenue</p>
        <p
          class="mt-1.5 text-2xl font-semibold text-ink tabular-nums"
          data-numeric
        >
          {formatMoney(summary.roomRevenueCents)}
        </p>
        <p class="mt-0.5 text-xs text-ink-muted">
          from {summary.bookings} booking{summary.bookings === 1 ? "" : "s"}
        </p>
      </div>
      <div class="panel p-4">
        <p class="text-xs font-medium text-ink-muted">Collected</p>
        <p
          class="mt-1.5 text-2xl font-semibold text-ink tabular-nums"
          data-numeric
        >
          {formatMoney(summary.collectedCents)}
        </p>
      </div>
      <div class="panel p-4">
        <p class="text-xs font-medium text-ink-muted">Expenses</p>
        <p
          class="mt-1.5 text-2xl font-semibold text-ink tabular-nums"
          data-numeric
        >
          {formatMoney(summary.expenseCents)}
        </p>
      </div>
      <div class="panel p-4">
        <p class="text-xs font-medium text-ink-muted">Net</p>
        <p
          class="mt-1.5 text-2xl font-semibold tabular-nums {summary.netCents <
          0
            ? 'text-error'
            : 'text-ink'}"
          data-numeric
        >
          {formatMoney(summary.netCents)}
        </p>
      </div>
    </div>

    {#if revenue && revenue.data.length > 0}
      <div class="mt-4">
        <Card
          title="Revenue by day"
          description="Room revenue, bucketed on the day the stay ended."
        >
          <div class="flex h-40 items-end gap-1">
            {#each revenue.data as row (row.period)}
              <div
                class="group flex min-w-0 flex-1 flex-col items-center gap-1"
              >
                <div
                  class="w-full rounded-t bg-ink-200"
                  style={`height: ${Math.max(
                    2,
                    Math.round((row.totalCents / peak) * 120),
                  )}px`}
                  title={`${row.period}: ${formatMoney(row.totalCents)}`}
                ></div>
                <span class="truncate text-2xs text-ink-muted">
                  {row.period.slice(8)}
                </span>
              </div>
            {/each}
          </div>
        </Card>
      </div>
    {/if}

    <div class="mt-4">
      <div class="mb-3 flex gap-1 border-b border-line">
        {#each [{ key: "payments", label: "Payments" }, { key: "expenses", label: "Expenses" }] as option (option.key)}
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

      {#if tab === "payments"}
        {#if payments.length === 0}
          <div class="panel">
            <Empty
              title="No payments"
              description="Nothing has been recorded yet."
            />
          </div>
        {:else}
          <Card padded={false}>
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-sm">
                <thead class="border-b border-line bg-surface-muted">
                  <tr class="text-left">
                    <th class="px-4 py-2.5 font-medium text-ink-700">Booking</th
                    >
                    <th class="px-4 py-2.5 font-medium text-ink-700">Guest</th>
                    <th class="px-4 py-2.5 font-medium text-ink-700">Method</th>
                    <th
                      class="px-4 py-2.5 text-right font-medium text-ink-700"
                      data-numeric
                    >
                      Amount
                    </th>
                    <th class="px-4 py-2.5 font-medium text-ink-700">State</th>
                    <th class="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-line">
                  {#each payments as payment (payment.id)}
                    <tr class="hover:bg-surface-muted">
                      <td class="px-4 py-3">
                        <span class="font-medium text-ink">
                          {payment.bookingReference}
                        </span>
                        <span class="mt-0.5 block text-xs text-ink-muted">
                          {formatDate(payment.paymentDate)}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-ink-muted">
                        {payment.guestName}
                        {#if payment.submittedByGuest}
                          <span class="mt-0.5 block text-xs text-ink-faint">
                            sent by the guest
                          </span>
                        {/if}
                      </td>
                      <td class="px-4 py-3 text-ink-muted">
                        {payment.paymentMethod?.replace(/_/g, " ") ?? "—"}
                        {#if payment.transactionReferenceCode}
                          <span
                            class="mt-0.5 block font-mono text-xs text-ink-faint"
                          >
                            {payment.transactionReferenceCode}
                          </span>
                        {/if}
                      </td>
                      <td
                        class="px-4 py-3 text-right font-medium text-ink tabular-nums"
                        data-numeric
                      >
                        {formatMoney(payment.amountCents)}
                      </td>
                      <td class="px-4 py-3">
                        <Badge tone={paymentTone(payment.status)}>
                          {paymentLabel(payment.status)}
                        </Badge>
                      </td>
                      <td class="px-4 py-3 text-right">
                        {#if payment.status === "pending"}
                          <div class="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              onclick={() => review(payment, true)}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onclick={() => review(payment, false)}
                            >
                              Refuse
                            </Button>
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
      {:else}
        {#if expenses.length === 0}
          <div class="panel">
            <Empty
              title="No expenses"
              description="Nothing was spent in this period."
            />
          </div>
        {:else}
          <Card padded={false}>
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-sm">
                <thead class="border-b border-line bg-surface-muted">
                  <tr class="text-left">
                    <th class="px-4 py-2.5 font-medium text-ink-700">Date</th>
                    <th class="px-4 py-2.5 font-medium text-ink-700"
                      >Description</th
                    >
                    <th class="px-4 py-2.5 font-medium text-ink-700"
                      >Category</th
                    >
                    <th
                      class="px-4 py-2.5 text-right font-medium text-ink-700"
                      data-numeric
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-line">
                  {#each expenses as expense (expense.id)}
                    <tr class="hover:bg-surface-muted">
                      <td class="px-4 py-3 text-ink-muted">
                        {formatDate(expense.expenseDate)}
                      </td>
                      <td class="px-4 py-3 font-medium text-ink">
                        {expense.description}
                        {#if expense.reference}
                          <span
                            class="mt-0.5 block font-mono text-xs text-ink-faint"
                          >
                            {expense.reference}
                          </span>
                        {/if}
                      </td>
                      <td class="px-4 py-3 text-ink-muted">
                        {expense.categoryName}
                      </td>
                      <td
                        class="px-4 py-3 text-right font-medium text-ink tabular-nums"
                        data-numeric
                      >
                        {formatMoney(expense.amountCents)}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </Card>
        {/if}
      {/if}
    </div>
  {/if}
{/if}
