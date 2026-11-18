// src/validation/booking.ts
import * as s from "superstruct";
import { bookingSources, bookingStatuses, paymentMethods } from "./enums";
import { MAX_HOURS } from "./stay";
import { DeskGuest, PublicGuest } from "./guest";
import {
  Cents,
  Id,
  int,
  IsoDateTime,
  pageShape,
  Phone,
  Ref,
  text,
  YmdDate,
} from "./common";

const nightly = {
  type: s.literal("nightly"),
  checkInDate: YmdDate,
  checkOutDate: YmdDate,
};
const hourly = {
  type: s.literal("hourly"),
  checkIn: IsoDateTime,
  hours: int(1, MAX_HOURS),
};
const party = {
  adults: s.defaulted(int(1, 20), 1),
  children: s.defaulted(int(0, 20), 0),
};

export const Stay = s.union([s.object(nightly), s.object(hourly)]);

export const AvailabilityQuery = s.union([
  s.type({ ...nightly, ...party }),
  s.type({ ...hourly, ...party }),
]);
export const DeskAvailabilityQuery = s.union([
  s.type({ ...nightly, roomTypeId: s.optional(Id) }),
  s.type({ ...hourly, roomTypeId: s.optional(Id) }),
]);

export const CreateDeskBooking = s.refine(
  s.object({
    roomId: Id,
    stay: Stay,
    ...party,
    guestId: s.optional(Id),
    guest: s.optional(DeskGuest),
    specialRequests: s.optional(text(1, 500)),
    source: s.defaulted(s.enums(bookingSources), "walk_in"),
    depositRequiredCents: s.optional(int(0, 100_000_000)),
    initialPayment: s.optional(
      s.object({
        type: s.enums(["deposit", "payment"]),
        amountCents: Cents,
        paymentMethod: s.enums(paymentMethods),
        transactionReferenceCode: s.optional(Ref),
      }),
    ),
  }),
  "guest",
  (v) =>
    (v.guestId !== undefined) !== (v.guest !== undefined) ||
    "Provide either guestId or guest",
);

export const CreateOnlineBooking = s.object({
  roomTypeId: Id,
  stay: Stay,
  ...party,
  specialRequests: s.optional(text(1, 500)),
  guest: s.optional(PublicGuest), // required unless the caller is signed in and has a profile
});

export const BookingListQuery = s.type({
  status: s.optional(s.enums(bookingStatuses)),
  roomId: s.optional(Id),
  from: s.optional(IsoDateTime),
  to: s.optional(IsoDateTime),
  q: s.optional(text(1, 60)),
  ...pageShape,
});
export const MyBookingsQuery = s.type({
  when: s.optional(s.enums(["upcoming", "past"])),
  ...pageShape,
});

export const StaffCancel = s.object({ reason: text(1, 300) });
export const GuestCancelByPhone = s.object({
  phone: Phone,
  reason: s.optional(text(1, 300)),
});
export const GuestCancel = s.object({ reason: s.optional(text(1, 300)) });
export const GuestLookup = s.object({ reference: text(4, 30), phone: Phone });

export type DeskBookingInput = s.Infer<typeof CreateDeskBooking>;
export type OnlineBookingInput = s.Infer<typeof CreateOnlineBooking>;
export type BookingListInput = s.Infer<typeof BookingListQuery>;
export type MyBookingsInput = s.Infer<typeof MyBookingsQuery>;
