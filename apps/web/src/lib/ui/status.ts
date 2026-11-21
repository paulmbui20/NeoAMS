// src/lib/ui/status.ts
// How the domain's states are shown.
//
// A booking that is checked in is not the same as one that is cancelled,
// and the person at the desk has to see that at a glance. The colours are
// the four functional ones; everything else stays neutral.

export type Tone = "neutral" | "success" | "error" | "warning" | "info";

const bookingTones: Record<string, Tone> = {
  pending: "warning",
  confirmed: "info",
  checked_in: "success",
  checked_out: "neutral",
  cancelled: "error",
  no_show: "error",
};

const bookingLabels: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No show",
};

const roomTones: Record<string, Tone> = {
  available: "success",
  occupied: "info",
  dirty: "warning",
  maintenance: "neutral",
  out_of_order: "error",
};

const roomLabels: Record<string, string> = {
  available: "Available",
  occupied: "Occupied",
  dirty: "Needs cleaning",
  maintenance: "In maintenance",
  out_of_order: "Out of order",
};

const paymentTones: Record<string, Tone> = {
  pending: "warning",
  succeeded: "success",
  failed: "error",
};

const paymentLabels: Record<string, string> = {
  pending: "Pending",
  succeeded: "Paid",
  failed: "Failed",
};

export const bookingTone = (status: string): Tone =>
  bookingTones[status] ?? "neutral";
export const bookingLabel = (status: string): string =>
  bookingLabels[status] ?? status;

export const roomTone = (status: string): Tone =>
  roomTones[status] ?? "neutral";
export const roomLabel = (status: string): string =>
  roomLabels[status] ?? status;

export const paymentTone = (status: string): Tone =>
  paymentTones[status] ?? "neutral";
export const paymentLabel = (status: string): string =>
  paymentLabels[status] ?? status;

/** The role a person holds at a property, in words. */
export const roleLabel = (role: string): string => {
  switch (role) {
    case "owner":
      return "Owner";
    case "manager":
      return "Manager";
    case "receptionist":
      return "Receptionist";
    case "accountant":
      return "Accountant";
    case "staff":
      return "Staff";
    case "admin":
      return "Administrator";
    default:
      return role;
  }
};

/** The money, in the way the business writes it. */
export const formatMoney = (cents: number, currency = "KES"): string =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

export const centsToShillings = (cents: number): number => cents / 100;
export const shillingsToCents = (shillings: number): number =>
  Math.round(shillings * 100);

/** A date, in the way a calendar writes it. */
export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

/** A date and the time, for the audit trail. */
export const formatDateTime = (
  value: string | Date | null | undefined,
): string => {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

/** How long ago something happened, in words. */
export const timeAgo = (value: string | Date | null | undefined): string => {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(date);
};
