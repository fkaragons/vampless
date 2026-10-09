/**
 * Image fingerprints.
 *
 * The core never decodes files itself. Callers supply decoded RGBA pixels
 * (Node: pngjs / jpeg-js via `@vampless/core/node`; browser: <canvas>). This
 * keeps the fingerprint math identical in every environment.
 *
 * Three signals, each with a different job:
 *   raw        SHA-256 of the file bytes. Catches identical files.
 *   pixel      SHA-256 of dimensions + RGBA pixels composited over white.
 *              Catches re-packaging (PNG→WebP, metadata stripped). NOT resizes.
 *   perceptual 64-bit pHash. Finds likely visual duplicates for *review*.
 */

import { sha256 } from "@noble/hashes/sha256";
import { concat, toHex, u32le, utf8 } from "./encoding.ts";

export const IMAGE_PIPELINE_VERSION = "img-v1" as const;

/** Supported static raster formats for the pilot. Animation/SVG are rejected. */
export const SUPPORTED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export type SupportedMime = (typeof SUPPORTED_MIME)[number];

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_DIM = 4096;
export const MIN_IMAGE_DIM = 16;

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA8, row-major, length = width*height*4 */
  data: Uint8Array | Uint8ClampedArray;
}

export interface ImageFingerprint {
  raw: Uint8Array; // 32 bytes
  pixel: Uint8Array; // 32 bytes
  perceptual: Uint8Array; // 8 bytes
  width: number;
  height: number;
  byteLength: number;
  pipeline: typeof IMAGE_PIPELINE_VERSION;
}

export type ImageValidationError =
  | { ok: false; code: "TOO_LARGE"; reason: string }
  | { ok: false; code: "BAD_DIMENSIONS"; reason: string }
  | { ok: false; code: "BAD_BUFFER"; reason: string };

export function validateDecoded(img: DecodedImage): { ok: true } | ImageValidationError {
  if (!Number.isInteger(img.width) || !Number.isInteger(img.height))
    return { ok: false, code: "BAD_DIMENSIONS", reason: "non-integer dimensions" };
  if (img.width < MIN_IMAGE_DIM || img.height < MIN_IMAGE_DIM)
    return { ok: false, code: "BAD_DIMENSIONS", reason: `image smaller than ${MIN_IMAGE_DIM}px` };
  if (img.width > MAX_IMAGE_DIM || img.height > MAX_IMAGE_DIM)
    return { ok: false, code: "BAD_DIMENSIONS", reason: `image larger than ${MAX_IMAGE_DIM}px` };
  if (img.data.length !== img.width * img.height * 4)
    return { ok: false, code: "BAD_BUFFER", reason: "pixel buffer length does not match dimensions" };
  return { ok: true };
}

export function rawDigest(fileBytes: Uint8Array): Uint8Array {
  return sha256(fileBytes);
}

/**
 * Composite RGBA over opaque white. Returns RGB8 (3 bytes/pixel). The alpha
 * policy is part of the pipeline version: changing it changes every digest.
 */
export function compositeOverWhite(img: DecodedImage): Uint8Array {
  const n = img.width * img.height;
  const out = new Uint8Array(n * 3);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const a = (d[i * 4 + 3] as number) / 255;
    out[i * 3] = Math.round((d[i * 4] as number) * a + 255 * (1 - a));
    out[i * 3 + 1] = Math.round((d[i * 4 + 1] as number) * a + 255 * (1 - a));
    out[i * 3 + 2] = Math.round((d[i * 4 + 2] as number) * a + 255 * (1 - a));
  }
  return out;
}

export function pixelDigest(img: DecodedImage): Uint8Array {
  const rgb = compositeOverWhite(img);
  return sha256(concat(utf8("vampless/pixel/img-v1"), u32le(img.width), u32le(img.height), rgb));
}

// ---------------------------------------------------------------------------
// Perceptual hash (pHash, 64-bit)
// ---------------------------------------------------------------------------

const PH_SIZE = 32;
const PH_LOW = 8;

