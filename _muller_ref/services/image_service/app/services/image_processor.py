import io
import logging
import math
import re
import zipfile
from pathlib import Path

import pyvips

from shared import settings

log = logging.getLogger(__name__)

SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"}
WEBP_QUALITY = 85
WEBP_MAX_DIMENSION = 16383


def _is_image_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS


def _natural_sort_key(filename: str) -> tuple:
    parts = re.split(r"(\d+)", filename)
    result = []
    for part in parts:
        if part.isdigit():
            result.append((0, int(part)))
        else:
            result.append((1, part.lower()))
    return tuple(result)


def ensure_storage_dir(series_slug: str, chapter_slug: str) -> Path:
    chapter_dir = Path(settings.STORAGE_PATH) / series_slug / chapter_slug
    chapter_dir.mkdir(parents=True, exist_ok=True)
    return chapter_dir


def convert_image_to_webp(image_data: bytes) -> tuple[bytes, int, int]:
    image = pyvips.Image.new_from_buffer(image_data, "")
    webp_data = image.write_to_buffer(".webp", Q=WEBP_QUALITY, strip=True)
    return webp_data, image.width, image.height


def _convert_tall_image_to_segments(
    image_data: bytes,
    series_slug: str,
    chapter_slug: str,
    page_number: int,
    chapter_dir: Path,
) -> list[dict]:
    """Split an image taller than WEBP_MAX_DIMENSION into vertical WebP segments."""
    image = pyvips.Image.new_from_buffer(image_data, "")

    if image.height <= WEBP_MAX_DIMENSION:
        webp_data, w, h = convert_image_to_webp(image_data)
        output_filename = f"{page_number:04d}.webp"
        (chapter_dir / output_filename).write_bytes(webp_data)
        relative_path = f"{series_slug}/{chapter_slug}/{output_filename}"
        return [{
            "page_number": page_number,
            "image_path": relative_path,
            "width": w,
            "height": h,
            "file_size": len(webp_data),
        }]

    segment_height = WEBP_MAX_DIMENSION
    num_segments = math.ceil(image.height / segment_height)
    segments = []

    for i in range(num_segments):
        top = i * segment_height
        actual_height = min(segment_height, image.height - top)

        # crop_region expects (left, top, width, height)
        segment = image.crop(0, top, image.width, actual_height)

        webp_data = segment.write_to_buffer(".webp", Q=WEBP_QUALITY, strip=True)

        segment_page_number = page_number + i
        output_filename = f"{segment_page_number:04d}.webp"
        (chapter_dir / output_filename).write_bytes(webp_data)
        relative_path = f"{series_slug}/{chapter_slug}/{output_filename}"

        segments.append({
            "page_number": segment_page_number,
            "image_path": relative_path,
            "width": image.width,
            "height": actual_height,
            "file_size": len(webp_data),
        })

    return segments


def process_archive(
    archive_data: bytes, series_slug: str, chapter_slug: str
) -> list[dict]:
    chapter_dir = ensure_storage_dir(series_slug, chapter_slug)
    pages: list[dict] = []

    with zipfile.ZipFile(io.BytesIO(archive_data), "r") as zf:
        image_files = sorted(
            [f for f in zf.namelist() if _is_image_file(f) and not f.startswith("__MACOSX")],
            key=_natural_sort_key,
        )
        if not image_files:
            raise ValueError("No supported image files found in the archive.")

        next_page_number = 1
        for filename in image_files:
            raw_data = zf.read(filename)
            try:
                segment_pages = _convert_tall_image_to_segments(
                    raw_data, series_slug, chapter_slug, next_page_number, chapter_dir,
                )
            except Exception as e:
                raise ValueError(f"Failed to convert '{filename}': {e}")

            pages.extend(segment_pages)
            next_page_number += len(segment_pages)

    return pages
