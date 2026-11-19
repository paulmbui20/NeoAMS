// src/validation/guest.ts
import * as s from "superstruct";
import { genders, idTypes } from "./enums";
import { Email, pageShape, Phone, text, YmdDate } from "./common";

const name = text(1, 60);
const profile = {
  firstName: name,
  middleName: s.optional(name),
  lastName: name,
  phone: Phone,
  email: s.optional(Email),
  country: s.optional(text(2, 60)),
  nationality: s.optional(text(2, 60)),
  dateOfBirth: s.optional(YmdDate),
  gender: s.optional(s.enums(genders)),
  address: s.optional(text(1, 200)),
};

/** Online guest: just enough to reach them. ID is collected and verified at the desk. */
export const PublicGuest = s.object({
  firstName: name,
  lastName: name,
  phone: Phone,
  email: s.optional(Email),
});

/** Self-service profile: no ID document and no staff notes. */
export const GuestProfile = s.object(profile);

/** Desk guest: adds the ID document and internal notes. */
export const DeskGuest = s.refine(
  s.object({
    ...profile,
    idType: s.optional(s.enums(idTypes)),
    idNumber: s.optional(text(3, 30)),
    notes: s.optional(text(1, 500)),
  }),
  "id pair",
  (v) =>
    (v.idType === undefined) === (v.idNumber === undefined) ||
    "idType and idNumber go together",
);

/** The guest list: a search term is optional, so the list may be browsed. */
export const GuestSearchQuery = s.type({
  q: s.optional(text(1, 60)),
  ...pageShape,
});

export type PublicGuestInput = s.Infer<typeof PublicGuest>;
export type GuestProfileInput = s.Infer<typeof GuestProfile>;
export type DeskGuestInput = s.Infer<typeof DeskGuest>;
