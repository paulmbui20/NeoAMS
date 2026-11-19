// tests/rate-limit.test.ts
// The sign-in rate limit. It is the one limit that stands between an
// attacker and the password of an account.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createTestCtx, type TestCtx } from "./helpers";

describe("the sign-in rate limit", () => {
  let ctx: TestCtx;

  beforeAll(() => {
    // Five attempts a minute: enough to show the limit, few enough to
    // reach quickly.
    ctx = createTestCtx({
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_SIGN_IN_MAX: 5,
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Sign in with the wrong password. The answer is always the same. */
  const tryToSignIn = async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json" },
      payload: { email: "nobody@example.com", password: "WrongPass1234!" },
    });
    return res;
  };

  it("lets the first attempts through", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await tryToSignIn();
      expect(res.statusCode).toBe(401);
    }
  });

  it("refuses the next one", async () => {
    const res = await tryToSignIn();
    expect(res.statusCode).toBe(429);
  });

  it("says how long to wait", async () => {
    const res = await tryToSignIn();
    expect(res.statusCode).toBe(429);
    // The answer carries the number of seconds to wait.
    expect(res.headers["x-retry-after"]).toBeString();
  });

  it("does not refuse the ordinary API while the limit is on", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/setup/status",
    });
    expect(res.statusCode).toBe(200);
  });
});
