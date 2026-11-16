// src/validation/common.ts
import * as s from "superstruct";

export const parse = <T, S>(struct: s.Struct<T, S>, value: unknown): T =>
  s.create(value, struct);

export const text = (min: number, max: number) =>
  s.size(
    s.coerce(s.string(), s.string(), (v) => v.trim()),
    min,
    max,
  );

// accepts JSON numbers and query-string numbers
const intFromString = s.coerce(s.integer(), s.string(), (v) =>
  v.trim() === "" ? NaN : Number(v),
);
export const int = (min: number, max: number) =>
  s.size(intFromString, min, max);

export const Id = int(1, Number.MAX_SAFE_INTEGER);
export const Cents = int(1, 100_000_000); // KES 1,000,000 ceiling catches typos
export const Phone = text(7, 20); // format is checked by normalizePhone
export const Email = s.pattern(text(3, 254), /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
export const Ref = s.pattern(text(4, 40), /^[A-Za-z0-9-]+$/);

export const YmdDate = s.refine(
  s.pattern(s.string(), /^\d{4}-\d{2}-\d{2}$/),
  "calendar date",
  (v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  },
);

const ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
export const IsoDateTime = s.coerce(
  s.date(),
  s.pattern(s.string(), ISO),
  (v) => new Date(v),
); // offset required

export const pageShape = {
  limit: s.defaulted(int(1, 100), 20),
  offset: s.defaulted(int(0, 1_000_000), 0),
};
export const PageQuery = s.type(pageShape);

export const PropertyParams = s.type({ propertyId: Id });
export const IdParams = s.type({ propertyId: Id, id: Id });
export const PaymentParams = s.type({ propertyId: Id, paymentId: Id });
export const OptionParams = s.type({ propertyId: Id, optionId: Id });
export const SlugParams = s.type({
  slug: s.pattern(s.string(), /^[a-z0-9-]{1,100}$/),
});
export const ReferenceParams = s.type({ reference: text(4, 30) });
