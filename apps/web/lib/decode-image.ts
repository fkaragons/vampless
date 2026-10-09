"use client";

import { fingerprintImage, fingerprintToJson, MAX_IMAGE_BYTES, type DecodedImage } from "@vampless/core";

export type BrowserFingerprint = ReturnType<typeof fingerprintToJson> & { previewUrl: string };

/** Decode a File via createImageBitmap + canvas and fingerprint it with core. */
export async function fingerprintFileInBrowser(file: File): Promise<{ ok: true; fp: BrowserFingerprint } | { ok: false; reason: string }> {
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: `file exceeds ${MAX_IMAGE_BYTES / 1024 / 1024} MB` };
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return { ok: false, reason: `${file.type || "unknown"} is not supported in the pilot (PNG, JPEG, WebP only)` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  } catch {
    return { ok: false, reason: "browser could not decode image" };
  }
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { ok: false, reason: "no 2d context" };
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const decoded: DecodedImage = { width: bitmap.width, height: bitmap.height, data };
  try {
    const fp = fingerprintImage(bytes, decoded);
    return { ok: true, fp: { ...fingerprintToJson(fp), previewUrl: URL.createObjectURL(file) } };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Deterministic synthetic logo for scripted scenarios (no upload required). */
export function syntheticLogo(seed: number, size = 96, tweak = 0): { decoded: DecodedImage; bytes: Uint8Array; dataUrl: string } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const hue = (seed * 67) % 360;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, `hsl(${hue} 80% 55%)`);
  g.addColorStop(1, `hsl(${(hue + 60) % 360} 80% 35%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = `hsl(${(hue + 180) % 360} 90% 60%)`;
  ctx.beginPath();
  ctx.arc(size / 2 + ((seed * 7) % 11) - 5, size / 2 + ((seed * 13) % 11) - 5, size / 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.font = `bold ${size / 3}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String.fromCharCode(65 + (seed % 26)), size / 2, size / 2 + 2);
  if (tweak) {
    // small brightness nudge: visually identical, different pixels
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) img.data[i] = Math.min(255, img.data[i] + tweak);
    ctx.putImageData(img, 0, 0);
  }
  const data = ctx.getImageData(0, 0, size, size).data;
  const dataUrl = canvas.toDataURL("image/png");
  const b64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { decoded: { width: size, height: size, data }, bytes, dataUrl };
}
