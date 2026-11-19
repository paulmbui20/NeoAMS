// src/validation/management.ts
// Payloads for the management surfaces: admin, property, staff, inventory,
// finance and oversight. Lives in shared so the UI can reuse every rule.
import * as s from "superstruct";
import {
  propertyRoles,
  roomStatuses,
  userRoles,
  paymentMethods,
} from "./enums";
import {
  Cents,
  Email,
  Id,
  int,
  IsoDateTime,
  pageShape,
  Phone,
  Ref,
  text,
  YmdDate,
} from "./common";

/** "14:00" — the property's local wall-clock time, Africa/Nairobi. */
export const TimeOfDay = s.refine(
  s.pattern(s.string(), /^([01]\d|2[0-3]):[0-5]\d$/),
  "HH:mm time",
  (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
);

export const Slug = s.pattern(s.string(), /^[a-z0-9-]{1,100}$/);
export const Url = s.pattern(s.string(), /^\/[^\s]*$/);

/* ------------------------------------------------------------------ admin */

export const CreateProperty = s.object({
  name: text(1, 120),
  slug: s.optional(Slug),
  description: s.optional(text(1, 1000)),
  country: s.optional(text(2, 60)),
  county: text(1, 60),
  town: text(1, 60),
  address: s.optional(text(1, 200)),
  phone: s.optional(Phone),
  email: s.optional(Email),
  checkInTime: s.optional(TimeOfDay),
  checkOutTime: s.optional(TimeOfDay),
  depositPercent: s.optional(int(0, 100)),
  // The first owner. Either someone who already exists, or a brand new user.
  owner: s.union([
    s.object({ userId: s.string() }),
    s.object({
      name: text(1, 100),
      email: Email,
      tempPassword: text(10, 100),
    }),
  ]),
});

export const UpdateProperty = s.partial(
  s.object({
    name: text(1, 120),
    description: s.optional(text(1, 1000)),
    country: text(2, 60),
    county: text(1, 60),
    town: text(1, 60),
    address: s.optional(text(1, 200)),
    phone: s.optional(Phone),
    email: s.optional(Email),
    checkInTime: TimeOfDay,
    checkOutTime: TimeOfDay,
    depositPercent: int(0, 100),
    isActive: s.boolean(),
  }),
);

export const AdminUserQuery = s.type({
  q: s.optional(text(1, 60)),
  role: s.optional(s.enums(userRoles)),
  ...pageShape,
});

export const CreateAdminUser = s.object({
  name: text(1, 100),
  email: Email,
  role: s.optional(s.enums(userRoles)),
  tempPassword: s.optional(text(10, 100)),
  mustChangePassword: s.optional(s.boolean()),
});

export const UpdateAdminUser = s.type({
  name: s.optional(text(1, 100)),
  role: s.optional(s.enums(userRoles)),
});

export const BanUser = s.object({
  reason: s.optional(text(1, 300)),
});

export const ResetPassword = s.object({
  newPassword: text(10, 100),
});

/* --------------------------------------------------------------- property */

export const UpdatePropertySettings = s.partial(
  s.object({
    name: text(1, 120),
    description: s.optional(text(1, 1000)),
    country: text(2, 60),
    county: text(1, 60),
    town: text(1, 60),
    address: s.optional(text(1, 200)),
    phone: s.optional(Phone),
    email: s.optional(Email),
    checkInTime: TimeOfDay,
    checkOutTime: TimeOfDay,
    depositPercent: int(0, 100),
    isActive: s.boolean(),
  }),
);

/* ------------------------------------------------------------------ staff */

/**
 * Adding staff either attaches an existing user or creates a new one.
 * A new user gets a temporary password and must change it at first sign-in.
 */
export const AddStaff = s.union([
  s.object({ userId: s.string(), role: s.enums(propertyRoles) }),
  s.object({
    name: text(1, 100),
    email: Email,
    tempPassword: text(10, 100),
    role: s.enums(propertyRoles),
  }),
]);

export const UpdateStaff = s.object({
  role: s.enums(propertyRoles),
});

export const StaffQuery = s.type({
  q: s.optional(text(1, 60)),
  role: s.optional(s.enums(propertyRoles)),
});

/* ------------------------------------------------------------ room types */

export const CreateRoomType = s.object({
  name: text(1, 80),
  slug: s.optional(Slug),
  description: s.optional(text(1, 1000)),
  pricePerNightCents: int(0, 100_000_000),
  pricePerHourCents: s.optional(int(0, 100_000_000)),
  maxOccupancy: s.optional(int(1, 20)),
  bedConfiguration: s.optional(text(1, 60)),
  isActive: s.optional(s.boolean()),
});

export const UpdateRoomType = s.partial(CreateRoomType);

export const RoomTypeAmenities = s.object({
  amenityIds: s.array(Id),
});

/* ------------------------------------------------------------------ rooms */

export const CreateRoom = s.object({
  roomTypeId: Id,
  roomNumber: text(1, 20),
  floor: s.optional(text(1, 60)),
  description: s.optional(text(1, 500)),
  status: s.optional(s.enums(roomStatuses)),
  isActive: s.optional(s.boolean()),
});

export const UpdateRoom = s.partial(
  s.object({
    roomTypeId: Id,
    roomNumber: text(1, 20),
    floor: s.optional(text(1, 60)),
    description: s.optional(text(1, 500)),
    isActive: s.optional(s.boolean()),
  }),
);

export const UpdateRoomStatus = s.object({
  status: s.enums(roomStatuses),
});

export const RoomQuery = s.type({
  floor: s.optional(text(1, 60)),
  status: s.optional(s.enums(roomStatuses)),
  roomTypeId: s.optional(Id),
});

/* -------------------------------------------------------------- amenities */

export const PropertyAmenities = s.object({
  amenityIds: s.array(Id),
});

export const CreateAmenity = s.object({
  name: text(1, 60),
  icon: s.optional(text(1, 40)),
});

/* --------------------------------------------------------------- services */

export const CreateService = s.object({
  name: text(1, 80),
  slug: s.optional(Slug),
  description: s.optional(text(1, 500)),
  priceCents: int(0, 100_000_000),
  isActive: s.optional(s.boolean()),
});

export const UpdateService = s.partial(CreateService);

export const AddBookingService = s.object({
  serviceId: Id,
  quantity: s.optional(int(1, 100)),
  notes: s.optional(text(1, 300)),
});

/* --------------------------------------------------------------- bookings */

export const UpdateBooking = s.object({
  adults: s.optional(int(1, 20)),
  children: s.optional(int(0, 20)),
  specialRequests: s.optional(text(1, 500)),
  depositRequiredCents: s.optional(int(0, 100_000_000)),
});

export const AddBookingGuest = s.object({
  guestId: Id,
});

/* ---------------------------------------------------------------- finance */

export const ExpenseQuery = s.type({
  from: s.optional(YmdDate),
  to: s.optional(YmdDate),
  categoryId: s.optional(Id),
  ...pageShape,
});

export const CreateExpense = s.object({
  categoryId: Id,
  description: text(1, 300),
  amountCents: Cents,
  paymentMethod: s.optional(s.enums(paymentMethods)),
  reference: s.optional(Ref),
  expenseDate: YmdDate,
  notes: s.optional(text(1, 1000)),
});

export const UpdateExpense = s.partial(
  s.object({
    categoryId: Id,
    description: text(1, 300),
    amountCents: Cents,
    paymentMethod: s.optional(s.enums(paymentMethods)),
    reference: s.optional(Ref),
    expenseDate: YmdDate,
    notes: s.optional(text(1, 1000)),
  }),
);

export const CreateExpenseCategory = s.object({
  name: text(1, 60),
  description: s.optional(text(1, 300)),
});

export const ReportQuery = s.type({
  from: s.optional(YmdDate),
  to: s.optional(YmdDate),
});

export const RevenueQuery = s.type({
  from: s.optional(YmdDate),
  to: s.optional(YmdDate),
  groupBy: s.optional(s.enums(["day", "month"])),
});

/* -------------------------------------------------------------- oversight */

export const AuditLogQuery = s.type({
  entity: s.optional(text(1, 40)),
  entityId: s.optional(text(1, 40)),
  userId: s.optional(text(1, 60)),
  from: s.optional(IsoDateTime),
  to: s.optional(IsoDateTime),
  ...pageShape,
});

export type CreatePropertyInput = s.Infer<typeof CreateProperty>;
export type UpdatePropertyInput = s.Infer<typeof UpdateProperty>;
export type AdminUserQueryInput = s.Infer<typeof AdminUserQuery>;
export type CreateAdminUserInput = s.Infer<typeof CreateAdminUser>;
export type UpdateAdminUserInput = s.Infer<typeof UpdateAdminUser>;
export type AddStaffInput = s.Infer<typeof AddStaff>;
export type CreateRoomTypeInput = s.Infer<typeof CreateRoomType>;
export type UpdateRoomTypeInput = s.Infer<typeof UpdateRoomType>;
export type CreateRoomInput = s.Infer<typeof CreateRoom>;
export type UpdateRoomInput = s.Infer<typeof UpdateRoom>;
export type UpdateRoomStatusInput = s.Infer<typeof UpdateRoomStatus>;
export type CreateServiceInput = s.Infer<typeof CreateService>;
export type UpdateServiceInput = s.Infer<typeof UpdateService>;
export type CreateExpenseInput = s.Infer<typeof CreateExpense>;
export type UpdateExpenseInput = s.Infer<typeof UpdateExpense>;
export type ReportQueryInput = s.Infer<typeof ReportQuery>;
export type RevenueQueryInput = s.Infer<typeof RevenueQuery>;
export type AuditLogQueryInput = s.Infer<typeof AuditLogQuery>;
