// Noms des polices installées : lecture de la table « name » d'un fichier TrueType / OpenType (SPEC §4.15 : la liste
// des polices du PC). On ne lit que l'en-tête et la table « name » : pas besoin de charger toute la police.

/** Lecteur d'octets : `length` octets à partir de `offset` (peut en renvoyer moins en fin de fichier). */
export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>;

export interface FontNames {
  family: string;
  /** « Regular », « Bold », « Italic », « Bold Italic »… */
  style: string;
  bold: boolean;
  italic: boolean;
}

const u16 = (v: DataView, o: number): number => v.getUint16(o, false);
const u32 = (v: DataView, o: number): number => v.getUint32(o, false);

function decode(bytes: Uint8Array, platform: number): string {
  if (platform === 3 || platform === 0) {
    let s = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(((bytes[i] as number) << 8) | (bytes[i + 1] as number));
    return s;
  }
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** Les noms d'une police simple (pas une collection .ttc) ; `null` si le fichier n'est pas lisible. */
export async function readFontNames(read: ByteReader, fileSize: number): Promise<FontNames | null> {
  if (fileSize < 12 || fileSize > 200 * 1024 * 1024) return null;
  const head = await read(0, 12);
  if (head.length < 12) return null;
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const tag = u32(hv, 0);
  if (tag !== 0x00010000 && tag !== 0x4f54544f /* OTTO */ && tag !== 0x74727565 /* true */) return null;
  const count = u16(hv, 4);
  if (count < 1 || count > 100) return null;
  const dir = await read(12, count * 16);
  if (dir.length < count * 16) return null;
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  let nameOffset = 0;
  let nameLength = 0;
  let os2Offset = 0;
  for (let i = 0; i < count; i++) {
    const t = u32(dv, i * 16);
    if (t === 0x6e616d65 /* name */) {
      nameOffset = u32(dv, i * 16 + 8);
      nameLength = u32(dv, i * 16 + 12);
    } else if (t === 0x4f532f32 /* OS/2 */) os2Offset = u32(dv, i * 16 + 8);
  }
  if (!nameOffset || nameLength < 6 || nameLength > 1024 * 1024 || nameOffset + nameLength > fileSize) return null;
  const table = await read(nameOffset, nameLength);
  if (table.length < nameLength) return null;
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const n = u16(tv, 2);
  const stringBase = u16(tv, 4);
  // Pour chaque nom, on garde la meilleure version : Windows en anglais américain, puis Windows, puis Mac.
  const found = new Map<number, { text: string; score: number }>();
  for (let i = 0; i < n; i++) {
    const r = 6 + i * 12;
    if (r + 12 > table.length) break;
    const platform = u16(tv, r);
    const language = u16(tv, r + 4);
    const id = u16(tv, r + 6);
    const len = u16(tv, r + 8);
    const off = u16(tv, r + 10);
    if (![1, 2, 16, 17].includes(id) || stringBase + off + len > table.length) continue;
    const score = platform === 3 ? (language === 0x0409 ? 3 : 2) : platform === 1 || platform === 0 ? 1 : 0;
    if (score === 0 || (found.get(id)?.score ?? 0) >= score) continue;
    found.set(id, { text: decode(table.subarray(stringBase + off, stringBase + off + len), platform), score });
  }
  const family = (found.get(16) ?? found.get(1))?.text.trim();
  const style = (found.get(17) ?? found.get(2))?.text.trim() ?? "Regular";
  if (!family) return null;
  let bold = /\bbold\b|\bblack\b|\bheavy\b/i.test(style);
  let italic = /\bitalic\b|\boblique\b/i.test(style);
  if (os2Offset && os2Offset + 64 <= fileSize) {
    const os2 = await read(os2Offset, 64);
    if (os2.length >= 64) {
      const ov = new DataView(os2.buffer, os2.byteOffset, os2.byteLength);
      const weight = u16(ov, 4);
      const sel = u16(ov, 62);
      bold = bold || weight >= 700;
      italic = italic || (sel & 1) !== 0;
    }
  }
  return { family, style, bold, italic };
}

/** Une police installée : une famille et ses fichiers par variante. */
export interface InstalledFont {
  family: string;
  /** Nom du fichier, par variante : « regular », « bold », « italic », « boldItalic ». */
  files: Partial<Record<"regular" | "bold" | "italic" | "boldItalic", string>>;
}

export function variantOf(n: Pick<FontNames, "bold" | "italic">): "regular" | "bold" | "italic" | "boldItalic" {
  return n.bold ? (n.italic ? "boldItalic" : "bold") : n.italic ? "italic" : "regular";
}

/** Regroupe des polices lues par famille (les familles sont triées sans tenir compte de la casse). */
export function groupFonts(entries: readonly { file: string; names: FontNames }[]): InstalledFont[] {
  const byFamily = new Map<string, InstalledFont>();
  for (const { file, names } of entries) {
    let f = byFamily.get(names.family);
    if (!f) {
      f = { family: names.family, files: {} };
      byFamily.set(names.family, f);
    }
    const v = variantOf(names);
    if (!f.files[v]) f.files[v] = file;
  }
  return [...byFamily.values()].filter((f) => f.files.regular || f.files.bold || f.files.italic || f.files.boldItalic).sort((a, b) => a.family.localeCompare(b.family, "fr", { sensitivity: "base" }));
}
