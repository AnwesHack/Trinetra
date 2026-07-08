import cv2
import numpy as np


def process_blueprint(img):
    h, w = img.shape[:2]

    # ── Step 1: Resize to max 800px — critical for noise reduction ──
    # High-res images produce 10x more false lines. Always resize first.
    max_dim = 800
    if max(h, w) > max_dim:
        ratio = max_dim / max(h, w)
        new_w = int(w * ratio)
        new_h = int(h * ratio)
        img   = cv2.resize(img, (new_w, new_h))
        scale_back = 1.0 / ratio
    else:
        scale_back = 1.0

    # ── Step 2: Convert to grayscale ────────────────────────────────
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # ── Step 3: If blueprint is dark-on-white, invert it ─────────────
    # Most blueprints are black lines on white background.
    # Check mean brightness — if mostly dark, invert.
    mean_brightness = np.mean(gray)
    if mean_brightness < 127:
        gray = cv2.bitwise_not(gray)

    # ── Step 4: Otsu threshold — converts to clean black/white ───────
    # Much better than adaptive for clean digital blueprints.
    # Adaptive is only better for physically scanned/uneven prints.
    _, binary = cv2.threshold(
        gray, 0, 255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    # ── Step 5: Remove small blobs (text, dimensions, symbols) ────────
    # Any connected component smaller than min_area pixels is noise.
    # Walls are long lines — they have large area. Text dots do not.
    min_area = 50
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        binary, connectivity=8
    )
    cleaned = np.zeros_like(binary)
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            cleaned[labels == i] = 255

    # ── Step 6: Canny edges ───────────────────────────────────────────
    edges = cv2.Canny(cleaned, 50, 150)

    # ── Step 7: HoughLinesP — aggressive settings ─────────────────────
    # threshold=120:     only strong lines (was 80/100 before)
    # minLineLength=60:  minimum 60px — kills short noise lines
    # maxLineGap=8:      don't bridge large gaps
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=120,
        minLineLength=60,
        maxLineGap=8
    )

    walls = []

    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]

            # Scale back to original image coordinates
            x1 = int(x1 * scale_back)
            y1 = int(y1 * scale_back)
            x2 = int(x2 * scale_back)
            y2 = int(y2 * scale_back)

            length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

            # Skip anything shorter than 40px in original coords
            if length < 40:
                continue

            walls.append({
                "start": [x1, y1],
                "end":   [x2, y2]
            })

    # ── Step 8: Remove near-duplicate lines ───────────────────────────
    walls = _remove_duplicates(walls, threshold=12)

    return walls


def _remove_duplicates(walls, threshold=12):
    """
    Two walls are duplicates if both their start and end points
    are within `threshold` pixels of each other.
    HoughLinesP often finds 3-5 copies of the same wall.
    """
    if not walls:
        return walls

    kept = []

    for wall in walls:
        x1, y1 = wall["start"]
        x2, y2 = wall["end"]
        is_dup = False

        for k in kept:
            kx1, ky1 = k["start"]
            kx2, ky2 = k["end"]

            # Check both endpoint orderings (A→B same as B→A)
            d_normal = max(
                abs(x1 - kx1) + abs(y1 - ky1),
                abs(x2 - kx2) + abs(y2 - ky2)
            )
            d_flipped = max(
                abs(x1 - kx2) + abs(y1 - ky2),
                abs(x2 - kx1) + abs(y2 - ky1)
            )

            if min(d_normal, d_flipped) < threshold:
                is_dup = True
                break

        if not is_dup:
            kept.append(wall)

    return kept


def get_image_info(img):
    h, w = img.shape[:2]
    return {"width": int(w), "height": int(h)}


def save_debug_image(img, walls, output_path="debug_output.png"):
    """
    Draws detected walls in RED on the blueprint.
    Use: POST /debug-blueprint → GET /debug-image
    """
    debug = img.copy()
    for wall in walls:
        x1, y1 = wall["start"]
        x2, y2 = wall["end"]
        cv2.line(debug,   (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.circle(debug, (x1, y1), 4, (0, 255, 0), -1)
        cv2.circle(debug, (x2, y2), 4, (255, 0, 0), -1)
    cv2.imwrite(output_path, debug)
    return output_path