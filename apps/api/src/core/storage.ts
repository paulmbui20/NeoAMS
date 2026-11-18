import { randomUUID } from "crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface UploadedFile {
  filename: string;
  url: string;
  mimeType: string;
}

export interface StorageProvider {
  save(file: Buffer, mimeType: string): Promise<UploadedFile>;
  delete(filename: string): Promise<void>;
}

export class LocalStorage implements StorageProvider {
  constructor(private uploadDir: string) {}

  async save(file: Buffer, mimeType: string): Promise<UploadedFile> {
    const filename = `${randomUUID()}`;
    const ext =
      mimeType === "image/jpeg"
        ? ".jpg"
        : mimeType === "image/png"
          ? ".png"
          : ".webp";
    const fullFilename = `${filename}${ext}`;

    await mkdir(this.uploadDir, { recursive: true });
    await writeFile(join(this.uploadDir, fullFilename), file);

    return {
      filename: fullFilename,
      url: `/uploads/${fullFilename}`,
      mimeType,
    };
  }

  async delete(filename: string): Promise<void> {
    // Use fs.unlink
  }
}
