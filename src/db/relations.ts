import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session(),
    accounts: r.many.account(),
    staffAssignments: r.many.propertyStaff(),
    guest: r.one.guests({ from: r.user.id, to: r.guests.userId }),
    createdBookings: r.many.bookings(),
    recordedPayments: r.many.payments(),
    recordedExpenses: r.many.expenses(),
    auditLogs: r.many.auditLogs(),
  },
  session: { user: r.one.user({ from: r.session.userId, to: r.user.id }) },
  account: { user: r.one.user({ from: r.account.userId, to: r.user.id }) },

  properties: {
    staff: r.many.propertyStaff(),
    images: r.many.propertyImages(),
    amenities: r.many.propertyAmenities(),
    roomTypes: r.many.roomTypes(),
    rooms: r.many.rooms(),
    services: r.many.services(),
    expenses: r.many.expenses(),
    paymentOptions: r.many.paymentOptions(),
  },
  propertyStaff: {
    property: r.one.properties({
      from: r.propertyStaff.propertyId,
      to: r.properties.id,
    }),
    user: r.one.user({ from: r.propertyStaff.userId, to: r.user.id }),
  },
  propertyImages: {
    property: r.one.properties({
      from: r.propertyImages.propertyId,
      to: r.properties.id,
    }),
  },
  amenities: {
    properties: r.many.propertyAmenities(),
    roomTypes: r.many.roomTypeAmenities(),
  },
  propertyAmenities: {
    property: r.one.properties({
      from: r.propertyAmenities.propertyId,
      to: r.properties.id,
    }),
    amenity: r.one.amenities({
      from: r.propertyAmenities.amenityId,
      to: r.amenities.id,
    }),
  },

  roomTypes: {
    property: r.one.properties({
      from: r.roomTypes.propertyId,
      to: r.properties.id,
    }),
    rooms: r.many.rooms(),
    images: r.many.roomTypeImages(),
    amenities: r.many.roomTypeAmenities(),
  },
  roomTypeImages: {
    roomType: r.one.roomTypes({
      from: r.roomTypeImages.roomTypeId,
      to: r.roomTypes.id,
    }),
  },
  roomTypeAmenities: {
    roomType: r.one.roomTypes({
      from: r.roomTypeAmenities.roomTypeId,
      to: r.roomTypes.id,
    }),
    amenity: r.one.amenities({
      from: r.roomTypeAmenities.amenityId,
      to: r.amenities.id,
    }),
  },
  rooms: {
    property: r.one.properties({
      from: r.rooms.propertyId,
      to: r.properties.id,
    }),
    roomType: r.one.roomTypes({ from: r.rooms.roomTypeId, to: r.roomTypes.id }),
    bookings: r.many.bookings(),
  },

  guests: {
    user: r.one.user({ from: r.guests.userId, to: r.user.id }),
    bookings: r.many.bookings(),
    additionalBookings: r.many.additionalGuests(),
  },
  bookings: {
    guest: r.one.guests({ from: r.bookings.guestId, to: r.guests.id }),
    room: r.one.rooms({ from: r.bookings.roomId, to: r.rooms.id }),
    creator: r.one.user({ from: r.bookings.createdBy, to: r.user.id }),
    additionalGuests: r.many.additionalGuests(),
    payments: r.many.payments(),
    serviceBookings: r.many.serviceBookings(),
    review: r.one.reviews({ from: r.bookings.id, to: r.reviews.bookingId }),
  },
  additionalGuests: {
    booking: r.one.bookings({
      from: r.additionalGuests.bookingId,
      to: r.bookings.id,
    }),
    guest: r.one.guests({ from: r.additionalGuests.guestId, to: r.guests.id }),
  },
  reviews: {
    booking: r.one.bookings({ from: r.reviews.bookingId, to: r.bookings.id }),
  },

  payments: {
    booking: r.one.bookings({ from: r.payments.bookingId, to: r.bookings.id }),
    recorder: r.one.user({ from: r.payments.recordedBy, to: r.user.id }),
  },

  services: {
    property: r.one.properties({
      from: r.services.propertyId,
      to: r.properties.id,
    }),
    bookings: r.many.serviceBookings(),
  },
  serviceBookings: {
    booking: r.one.bookings({
      from: r.serviceBookings.bookingId,
      to: r.bookings.id,
    }),
    service: r.one.services({
      from: r.serviceBookings.serviceId,
      to: r.services.id,
    }),
  },

  expenseCategories: { expenses: r.many.expenses() },
  expenses: {
    property: r.one.properties({
      from: r.expenses.propertyId,
      to: r.properties.id,
    }),
    category: r.one.expenseCategories({
      from: r.expenses.categoryId,
      to: r.expenseCategories.id,
    }),
    recorder: r.one.user({ from: r.expenses.recordedBy, to: r.user.id }),
  },

  auditLogs: { user: r.one.user({ from: r.auditLogs.userId, to: r.user.id }) },

  paymentOptions: {
    property: r.one.properties({
      from: r.paymentOptions.propertyId,
      to: r.properties.id,
    }),
  },
}));
