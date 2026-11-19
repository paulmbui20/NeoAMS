// src/core/storage.ts
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectedImage } from "./uploads";

export interface UploadedFile {
  filename: string;
  url: string;
  mimeType: string;
}

export interface StorageProvider {
  save(file: Buffer, image: DetectedImage): Promise<UploadedFile>;
  delete(filename: string): Promise<void>;
  read(filename: string): Promise<Buffer>;
}

/**
 * Files land on disk under random names, so a hostile filename can never
 * escape the upload directory.
 */
export class LocalStorage implements StorageProvider {
  constructor(private uploadDir: string) {}

  private async ensureDir() {
    await mkdir(this.uploadDir, { recursive: true });
  }

  async save(file: Buffer, image: DetectedImage): Promise<UploadedFile> {
    await this.ensureDir();
    const filename = `${randomUUID()}${image.ext}`;
    await writeFile(join(this.uploadDir, filename), file);
    return {
      filename,
      url: `/uploads/${filename}`,
      mimeType: image.mime,
    };
  }

  async delete(filename: string): Promise<void> {
    try {
      await unlink(join(this.uploadDir, filename));
    } catch {
      // Already gone. Deleting an image should never fail the request.
    }
  }

  async read(filename: string): Promise<Buffer> {
    return readFile(join(this.uploadDir, filename));
  }
}
