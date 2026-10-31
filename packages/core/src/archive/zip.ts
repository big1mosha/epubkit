import { unzipSync, zipSync, type Zippable } from "fflate";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** Store without compression. Required for the EPUB mimetype entry. */
  store?: boolean;
}

export function readZip(data: Uint8Array): Map<string, Uint8Array> {
  const raw = unzipSync(data);
  const out = new Map<string, Uint8Array>();
  for (const [name, bytes] of Object.entries(raw)) {
    if (name.endsWith("/")) continue;
    out.set(name, bytes);
  }
  return out;
}

export function writeZip(entries: ZipEntry[], modified?: Date): Uint8Array {
  const files: Zippable = {};
  for (const entry of entries) {
    files[entry.name] = [entry.data, { level: entry.store ? 0 : 6 }];
  }
  const mtime = modified ?? new Date();
  // ZIP stores timestamps with two second precision; clamp to the epoch floor.
  return zipSync(files, { mtime: mtime.getTime() < 315532800000 ? new Date(315532800000) : mtime });
}

/** Read the compression method of the first local file header. */
export function firstEntryInfo(data: Uint8Array): { name: string; method: number } | null {
  if (data.length < 30) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) return null;
  const method = view.getUint16(8, true);
  const nameLength = view.getUint16(26, true);
  const name = new TextDecoder().decode(data.subarray(30, 30 + nameLength));
  return { name, method };
}
