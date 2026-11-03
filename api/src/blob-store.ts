import type { Bytes } from "@biko-jobs/api-client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type BlobStore = {
  get(uuid: string): Promise<Bytes | undefined>;
  put(uuid: string, data: Bytes): Promise<void>;
};

export class DirectoryBlobStore implements BlobStore {
  private directory: string;
  constructor(directory: string) {
    this.directory = directory;
  }

  private path(uuid: string) {
    const base = join(this.directory, uuid.slice(0, 2));
    const full = join(base, uuid);
    return { base, full };
  }

  async get(uuid: string): Promise<Bytes | undefined> {
    try {
      return await readFile(this.path(uuid).full);
    } catch (e) {
      if (e instanceof Object && (e as any).code === "ENOENT") {
        return undefined;
      } else {
        throw e;
      }
    }
  }

  async put(uuid: string, data: Bytes): Promise<void> {
    const path = this.path(uuid);
    await mkdir(path.base, { recursive: true });
    try {
      return await writeFile(path.full, data, { flag: "wx" });
    } catch (e) {
      if (e instanceof Object && (e as any).code === "EEXIST") {
        throw "already exists";
      } else {
        throw e;
      }
    }
  }
}

export class MemoryBlobStore implements BlobStore {
  private blobs: Map<string, Bytes>;
  constructor() {
    this.blobs = new Map();
  }

  async get(uuid: string): Promise<Bytes | undefined> {
    return this.blobs.get(uuid);
  }

  async put(uuid: string, data: Bytes): Promise<void> {
    if (this.blobs.has(uuid)) {
      throw "already exists";
    }
    this.blobs.set(uuid, data);
  }
}
