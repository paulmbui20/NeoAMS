// src/core/normalize.ts
import { ValidationError } from "./errors";

/** Kenyan formats (07xx, 01xx, 254…, +254…) → +254…; other countries must already be +<digits>. */
export function normalizePhone(raw: string): string {
  const s = raw.replace(/[\s().-]/g, "");
  let out: string;
  if (/^\+\d+$/.test(s)) out = s;
  else if (/^254\d{9}$/.test(s)) out = `+${s}`;
  else if (/^0[17]\d{8}$/.test(s)) out = `+254${s.slice(1)}`;
  else if (/^[17]\d{8}$/.test(s)) out = `+254${s}`;
  else out = "";
  if (!/^\+\d{8,15}$/.test(out))
    throw new ValidationError(
      "Invalid phone number",
      undefined,
      "INVALID_PHONE",
    );
  return out;
}

/** ID numbers, booking references, M-Pesa codes: no spaces, uppercase. */
export const normalizeCode = (s: string) => s.replace(/\s+/g, "").toUpperCase();
