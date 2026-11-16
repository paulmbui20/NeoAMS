// src/routes/staff/billing.ts
import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../../http/types";
import {
  CreatePaymentOption,
  PaymentListQuery,
  RecordPayment,
  Refund,
  ReviewPayment,
  UpdatePaymentOption,
} from "../../validation/billing";
import {
  IdParams,
  OptionParams,
  parse,
  PaymentParams,
  PropertyParams,
} from "../../validation/common";

export const staffBillingRoutes =
  ({
    services: { booking, billing },
    guards: { can },
  }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    app.post(
      "/bookings/:id/payments",
      { preHandler: can("payment:write") },
      async (req, reply) => {
        const { propertyId, id } = parse(IdParams, req.params);
        return reply
          .code(201)
          .send(
            booking.recordPayment(
              propertyId,
              id,
              parse(RecordPayment, req.body),
              req.actor,
            ),
          );
      },
    );

    // the proof queue: ?status=pending
    app.get("/payments", { preHandler: can("booking:read") }, async (req) =>
      billing.listPayments(
        parse(PropertyParams, req.params).propertyId,
        parse(PaymentListQuery, req.query),
      ),
    );

    app.post(
      "/payments/:paymentId/review",
      { preHandler: can("payment:write") },
      async (req) => {
        const { propertyId, paymentId } = parse(PaymentParams, req.params);
        return booking.reviewPayment(
          propertyId,
          paymentId,
          parse(ReviewPayment, req.body),
          req.actor,
        );
      },
    );

    app.post(
      "/payments/:paymentId/refund",
      { preHandler: can("payment:refund") },
      async (req, reply) => {
        const { propertyId, paymentId } = parse(PaymentParams, req.params);
        return reply
          .code(201)
          .send(
            billing.refund(
              propertyId,
              paymentId,
              parse(Refund, req.body),
              req.actor,
            ),
          );
      },
    );

    // "how to pay": owner-only to change, because it controls where guests' money goes
    app.get(
      "/payment-options",
      { preHandler: can("booking:read") },
      async (req) => ({
        data: billing.listPaymentOptions(
          parse(PropertyParams, req.params).propertyId,
        ),
      }),
    );

    app.post(
      "/payment-options",
      { preHandler: can("property:manage") },
      async (req, reply) => {
        const { propertyId } = parse(PropertyParams, req.params);
        return reply
          .code(201)
          .send(
            billing.createPaymentOption(
              propertyId,
              parse(CreatePaymentOption, req.body),
              req.actor,
            ),
          );
      },
    );

    app.patch(
      "/payment-options/:optionId",
      { preHandler: can("property:manage") },
      async (req) => {
        const { propertyId, optionId } = parse(OptionParams, req.params);
        return billing.updatePaymentOption(
          propertyId,
          optionId,
          parse(UpdatePaymentOption, req.body),
          req.actor,
        );
      },
    );
  };
