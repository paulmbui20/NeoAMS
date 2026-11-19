// src/routes/staff/finance.ts  (prefix /api/v1/properties/:propertyId)
// Expenses, expense categories and reports.
import type { FastifyPluginAsync } from "fastify";
import * as s from "superstruct";
import {
  CreateExpense,
  CreateExpenseCategory,
  ExpenseQuery,
  ReportQuery,
  RevenueQuery,
  UpdateExpense,
  parse,
} from "@neoams/shared";
import { IdParams, PropertyParams } from "@neoams/shared";
import type { RouteDeps } from "../../http/types";

export const staffFinanceRoutes =
  ({ services: { finance }, guards: { can } }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    /* ------------------------------------------------------------ expenses */

    app.get("/expenses", { preHandler: can("expense:manage") }, async (req) => {
      const { propertyId } = parse(PropertyParams, req.params);
      const filter = parse(ExpenseQuery, req.query);
      return finance.listExpenses(propertyId, filter);
    });

    app.post(
      "/expenses",
      { preHandler: can("expense:manage") },
      async (req, reply) => {
        const { propertyId } = parse(PropertyParams, req.params);
        const input = parse(CreateExpense, req.body);
        const row = finance.createExpense(propertyId, input, req.actor.userId);
        return reply.code(201).send(row);
      },
    );

    app.patch(
      "/expenses/:id",
      { preHandler: can("expense:manage") },
      async (req) => {
        const { propertyId, id } = parse(IdParams, req.params);
        const patch = parse(UpdateExpense, req.body);
        return finance.updateExpense(propertyId, id, patch);
      },
    );

    /* --------------------------------------------------- expense categories */

    app.get(
      "/expense-categories",
      { preHandler: can("expense:manage") },
      async () => ({ data: finance.listCategories() }),
    );

    app.post(
      "/expense-categories",
      { preHandler: can("expense:manage") },
      async (req, reply) => {
        const input = parse(CreateExpenseCategory, req.body);
        return reply.code(201).send(finance.createCategory(input));
      },
    );

    /* ------------------------------------------------------------- reports */

    app.get(
      "/reports/summary",
      { preHandler: can("report:read") },
      async (req) => {
        const { propertyId } = parse(PropertyParams, req.params);
        const { from, to } = parse(ReportQuery, req.query);
        return finance.summary(propertyId, from, to);
      },
    );

    app.get(
      "/reports/revenue",
      { preHandler: can("report:read") },
      async (req) => {
        const { propertyId } = parse(PropertyParams, req.params);
        const { from, to, groupBy } = parse(RevenueQuery, req.query);
        return finance.revenue(propertyId, from, to, groupBy ?? "day");
      },
    );
  };
