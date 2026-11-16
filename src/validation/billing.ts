// src/validation/billing.ts
import * as s from "superstruct";
import {
  paymentMethods,
  paymentOptionKinds,
  paymentStatuses,
} from "../db/enums";
import { Cents, int, pageShape, Phone, Ref, text } from "./common";

export const RecordPayment = s.object({
  type: s.enums(["deposit", "payment"]),
  amountCents: Cents,
  paymentMethod: s.enums(paymentMethods),
  transactionReferenceCode: s.optional(Ref),
});

export const ReviewPayment = s.object({
  decision: s.enums(["succeeded", "failed"]),
  amountCents: s.optional(Cents),
});

export const Refund = s.object({
  amountCents: Cents,
  paymentMethod: s.enums(paymentMethods),
  reason: text(1, 300),
  transactionReferenceCode: s.optional(Ref),
});

const proofFields = {
  amountCents: Cents,
  paymentMethod: s.defaulted(
    s.enums(["mpesa", "airtel_money", "bank_transfer", "other"]),
    "mpesa",
  ),
  transactionReferenceCode: s.optional(Ref),
  proofMessage: s.optional(text(1, 600)), // the pasted confirmation SMS
};
const hasProof = (v: {
  transactionReferenceCode?: string;
  proofMessage?: string;
}) =>
  Boolean(v.transactionReferenceCode || v.proofMessage) ||
  "Provide the transaction code or the confirmation message";

export const SubmitProofAsUser = s.refine(
  s.object(proofFields),
  "proof",
  hasProof,
);
export const SubmitProof = s.refine(
  s.object({ phone: Phone, ...proofFields }),
  "proof",
  hasProof,
);

export const PaymentListQuery = s.type({
  status: s.optional(s.enums(paymentStatuses)),
  ...pageShape,
});

const option = {
  kind: s.enums(paymentOptionKinds),
  label: text(1, 60),
  accountNumber: text(1, 60),
  accountName: text(1, 100),
  instructions: text(1, 1000),
  sortOrder: int(0, 1000),
  isActive: s.boolean(),
};
export const CreatePaymentOption = s.object({
  kind: option.kind,
  label: option.label,
  accountNumber: s.optional(option.accountNumber),
  accountName: s.optional(option.accountName),
  instructions: s.optional(option.instructions),
  sortOrder: s.defaulted(option.sortOrder, 0),
  isActive: s.defaulted(option.isActive, true),
});
export const UpdatePaymentOption = s.partial(s.object(option)); // no defaults, so a PATCH never overwrites

export type RecordPaymentInput = s.Infer<typeof RecordPayment>;
export type ReviewPaymentInput = s.Infer<typeof ReviewPayment>;
export type RefundInput = s.Infer<typeof Refund>;
export type ProofInput = s.Infer<typeof SubmitProofAsUser>;
export type PaymentListInput = s.Infer<typeof PaymentListQuery>;
export type CreatePaymentOptionInput = s.Infer<typeof CreatePaymentOption>;
export type UpdatePaymentOptionInput = s.Infer<typeof UpdatePaymentOption>;
