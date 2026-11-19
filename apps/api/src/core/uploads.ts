// src/core/uploads.ts
// Image validation. The file type is decided by the bytes, never by the
// extension or the client's Content-Type header.
import { ValidationError } from "./errors";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Magic-byte signatures. */
const SIGNATURES: {
  mime: AllowedImageType;
  ext: string;
  test: (b: Uint8Array) => boolean;
}[] = [
  {
    mime: "image/jpeg",
    ext: ".jpg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    ext: ".png",
    test: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: "image/webp",
    ext: ".webp",
    test: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

export type DetectedImage = { mime: AllowedImageType; ext: string };

/** Identify an image from its leading bytes. */
export function detectImage(bytes: Uint8Array): DetectedImage | null {
  for (const sig of SIGNATURES) {
    if (bytes.length >= 12 && sig.test(bytes)) {
      return { mime: sig.mime, ext: sig.ext };
    }
  }
  return null;
}

/** Throws unless the buffer is a JPEG, PNG or WebP. */
export function assertAllowedImage(bytes: Uint8Array): DetectedImage {
  const detected = detectImage(bytes);
  if (!detected) {
    throw new ValidationError(
      "Only JPEG, PNG and WebP images are accepted",
      undefined,
      "UNSUPPORTED_IMAGE",
    );
  }
  return detected;
}
