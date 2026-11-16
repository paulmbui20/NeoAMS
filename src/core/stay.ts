// src/core/stay.ts  (pure: no DB, trivially testable)
import { ValidationError } from "./errors";

export const MAX_NIGHTS = 60;
export const MAX_HOURS = 12;
const TZ = "+03:00"; // Africa/Nairobi: UTC+3, no DST
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type StayInput =
  | { type: "nightly"; checkInDate: string; checkOutDate: string }
  | { type: "hourly"; checkIn: Date; hours: number };
export type ResolvedStay = {
  rateType: "nightly" | "hourly";
  units: number;
  checkIn: Date;
  checkOut: Date;
};
export type Schedule = { checkInTime: string; checkOutTime: string };
export type RateCard = {
  pricePerNightCents: number;
  pricePerHourCents: number | null;
};

const at = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00${TZ}`);

export function resolveStay(stay: StayInput, schedule: Schedule): ResolvedStay {
  if (stay.type === "hourly") {
    return {
      rateType: "hourly",
      units: stay.hours,
      checkIn: stay.checkIn,
      checkOut: new Date(stay.checkIn.getTime() + stay.hours * HOUR),
    };
  }
  const nights = Math.round(
    (Date.parse(`${stay.checkOutDate}T00:00:00Z`) -
      Date.parse(`${stay.checkInDate}T00:00:00Z`)) /
      DAY,
  );
  if (nights < 1 || nights > MAX_NIGHTS) {
    throw new ValidationError(
      `A stay must be 1 to ${MAX_NIGHTS} nights`,
      undefined,
      "INVALID_STAY",
    );
  }
  return {
    rateType: "nightly",
    units: nights,
    checkIn: at(stay.checkInDate, schedule.checkInTime),
    checkOut: at(stay.checkOutDate, schedule.checkOutTime),
  };
}

export const unitRate = (rate: RateCard, type: ResolvedStay["rateType"]) =>
  type === "nightly" ? rate.pricePerNightCents : rate.pricePerHourCents;

/** nightly: nights × nightly rate · hourly: hours × hourly rate */
export function priceStay(rate: RateCard, stay: ResolvedStay): number {
  const unit = unitRate(rate, stay.rateType);
  if (unit === null)
    throw new ValidationError(
      "This room type is not offered hourly",
      undefined,
      "HOURLY_NOT_OFFERED",
    );
  return unit * stay.units;
}

export function assertNotPast(stay: ResolvedStay, now: Date) {
  if (stay.checkOut <= now)
    throw new ValidationError(
      "That stay is in the past",
      undefined,
      "STAY_IN_PAST",
    );
}
