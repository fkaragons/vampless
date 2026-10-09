/**
 * Node-only helpers: decode PNG/JPEG files into RGBA for fingerprinting.
 * Browsers should use <canvas> (see apps/web/lib/decode-image.ts).
 */
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { fingerprintImage, type DecodedImage, type ImageFingerprint, MAX_IMAGE_BYTES } from "../image.ts";

export type DetectedFormat = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml" | "unknown";

export function detectFormat(bytes: Uint8Array): DetectedFormat {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return "unknown";
}

export type DecodeResult = { ok: true; image: DecodedImage; format: DetectedFormat } | { ok: false; code: string; reason: string };

export function decodeImage(bytes: Uint8Array): DecodeResult {
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, code: "TOO_LARGE", reason: `file exceeds ${MAX_IMAGE_BYTES} bytes` };
  const format = detectFormat(bytes);
  try {
    if (format === "image/png") {
      const png = PNG.sync.read(Buffer.from(bytes));
      return { ok: true, image: { width: png.width, height: png.height, data: new Uint8Array(png.data) }, format };
    }
    if (format === "image/jpeg") {
      const j = jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
      return { ok: true, image: { width: j.width, height: j.height, data: new Uint8Array(j.data) }, format };
    }
  } catch (e) {
    return { ok: false, code: "DECODE_FAILED", reason: e instanceof Error ? e.message : String(e) };
  }
  if (format === "image/gif" || format === "image/svg+xml")
    return { ok: false, code: "UNSUPPORTED_FORMAT", reason: `${format} is not supported in the pilot (animation/vector semantics undefined)` };
  if (format === "image/webp")
    return { ok: false, code: "UNSUPPORTED_FORMAT", reason: "WebP decoding is not available in the Node pipeline yet; submit PNG or JPEG" };
  return { ok: false, code: "UNSUPPORTED_FORMAT", reason: "unrecognized image format" };
}

export function fingerprintFile(bytes: Uint8Array): { ok: true; fingerprint: ImageFingerprint; format: DetectedFormat } | { ok: false; code: string; reason: string } {
  const d = decodeImage(bytes);
  if (!d.ok) return d;
  try {
    return { ok: true, fingerprint: fingerprintImage(bytes, d.image), format: d.format };
  } catch (e) {
    return { ok: false, code: "INVALID_IMAGE", reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Encode RGBA pixels as PNG (test helper / fixture generation). */
export function encodePng(img: DecodedImage): Uint8Array {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return new Uint8Array(PNG.sync.write(png));
}

/** Encode RGBA pixels as JPEG (test helper). */
export function encodeJpeg(img: DecodedImage, quality = 90): Uint8Array {
  const out = jpeg.encode({ width: img.width, height: img.height, data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength) }, quality);
  return new Uint8Array(out.data);
}
