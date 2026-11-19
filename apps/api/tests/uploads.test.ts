// tests/uploads.test.ts
// Image upload: the type is decided by the bytes, never by the headers.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  assignStaff,
  createTestCtx,
  createUser,
  signIn,
  type TestCtx,
} from "./helpers";
import { detectImage } from "../src/core/uploads";

/** A tiny but genuine PNG: the 8-byte signature plus an IHDR chunk. */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);

/** A genuine JPEG header. */
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

/** A RIFF/WEBP header. */
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

/** A PDF, which must never be accepted as an image. */
const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3,
]);

/** Build a multipart body by hand so the bytes are exact. */
function multipart(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
  field = "file",
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----neoamsTestBoundary7d3f";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    payload: Buffer.concat([head, Buffer.from(bytes), tail]),
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
  };
}

describe("image detection", () => {
  it("recognises a PNG", () => {
    expect(detectImage(PNG_BYTES)?.mime).toBe("image/png");
    expect(detectImage(PNG_BYTES)?.ext).toBe(".png");
  });

  it("recognises a JPEG", () => {
    expect(detectImage(JPEG_BYTES)?.mime).toBe("image/jpeg");
    expect(detectImage(JPEG_BYTES)?.ext).toBe(".jpg");
  });

  it("recognises a WebP", () => {
    expect(detectImage(WEBP_BYTES)?.mime).toBe("image/webp");
    expect(detectImage(WEBP_BYTES)?.ext).toBe(".webp");
  });

  it("rejects a PDF", () => {
    expect(detectImage(PDF_BYTES)).toBeNull();
  });

  it("rejects an empty buffer", () => {
    expect(detectImage(new Uint8Array([]))).toBeNull();
  });

  it("rejects a truncated header", () => {
    expect(detectImage(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("uploads", () => {
  let ctx: TestCtx;
  let cookie: string;

  beforeAll(async () => {
    ctx = createTestCtx();
    const user = await createUser(ctx, {
      email: "uploader@example.com",
      password: "Test1234#!",
    });
    expect(user.id).toBeString();
    cookie = await signIn(ctx, "uploader@example.com");
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("needs a session", async () => {
    const { payload, headers } = multipart(PNG_BYTES, "a.png", "image/png");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/uploads",
      headers,
      payload,
    });
    expect(res.statusCode).toBe(401);
  });

  it("stores a PNG under a random name", async () => {
    const { payload, headers } = multipart(
      PNG_BYTES,
      "holiday.png",
      "image/png",
    );
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/uploads",
      headers: { ...headers, cookie },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.mimeType).toBe("image/png");
    expect(body.filename).toMatch(/^[a-f0-9-]+\.png$/);
    // The client's filename is not used.
    expect(body.filename).not.toContain("holiday");
    expect(body.url).toBe(`/uploads/${body.filename}`);
  });

  it("serves the stored image with the right type", async () => {
    const { payload, headers } = multipart(PNG_BYTES, "x.png", "image/png");
    const uploaded = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/uploads",
      headers: { ...headers, cookie },
      payload,
    });
    const { filename } = uploaded.json();

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/uploads/${filename}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("refuses a file that is not an image, whatever the header says", async () => {
    const { payload, headers } = multipart(
      PDF_BYTES,
      "invoice.pdf",
      "image/png",
    );
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/uploads",
      headers: { ...headers, cookie },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("UNSUPPORTED_IMAGE");
  });

  it("refuses a file whose bytes say one thing and whose name says another", async () => {
    const { payload, headers } = multipart(PDF_BYTES, "photo.png", "image/png");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/uploads",
      headers: { ...headers, cookie },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts a JPEG and a WebP", async () => {
    const jpeg = multipart(JPEG_BYTES, "a.jpg", "image/jpeg");
    const jpegRes = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/uploads",
      headers: { ...jpeg.headers, cookie },
      payload: jpeg.payload,
    });
    expect(jpegRes.statusCode).toBe(201);
    expect(jpegRes.json().mimeType).toBe("image/jpeg");

    const webp = multipart(WEBP_BYTES, "a.webp", "image/webp");
    const webpRes = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/uploads",
      headers: { ...webp.headers, cookie },
      payload: webp.payload,
    });
    expect(webpRes.statusCode).toBe(201);
    expect(webpRes.json().mimeType).toBe("image/webp");
  });

  it("refuses an empty file", async () => {
    const { payload, headers } = multipart(
      new Uint8Array([]),
      "empty.png",
      "image/png",
    );
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/uploads",
      headers: { ...headers, cookie },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("EMPTY_FILE");
  });

  it("refuses a file over the size limit", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(PNG_BYTES, 0);
    const { payload, headers } = multipart(big, "big.png", "image/png");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/uploads",
      headers: { ...headers, cookie },
      payload,
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("refuses an unexpected field name", async () => {
    const { payload, headers } = multipart(
      PNG_BYTES,
      "a.png",
      "image/png",
      "other",
    );
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/uploads",
      headers: { ...headers, cookie },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("NO_FILE");
  });

  it("answers 404 for an unknown image", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/uploads/00000000-0000-0000-0000-000000000000.png",
    });
    expect(res.statusCode).toBe(404);
  });

  it("refuses a path traversal in the filename", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/uploads/..%2F..%2Fetc%2Fpasswd",
    });
    expect(res.statusCode).toBe(404);
  });
});
