"""Rend des pages du manuel de référence en PNG (usage interne, étape 0).

Usage : .venv\\Scripts\\python.exe -I tools\\render_pages.py <pdf> <dossier_sortie> <dpi> <page> [<page> ...]
Les numéros de page sont ceux du PDF (= pages imprimées du manuel).
L'encodage PNG utilise seulement la bibliothèque standard (pas de Pillow).
"""
import struct
import sys
import zlib
from pathlib import Path

import pypdfium2 as pdfium


def write_png(path: Path, width: int, height: int, stride: int, bgr: bytes) -> None:
    """Écrit un PNG RVB 8 bits à partir d'un tampon BGR (une ligne = `stride` octets)."""
    rows = bytearray()
    for y in range(height):
        line = bgr[y * stride : y * stride + width * 3]
        rgb = bytearray(line)
        rgb[0::3], rgb[2::3] = line[2::3], line[0::3]
        rows += b"\x00" + rgb

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    pdf_path, out_dir, dpi, *pages = sys.argv[1:]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    doc = pdfium.PdfDocument(pdf_path)
    scale = int(dpi) / 72
    for num in map(int, pages):
        bitmap = doc[num - 1].render(scale=scale, rev_byteorder=False, prefer_bgrx=False)
        target = out / f"ref-p{num:03d}.png"
        write_png(target, bitmap.width, bitmap.height, bitmap.stride, bytes(bitmap.buffer))
        print(f"{target} {bitmap.width}x{bitmap.height}")


if __name__ == "__main__":
    main()
