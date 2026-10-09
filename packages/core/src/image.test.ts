import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { fingerprintImage, hammingDistance, perceptualHash, pixelDigest, type DecodedImage } from "./image.ts";
import { decodeImage, encodeJpeg, encodePng, fingerprintFile } from "./node/index.ts";
import { toHex } from "./encoding.ts";

/** Synthetic 64×64 logo: gradient background with a colored disc. */
export function makeLogo(seed = 0, size = 64): DecodedImage {
  const data = new Uint8Array(size * size * 4);
  const cx = size / 2 + (seed % 7) - 3;
  const cy = size / 2 + ((seed * 3) % 7) - 3;
  const r = size / 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = (x - cx) ** 2 + (y - cy) ** 2 < r * r;
      data[i] = inside ? (200 + seed * 13) & 0xff : (x * 255) / size;
      data[i + 1] = inside ? (40 + seed * 29) & 0xff : (y * 255) / size;
      data[i + 2] = inside ? (120 + seed * 7) & 0xff : 180;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

function withNoise(img: DecodedImage, amount = 6): DecodedImage {
  const data = new Uint8Array(img.data);
  for (let i = 0; i < data.length; i += 4) {
    const n = ((i / 4) % 13) - 6;
    data[i] = Math.max(0, Math.min(255, (data[i] as number) + (n * amount) / 6));
  }
  return { width: img.width, height: img.height, data };
}

describe("image fingerprints", () => {
  it("raw digest differs but pixel digest is identical across PNG re-packaging", () => {
    const img = makeLogo(1);
    const a = encodePng(img);
    const png = new PNG({ width: img.width, height: img.height });
    png.data = Buffer.from(img.data);
    const b = new Uint8Array(PNG.sync.write(png, { deflateLevel: 0, filterType: 0 }));
    assert.notEqual(toHex(a), toHex(b), "fixtures should differ as files");

    const fa = fingerprintFile(a);
    const fb = fingerprintFile(b);
    assert.ok(fa.ok && fb.ok);
    assert.notEqual(toHex(fa.fingerprint.raw), toHex(fb.fingerprint.raw));
    assert.equal(toHex(fa.fingerprint.pixel), toHex(fb.fingerprint.pixel));
    assert.equal(toHex(fa.fingerprint.perceptual), toHex(fb.fingerprint.perceptual));
  });

  it("JPEG recompression changes the pixel digest but keeps the perceptual hash close", () => {
    const img = makeLogo(2);
    const png = encodePng(img);
    const jpg = encodeJpeg(img, 85);
    const fp = fingerprintFile(png);
    const fj = fingerprintFile(jpg);
    assert.ok(fp.ok && fj.ok);
    assert.notEqual(toHex(fp.fingerprint.pixel), toHex(fj.fingerprint.pixel));
    const d = hammingDistance(fp.fingerprint.perceptual, fj.fingerprint.perceptual);
    assert.ok(d <= 10, `expected near-duplicate, got distance ${d}`);
  });

  it("a slightly altered image is similar; an unrelated logo is not", () => {
    const base = perceptualHash(makeLogo(3));
    const near = perceptualHash(withNoise(makeLogo(3)));
    const far = perceptualHash(makeLogo(9));
    assert.ok(hammingDistance(base, near) <= 10);
    assert.ok(hammingDistance(base, far) > 10, `unrelated distance was ${hammingDistance(base, far)}`);
  });

  it("alpha is composited over white as part of the pixel digest", () => {
    const img = makeLogo(4);
    const transparent = { ...img, data: new Uint8Array(img.data) };
    for (let i = 3; i < transparent.data.length; i += 4) transparent.data[i] = 0;
    const white = { ...img, data: new Uint8Array(img.data) };
    for (let i = 0; i < white.data.length; i += 4) {
      white.data[i] = 255;
      white.data[i + 1] = 255;
      white.data[i + 2] = 255;
      white.data[i + 3] = 255;
    }
    assert.equal(toHex(pixelDigest(transparent)), toHex(pixelDigest(white)));
  });

  it("rejects unsupported formats and oversized dimensions", () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]);
    const r = decodeImage(gif);
    assert.equal(r.ok, false);
    assert.throws(() => fingerprintImage(new Uint8Array(10), { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) }));
  });
});
