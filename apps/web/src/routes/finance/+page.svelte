<!--
  src/routes/finance/+page.svelte
  The money.

  Manage revenue, expenses, payments, refunds, and financial reporting.
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
  import {
    centsToShillings,
    formatDate,
    formatMoney,
    paymentLabel,
    paymentTone,
    shillingsToCents,
  } from "$lib/ui/status";
  import { createDraft } from "$lib/utils/draft";
  import {
    Plus,
    Pencil,
    RotateCcw,
    CreditCard,
    Receipt,
    Tag,
    Check,
    X,
    TrendingUp,
    TrendingDown,
  } from "lucide-svelte";

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
    notes?: string | null;
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

  type ExpenseCategory = {
    id: number;
    name: string;
    description: string | null;
  };

  type ExpenseDraft = {
    categoryId: string;
    description: string;
    amountShillings: number;
    paymentMethod: string;
    reference: string;
    expenseDate: string;
    notes: string;
  };

  const expenseDraft = createDraft<ExpenseDraft>("expense-new");

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
  let expenseCategories = $state<ExpenseCategory[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let tab = $state<"payments" | "expenses">("payments");

  // Add Expense Modal state
  let addingExpense = $state(false);
  let expenseForm = $state<ExpenseDraft>({
    categoryId: "",
    description: "",
    amountShillings: 1000,
    paymentMethod: "mpesa",
    reference: "",
    expenseDate: todayString,
    notes: "",
  });
  let expenseBusy = $state(false);
  let expenseErrors = $state<Record<string, string>>({});
  let hasRestoredExpenseDraft = $state(false);

  // Edit Expense Modal state
  let editingExpense = $state<Expense | null>(null);
  let editExpenseForm = $state({
    categoryId: "",
    description: "",
    amountShillings: 0,
    paymentMethod: "mpesa",
    reference: "",
    expenseDate: todayString,
  });
  let editExpenseBusy = $state(false);

  // Expense Category Modal state
  let addingCategory = $state(false);
  let categoryForm = $state({ name: "", description: "" });
  let categoryBusy = $state(false);

  // Process Refund Modal state
  let refundingPayment = $state<Payment | null>(null);
  let refundForm = $state({
    amountShillings: 0,
    paymentMethod: "mpesa",
    reason: "",
    transactionReferenceCode: "",
  });
  let refundBusy = $state(false);

  const paymentMethodOptions = [
    { value: "mpesa", label: "M-PESA" },
    { value: "cash", label: "Cash" },
    { value: "card", label: "Card" },
    { value: "bank_transfer", label: "Bank Transfer" },
    { value: "airtel_money", label: "Airtel Money" },
    { value: "other", label: "Other" },
  ];

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
      if (err instanceof ApiError && err.status === 403) {
        error =
          "You are not authorized to view financial reports for this property.";
      } else {
        error =
          err instanceof ApiError
            ? err.message
            : "The financial figures could not be loaded.";
      }
      summary = null;
      revenue = null;
      expenses = [];
      payments = [];
    } finally {
      loading = false;
    }
  }

  async function loadCategories() {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      const result = await api.get<{ data: ExpenseCategory[] }>(
        `/properties/${propertyId}/expense-categories`,
      );
      expenseCategories = result.data;
    } catch {
      // Non-fatal if categories fail
    }
  }

  async function review(payment: Payment, approve: boolean) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      await api.post(
        `/properties/${propertyId}/payments/${payment.id}/review`,
        { decision: approve ? "succeeded" : "failed" },
      );
      toast.success(
        approve ? "Payment accepted" : "Payment declined",
        `${payment.bookingReference} · ${formatMoney(payment.amountCents)}`,
      );
      await load();
    } catch (err) {
      toast.error(
        "Could not review payment",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  // --- Expense Management ---
  function openAddExpenseModal() {
    void loadCategories();
    const saved = expenseDraft.load();
    if (saved) {
      const oldAmountCents = (saved as ExpenseDraft & { amountCents?: number })
        .amountCents;
      expenseForm = {
        ...saved,
        amountShillings:
          Number.isFinite(saved.amountShillings) &&
          saved.amountShillings !== undefined
            ? saved.amountShillings
            : centsToShillings(oldAmountCents ?? 100000),
      };
      hasRestoredExpenseDraft = true;
    } else {
      expenseForm = {
        categoryId: expenseCategories[0] ? String(expenseCategories[0].id) : "",
        description: "",
        amountShillings: 1000,
        paymentMethod: "mpesa",
        reference: "",
        expenseDate: todayString,
        notes: "",
      };
      hasRestoredExpenseDraft = false;
    }
    expenseErrors = {};
    addingExpense = true;
  }

  function saveExpenseProgress() {
    expenseDraft.save(expenseForm);
  }

  function discardExpenseDraft() {
    expenseDraft.clear();
    hasRestoredExpenseDraft = false;
    expenseForm = {
      categoryId: expenseCategories[0] ? String(expenseCategories[0].id) : "",
      description: "",
      amountShillings: 1000,
      paymentMethod: "mpesa",
      reference: "",
      expenseDate: todayString,
      notes: "",
    };
  }

  async function submitCreateExpense() {
    const errs: Record<string, string> = {};
    if (!expenseForm.categoryId) errs.categoryId = "Please select a category";
    if (!expenseForm.description.trim())
      errs.description = "Description is required";
    const amountCents = shillingsToCents(expenseForm.amountShillings);
    if (
      !Number.isFinite(expenseForm.amountShillings) ||
      amountCents <= 0 ||
      amountCents > 100_000_000
    ) {
      errs.amountCents = "Please enter a valid amount";
    }
    if (!expenseForm.expenseDate) errs.expenseDate = "Date is required";
    if (Object.keys(errs).length > 0) {
      expenseErrors = errs;
      return;
    }

    const propertyId = workspace.currentId;
    if (propertyId === null || !expenseForm.categoryId) return;

    expenseBusy = true;
    try {
      await api.post(`/properties/${propertyId}/expenses`, {
        categoryId: Number(expenseForm.categoryId),
        description: expenseForm.description.trim(),
        amountCents,
        paymentMethod: expenseForm.paymentMethod || undefined,
        reference: expenseForm.reference.trim() || undefined,
        expenseDate: expenseForm.expenseDate,
        notes: expenseForm.notes.trim() || undefined,
      });

      expenseDraft.clear();
      toast.success(
        "Expense recorded",
        `${formatMoney(amountCents)} for ${expenseForm.description}`,
      );
      addingExpense = false;
      await load();
    } catch (err) {
      toast.error(
        "Could not record expense",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      expenseBusy = false;
    }
  }

  function openEditExpense(e: Expense) {
    editingExpense = e;
    editExpenseForm = {
      categoryId: String(e.categoryId),
      description: e.description,
      amountShillings: centsToShillings(e.amountCents),
      paymentMethod: e.paymentMethod ?? "mpesa",
      reference: e.reference ?? "",
      expenseDate: e.expenseDate,
    };
  }

  function closeEditExpense() {
    editingExpense = null;
  }

  async function submitEditExpense() {
    if (!editingExpense) return;
    const propertyId = workspace.currentId;
    if (propertyId === null) return;

    const amountCents = shillingsToCents(editExpenseForm.amountShillings);
    if (
      !editExpenseForm.categoryId ||
      !editExpenseForm.description.trim() ||
      !editExpenseForm.expenseDate ||
      !Number.isFinite(editExpenseForm.amountShillings) ||
      amountCents <= 0 ||
      amountCents > 100_000_000
    ) {
      toast.error("Please complete all required fields with a valid amount.");
      return;
    }

    editExpenseBusy = true;
    try {
      await api.patch(
        `/properties/${propertyId}/expenses/${editingExpense.id}`,
        {
          categoryId: Number(editExpenseForm.categoryId),
          description: editExpenseForm.description.trim(),
          amountCents,
          paymentMethod: editExpenseForm.paymentMethod || undefined,
          reference: editExpenseForm.reference.trim() || undefined,
          expenseDate: editExpenseForm.expenseDate,
        },
      );

      toast.success("Expense updated");
      closeEditExpense();
      await load();
    } catch (err) {
      toast.error(
        "Could not update expense",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      editExpenseBusy = false;
    }
  }

  // --- Category Management ---
  async function submitCategory() {
    if (!categoryForm.name.trim()) return;
    const propertyId = workspace.currentId;
    if (propertyId === null) return;

    categoryBusy = true;
    try {
      await api.post(`/properties/${propertyId}/expense-categories`, {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || undefined,
      });
      toast.success("Category created", categoryForm.name);
      categoryForm = { name: "", description: "" };
      addingCategory = false;
      await loadCategories();
    } catch (err) {
      toast.error(
        "Could not create category",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      categoryBusy = false;
    }
  }

  // --- Refund Management ---
  function openRefund(p: Payment) {
    refundingPayment = p;
    refundForm = {
      amountShillings: centsToShillings(p.amountCents),
      paymentMethod: p.paymentMethod ?? "mpesa",
      reason: "",
      transactionReferenceCode: "",
    };
  }

  function closeRefund() {
    refundingPayment = null;
  }

  async function submitRefund() {
    if (!refundingPayment) return;
    const propertyId = workspace.currentId;
    if (propertyId === null) return;

    const amountCents = shillingsToCents(refundForm.amountShillings);
    if (
      !refundForm.reason.trim() ||
      !Number.isFinite(refundForm.amountShillings) ||
      amountCents <= 0 ||
      amountCents > refundingPayment.amountCents ||
      amountCents > 100_000_000
    ) {
      toast.error("Enter a valid refund amount and reason.");
      return;
    }

    refundBusy = true;
    try {
      await api.post(
        `/properties/${propertyId}/payments/${refundingPayment.id}/refund`,
        {
          amountCents,
          paymentMethod: refundForm.paymentMethod,
          reason: refundForm.reason.trim(),
          transactionReferenceCode:
            refundForm.transactionReferenceCode.trim() || undefined,
        },
      );
      toast.success(
        "Refund processed",
        `${formatMoney(amountCents)} for ${refundingPayment.bookingReference}`,
      );
      closeRefund();
      await load();
    } catch (err) {
      toast.error(
        "Could not process refund",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      refundBusy = false;
    }
  }

  onMount(async () => {
    if (!session.loading && !session.isSignedIn) {
      await goto("/login", { replaceState: true });
      return;
    }
    await workspace.load();
    await loadCategories();
  });

  $effect(() => {
    const id = workspace.currentId;
    if (id !== null && session.isSignedIn) void load();
  });

  const peak = $derived(
    Math.max(1, ...(revenue?.data.map((r) => r.totalCents) ?? [1])),
  );
</script>

<PageHeader
  title="Finance"
  description="Cash flow, revenue analytics, operating expenses, and payment verification."
/>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else}
  <!-- Date Filter & Actions -->
  <div
    class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
  >
    <form
      class="flex flex-col gap-2 sm:flex-row sm:items-end"
      onsubmit={(e) => {
        e.preventDefault();
        void load();
      }}
    >
      <div class="sm:w-40">
        <label class="label" for="from">From</label>
        <Input id="from" type="date" bind:value={from} />
      </div>
      <div class="sm:w-40">
        <label class="label" for="to">To</label>
        <Input id="to" type="date" bind:value={to} />
      </div>
      <Button type="submit" {loading}>Filter</Button>
    </form>

    <div class="flex gap-2">
      <Button variant="secondary" onclick={() => (addingCategory = true)}>
        <Tag class="size-4 mr-1.5" />
        Categories
      </Button>
      <Button onclick={openAddExpenseModal}>
        <Plus class="size-4 mr-1.5" />
        Record Expense
      </Button>
    </div>
  </div>

  {#if error}
    <div class="panel p-6">
      <p class="text-sm text-error">{error}</p>
    </div>
  {:else if summary}
    <!-- Metrics Grid -->
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="panel p-4">
        <p class="text-xs font-medium text-ink-muted">Room Revenue</p>
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
        <p class="text-xs font-medium text-ink-muted">Collected Cash</p>
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
        <p class="text-xs font-medium text-ink-muted">Net Balance</p>
        <p
          class="mt-1.5 text-2xl font-semibold tabular-nums {summary.netCents <
          0
            ? 'text-error'
            : 'text-success'}"
          data-numeric
        >
          {formatMoney(summary.netCents)}
        </p>
      </div>
    </div>

    <!-- Revenue Chart -->
    {#if revenue && revenue.data.length > 0}
      <div class="mt-4">
        <Card
          title="Daily Revenue"
          description="Bucket of room revenue by stay departure date."
        >
          <div class="flex h-36 items-end gap-1 pt-4">
            {#each revenue.data as row (row.period)}
              <div
                class="group flex min-w-0 flex-1 flex-col items-center gap-1"
              >
                <div
                  class="w-full rounded-t bg-ink-200 dark:bg-ink-700 transition-colors group-hover:bg-ink-900 dark:group-hover:bg-ink-300"
                  style={`height: ${Math.max(
                    2,
                    Math.round((row.totalCents / peak) * 100),
                  )}px`}
                  title={`${row.period}: ${formatMoney(row.totalCents)}`}
                ></div>
                <span class="truncate text-2xs text-ink-muted">
                  {row.period?.slice(8) ?? "—"}
                </span>
              </div>
            {/each}
          </div>
        </Card>
      </div>
    {/if}

    <!-- Tabs: Payments vs Expenses -->
    <div class="mt-6">
      <div class="mb-4 flex gap-1 border-b border-line">
        {#each [{ key: "payments", label: `Payments (${payments.length})` }, { key: "expenses", label: `Expenses (${expenses.length})` }] as option (option.key)}
          <button
            type="button"
            class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer {tab ===
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
              title="No payments found"
              description="Guest payments and desk transactions will appear here."
            />
          </div>
        {:else}
          <Card padded={false}>
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-sm">
                <thead class="border-b border-line bg-surface-muted">
                  <tr class="text-left">
                    <th class="px-4 py-2.5 font-medium text-ink-700"
                      >Booking Ref</th
                    >
                    <th class="px-4 py-2.5 font-medium text-ink-700">Guest</th>
                    <th class="px-4 py-2.5 font-medium text-ink-700">Method</th>
                    <th
                      class="px-4 py-2.5 text-right font-medium text-ink-700"
                      data-numeric
                    >
                      Amount
                    </th>
                    <th class="px-4 py-2.5 font-medium text-ink-700">Status</th>
                    <th class="px-4 py-2.5 text-right font-medium text-ink-700"
                      >Actions</th
                    >
                  </tr>
                </thead>
                <tbody class="divide-y divide-line">
                  {#each payments as payment (payment.id)}
                    <tr class="hover:bg-surface-muted transition-colors">
                      <td class="px-4 py-3">
                        <span class="font-medium text-ink font-mono">
                          {payment.bookingReference}
                        </span>
                        <span class="mt-0.5 block text-xs text-ink-muted">
                          {formatDate(payment.paymentDate)}
                        </span>
                      </td>
                      <td class="px-4 py-3">
                        <span class="text-ink">{payment.guestName}</span>
                        {#if payment.submittedByGuest}
                          <span class="mt-0.5 block text-xs text-ink-muted">
                            Submitted via guest portal
                          </span>
                        {/if}
                      </td>
                      <td class="px-4 py-3 text-ink-muted">
                        <span class="capitalize"
                          >{payment.paymentMethod?.replace(/_/g, " ") ??
                            "—"}</span
                        >
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
                        <div class="flex justify-end items-center gap-1.5">
                          {#if payment.status === "pending"}
                            <Button
                              size="sm"
                              onclick={() => review(payment, true)}
                            >
                              <Check class="size-3.5 mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onclick={() => review(payment, false)}
                            >
                              <X class="size-3.5 mr-1" />
                              Reject
                            </Button>
                          {/if}
                          {#if payment.status === "succeeded"}
                            <Button
                              size="sm"
                              variant="secondary"
                              onclick={() => openRefund(payment)}
                              title="Process refund"
                            >
                              <RotateCcw class="size-3.5 mr-1" />
                              Refund
                            </Button>
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
      {:else}
        <!-- Expenses List -->
        {#if expenses.length === 0}
          <div class="panel">
            <Empty
              title="No expenses in this period"
              description="Click 'Record Expense' to log operational costs."
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
                    <th class="px-4 py-2.5 font-medium text-ink-700">Method</th>
                    <th
                      class="px-4 py-2.5 text-right font-medium text-ink-700"
                      data-numeric
                    >
                      Amount
                    </th>
                    <th class="px-4 py-2.5 text-right font-medium text-ink-700"
                      >Actions</th
                    >
                  </tr>
                </thead>
                <tbody class="divide-y divide-line">
                  {#each expenses as expense (expense.id)}
                    <tr class="hover:bg-surface-muted transition-colors">
                      <td
                        class="px-4 py-3 text-xs text-ink-muted whitespace-nowrap"
                      >
                        {formatDate(expense.expenseDate)}
                      </td>
                      <td class="px-4 py-3">
                        <span class="font-medium text-ink"
                          >{expense.description}</span
                        >
                        {#if expense.reference}
                          <span
                            class="mt-0.5 block font-mono text-xs text-ink-faint"
                          >
                            Ref: {expense.reference}
                          </span>
                        {/if}
                      </td>
                      <td class="px-4 py-3 text-ink-muted">
                        <Badge tone="neutral">{expense.categoryName}</Badge>
                      </td>
                      <td class="px-4 py-3 text-xs text-ink-muted capitalize">
                        {expense.paymentMethod?.replace(/_/g, " ") ?? "—"}
                      </td>
                      <td
                        class="px-4 py-3 text-right font-medium text-ink tabular-nums"
                        data-numeric
                      >
                        {formatMoney(expense.amountCents)}
                      </td>
                      <td class="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onclick={() => openEditExpense(expense)}
                          title="Edit expense"
                        >
                          <Pencil class="size-3.5" />
                        </Button>
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

<!-- Add Expense Modal with Draft Persistence -->
<Modal
  title="Record Operating Expense"
  open={addingExpense}
  onclose={() => (addingExpense = false)}
  width="max-w-lg"
>
  {#if hasRestoredExpenseDraft}
    <div
      class="mb-4 flex items-center justify-between rounded-lg bg-surface-muted p-2.5 text-xs border border-line"
    >
      <span class="text-ink-muted"
        >Restored unsaved expense entry from your browser.</span
      >
      <button
        type="button"
        class="text-error font-medium hover:underline cursor-pointer"
        onclick={discardExpenseDraft}
      >
        Discard
      </button>
    </div>
  {/if}

  <div class="space-y-3">
    <Field label="Expense Category" error={expenseErrors.categoryId} required>
      {#snippet children({ id, describedBy })}
        <Select
          {id}
          {describedBy}
          bind:value={expenseForm.categoryId}
          required
          options={[
            { value: "", label: "Select category…" },
            ...expenseCategories.map((c) => ({
              value: String(c.id),
              label: c.name,
            })),
          ]}
          onchange={saveExpenseProgress}
        />
      {/snippet}
    </Field>

    <Field label="Description" error={expenseErrors.description} required>
      {#snippet children({ id, describedBy, invalid })}
        <Input
          {id}
          {describedBy}
          bind:value={expenseForm.description}
          required
          placeholder="e.g. Fresh produce, electricity bill, laundry detergent"
          error={invalid ? expenseErrors.description : null}
          oninput={saveExpenseProgress}
        />
      {/snippet}
    </Field>

    <div class="grid gap-3 sm:grid-cols-2">
      <Field
        label="Amount (KES)"
        hint="Enter the amount in shillings."
        error={expenseErrors.amountCents}
        required
      >
        {#snippet children({ id, describedBy, invalid })}
          <Input
            {id}
            {describedBy}
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            required
            bind:value={expenseForm.amountShillings}
            error={invalid ? expenseErrors.amountCents : null}
            oninput={saveExpenseProgress}
          />
        {/snippet}
      </Field>

      <Field label="Payment Method">
        {#snippet children({ id, describedBy })}
          <Select
            {id}
            {describedBy}
            bind:value={expenseForm.paymentMethod}
            options={paymentMethodOptions}
            onchange={saveExpenseProgress}
          />
        {/snippet}
      </Field>

      <Field label="Expense Date" error={expenseErrors.expenseDate} required>
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            type="date"
            required
            bind:value={expenseForm.expenseDate}
            oninput={saveExpenseProgress}
          />
        {/snippet}
      </Field>

      <Field label="Receipt / Voucher Reference">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            bind:value={expenseForm.reference}
            placeholder="INV-2024-001"
            oninput={saveExpenseProgress}
          />
        {/snippet}
      </Field>
    </div>

    <Field label="Internal Notes">
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          {describedBy}
          bind:value={expenseForm.notes}
          placeholder="Supplier name or additional breakdown"
          oninput={saveExpenseProgress}
        />
      {/snippet}
    </Field>
  </div>

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={() => (addingExpense = false)}
        disabled={expenseBusy}
      >
        Cancel
      </Button>
      <Button
        onclick={submitCreateExpense}
        loading={expenseBusy}
        disabled={expenseBusy}
      >
        Record Expense
      </Button>
    </div>
  {/snippet}
</Modal>

<!-- Edit Expense Modal -->
<Modal
  title="Edit Operating Expense"
  open={editingExpense !== null}
  onclose={closeEditExpense}
  width="max-w-lg"
>
  {#if editingExpense}
    <div class="space-y-3">
      <Field label="Category" required>
        {#snippet children({ id, describedBy })}
          <Select
            {id}
            {describedBy}
            bind:value={editExpenseForm.categoryId}
            required
            options={expenseCategories.map((c) => ({
              value: String(c.id),
              label: c.name,
            }))}
          />
        {/snippet}
      </Field>

      <Field label="Description" required>
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            bind:value={editExpenseForm.description}
            required
          />
        {/snippet}
      </Field>

      <div class="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (KES)" required>
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              required
              bind:value={editExpenseForm.amountShillings}
            />
          {/snippet}
        </Field>

        <Field label="Payment Method">
          {#snippet children({ id, describedBy })}
            <Select
              {id}
              {describedBy}
              bind:value={editExpenseForm.paymentMethod}
              options={paymentMethodOptions}
            />
          {/snippet}
        </Field>

        <Field label="Date" required>
          {#snippet children({ id, describedBy })}
            <Input
              {id}
              {describedBy}
              type="date"
              required
              bind:value={editExpenseForm.expenseDate}
            />
          {/snippet}
        </Field>

        <Field label="Reference">
          {#snippet children({ id, describedBy })}
            <Input {id} {describedBy} bind:value={editExpenseForm.reference} />
          {/snippet}
        </Field>
      </div>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={closeEditExpense}
        disabled={editExpenseBusy}
      >
        Cancel
      </Button>
      <Button
        onclick={submitEditExpense}
        loading={editExpenseBusy}
        disabled={editExpenseBusy}
      >
        Save Changes
      </Button>
    </div>
  {/snippet}
</Modal>

<!-- Add Expense Category Modal -->
<Modal
  title="New Expense Category"
  open={addingCategory}
  onclose={() => (addingCategory = false)}
  width="max-w-md"
>
  <div class="space-y-3">
    <Field label="Category Name" required>
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          {describedBy}
          bind:value={categoryForm.name}
          placeholder="e.g. Utilities, Housekeeping, Groceries"
        />
      {/snippet}
    </Field>

    <Field label="Description">
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          {describedBy}
          bind:value={categoryForm.description}
          placeholder="Brief description of this cost center"
        />
      {/snippet}
    </Field>
  </div>

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={() => (addingCategory = false)}
        disabled={categoryBusy}
      >
        Cancel
      </Button>
      <Button
        onclick={submitCategory}
        loading={categoryBusy}
        disabled={categoryBusy}
      >
        Create Category
      </Button>
    </div>
  {/snippet}
</Modal>

<!-- Process Refund Modal -->
<Modal
  title="Process Payment Refund"
  open={refundingPayment !== null}
  onclose={closeRefund}
  width="max-w-md"
>
  {#if refundingPayment}
    <div class="space-y-3">
      <div class="rounded-lg bg-surface-muted p-3 text-xs border border-line">
        <p class="font-medium text-ink">
          {refundingPayment.bookingReference} · {refundingPayment.guestName}
        </p>
        <p class="text-ink-muted mt-0.5">
          Original transaction: {formatMoney(refundingPayment.amountCents)} via {refundingPayment.paymentMethod}
        </p>
      </div>

      <Field label="Refund Amount (KES)" required>
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            type="number"
            min="0.01"
            max={centsToShillings(refundingPayment?.amountCents ?? 0)}
            step="0.01"
            required
            bind:value={refundForm.amountShillings}
          />
        {/snippet}
      </Field>

      <Field label="Refund Method" required>
        {#snippet children({ id, describedBy })}
          <Select
            {id}
            {describedBy}
            bind:value={refundForm.paymentMethod}
            options={paymentMethodOptions}
          />
        {/snippet}
      </Field>

      <Field label="Reason for Refund" required>
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            bind:value={refundForm.reason}
            required
            placeholder="Cancellation, room change, overpayment…"
          />
        {/snippet}
      </Field>

      <Field label="Transaction Reference Code">
        {#snippet children({ id, describedBy })}
          <Input
            {id}
            {describedBy}
            bind:value={refundForm.transactionReferenceCode}
            placeholder="M-PESA / Bank reversal ref"
          />
        {/snippet}
      </Field>
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={closeRefund} disabled={refundBusy}>
        Cancel
      </Button>
      <Button onclick={submitRefund} loading={refundBusy} disabled={refundBusy}>
        Confirm Refund
      </Button>
    </div>
  {/snippet}
</Modal>
