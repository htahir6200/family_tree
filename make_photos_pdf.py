"""Combine all PHOTO-*.jpg shajrah pages into one PDF."""

from pathlib import Path

from PIL import Image

OUT = Path(__file__).parent
PDF_PATH = OUT / "shajrah_all_photos.pdf"


def natural_sort_key(path: Path):
    name = path.stem
    if "_" in name and name.rsplit("_", 1)[-1].isdigit():
        base, num = name.rsplit("_", 1)
        return (base, int(num))
    return (name, -1)


def main():
    images = sorted(OUT.glob("PHOTO-*.jpg"), key=natural_sort_key)
    if not images:
        raise SystemExit("No PHOTO-*.jpg files found.")

    opened = []
    try:
        for path in images:
            img = Image.open(path)
            if img.mode != "RGB":
                img = img.convert("RGB")
            opened.append(img)

        first, *rest = opened
        first.save(PDF_PATH, "PDF", save_all=True, append_images=rest, resolution=150.0)
    finally:
        for img in opened:
            img.close()

    print(f"Created {PDF_PATH}")
    print(f"Pages: {len(images)}")


if __name__ == "__main__":
    main()
