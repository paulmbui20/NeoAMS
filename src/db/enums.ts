export const userRoles = ["admin", "user"] as const;
export const propertyRoles = [
  "owner",
  "manager",
  "receptionist",
  "accountant",
  "staff",
] as const;

export const roomStatuses = [
  "available",
  "occupied",
  "dirty",
  "maintenance",
  "out_of_order",
] as const;

export const idTypes = [
  "national_id",
  "passport",
  "drivers_license",
  "other",
] as const;
export const genders = ["male", "female", "other"] as const;

export const bookingStatuses = [
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
] as const;
export const bookingSources = [
  "website",
  "phone",
  "walk_in",
  "social_media",
  "other",
] as const;

export const paymentTypes = ["deposit", "payment", "refund"] as const;
export const paymentStatuses = ["pending", "succeeded", "failed"] as const;
export const paymentMethods = [
  "card",
  "cash",
  "bank_transfer",
  "mpesa",
  "airtel_money",
  "paypal",
  "stripe",
  "crypto",
  "other",
] as const;

export const rateTypes = ["nightly", "hourly"] as const;
export const paymentOptionKinds = [
  "mpesa_till",
  "mpesa_paybill",
  "mpesa_send_money",
  "bank_transfer",
  "other",
] as const;

export type PropertyRole = (typeof propertyRoles)[number];
export type RoomStatus = (typeof roomStatuses)[number];
export type BookingStatus = (typeof bookingStatuses)[number];
export type BookingSource = (typeof bookingSources)[number];
export type PaymentMethod = (typeof paymentMethods)[number];
