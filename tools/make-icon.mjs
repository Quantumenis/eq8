// Génère build/icon.png (256 × 256, RVBA) : le moulinet de Quilt Studio, sans dépendance.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";

const SIZE = 256;
const SS = 4; // suréchantillonnage par axe pour l'anticrénelage
const BG = [43, 47, 54];
const BLUE = [47, 111, 179];
const AMBER = [224, 165, 38];

/** Couleur (ou null = transparent) au point (x, y) d'un carré unité [0,1]². */
function sample(x, y) {
  const m = 0.03, r = 0.13; // marge extérieure, rayon des coins
  const cx = Math.min(Math.max(x, m + r), 1 - m - r);
  const cy = Math.min(Math.max(y, m + r), 1 - m - r);
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;

  const p = 0.12; // marge intérieure du moulinet
  if (x < p || x > 1 - p || y < p || y > 1 - p) return BG;
  const u = (x - p) / (1 - 2 * p) - 0.5; // repère centré sur le moulinet
  const v = (y - p) / (1 - 2 * p) - 0.5;
  // Quatre triangles demi-carré qui tournent autour du centre.
  if (u < 0 && v < 0) return -u > -v ? BLUE : BG;
  if (u >= 0 && v < 0) return u > -v ? BG : AMBER;
  if (u >= 0 && v >= 0) return u > v ? BG : BLUE;
  return -u > v ? AMBER : BG;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0;
  for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample((px + (sx + 0.5) / SS) / SIZE, (py + (sy + 0.5) / SS) / SIZE);
        if (c) {
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
    }
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    raw[o] = a ? Math.round(r / a) : 0;
    raw[o + 1] = a ? Math.round(g / a) : 0;
    raw[o + 2] = a ? Math.round(b / a) : 0;
    raw[o + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RVBA

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "build", "icon.png");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
console.log(`Icône écrite : ${target}`);