/** Box-filter downsample of composited grayscale to PH_SIZE×PH_SIZE floats. */
function grayscale32(img: DecodedImage): Float64Array {
  const rgb = compositeOverWhite(img);
  const out = new Float64Array(PH_SIZE * PH_SIZE);
  const w = img.width;
  const h = img.height;
  for (let gy = 0; gy < PH_SIZE; gy++) {
    const y0 = Math.floor((gy * h) / PH_SIZE);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * h) / PH_SIZE));
    for (let gx = 0; gx < PH_SIZE; gx++) {
      const x0 = Math.floor((gx * w) / PH_SIZE);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * w) / PH_SIZE));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 3;
          // Rec. 601 luma
          sum += 0.299 * (rgb[i] as number) + 0.587 * (rgb[i + 1] as number) + 0.114 * (rgb[i + 2] as number);
          count++;
        }
      }
      out[gy * PH_SIZE + gx] = sum / count;
    }
  }
  return out;
}

let dctTable: Float64Array | null = null;
function getDctTable(): Float64Array {
  if (dctTable) return dctTable;
  const t = new Float64Array(PH_SIZE * PH_SIZE);
  for (let u = 0; u < PH_SIZE; u++) {
    for (let x = 0; x < PH_SIZE; x++) {
      t[u * PH_SIZE + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * PH_SIZE));
    }
  }
  dctTable = t;
  return t;
}

/** Separable 2-D DCT-II, returns only the top-left PH_LOW×PH_LOW block. */
function dctLowFreq(g: Float64Array): Float64Array {
  const t = getDctTable();
  // rows
  const rows = new Float64Array(PH_SIZE * PH_LOW);
  for (let y = 0; y < PH_SIZE; y++) {
    for (let u = 0; u < PH_LOW; u++) {
      let s = 0;
      for (let x = 0; x < PH_SIZE; x++) s += (g[y * PH_SIZE + x] as number) * (t[u * PH_SIZE + x] as number);
      rows[y * PH_LOW + u] = s;
    }
  }
  // cols
  const out = new Float64Array(PH_LOW * PH_LOW);
  for (let v = 0; v < PH_LOW; v++) {
    for (let u = 0; u < PH_LOW; u++) {
      let s = 0;
      for (let y = 0; y < PH_SIZE; y++) s += (rows[y * PH_LOW + u] as number) * (t[v * PH_SIZE + y] as number);
      out[v * PH_LOW + u] = s;
    }
  }
  return out;
}

export function perceptualHash(img: DecodedImage): Uint8Array {
  const g = grayscale32(img);
  const low = dctLowFreq(g);
  // median of the 63 AC coefficients (exclude DC at index 0)
  const ac = Array.from(low.subarray(1)).sort((a, b) => a - b);
  const mid = ac.length >> 1;
  const median = ac.length % 2 === 0 ? ((ac[mid - 1] as number) + (ac[mid] as number)) / 2 : (ac[mid] as number);
  const bits = new Uint8Array(8);
  for (let i = 0; i < 64; i++) {
    if ((low[i] as number) > median) bits[i >> 3] = (bits[i >> 3] as number) | (1 << (7 - (i & 7)));
  }
  return bits;
}

export function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) throw new RangeError("hash length mismatch");
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = (a[i] as number) ^ (b[i] as number);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Hamming distance at or below this is "likely duplicate → review". */
export const PERCEPTUAL_REVIEW_THRESHOLD = 10;

export function fingerprintImage(fileBytes: Uint8Array, decoded: DecodedImage): ImageFingerprint {
  if (fileBytes.length > MAX_IMAGE_BYTES) throw new Error(`image exceeds ${MAX_IMAGE_BYTES} bytes`);
  const v = validateDecoded(decoded);
  if (!v.ok) throw new Error(v.reason);
  return {
    raw: rawDigest(fileBytes),
    pixel: pixelDigest(decoded),
    perceptual: perceptualHash(decoded),
    width: decoded.width,
    height: decoded.height,
    byteLength: fileBytes.length,
    pipeline: IMAGE_PIPELINE_VERSION,
  };
}

export function fingerprintToJson(fp: ImageFingerprint) {
  return {
    raw: toHex(fp.raw),
    pixel: toHex(fp.pixel),
    perceptual: toHex(fp.perceptual),
    width: fp.width,
    height: fp.height,
    byteLength: fp.byteLength,
    pipeline: fp.pipeline,
  };
}
