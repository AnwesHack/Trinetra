from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi import FastAPI, File, UploadFile, Request
import numpy as np
import cv2
import os
import socket
import json

from cv.blueprint_processor import (
    process_blueprint,
    get_image_info,
    save_debug_image
)

app = FastAPI(title="Tactical Blueprint API", version="1.0.0")

# ─────────────────────────────────────────────────────────────────
# CORS — MUST be before ANY @app route definitions.
# Without this the browser blocks every React → FastAPI call.
# ─────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status":  "ok",
        "message": "Tactical Blueprint API is running",
        "version": "1.0.0"
    }


@app.post("/process-blueprint")
async def process_blueprint_endpoint(file: UploadFile = File(...)):
    contents = await file.read()
    np_arr   = np.frombuffer(contents, np.uint8)
    img      = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        return {
            "error":        "Could not decode image. Upload PNG or JPG.",
            "walls":        [],
            "count":        0,
            "image_width":  0,
            "image_height": 0
        }

    walls    = process_blueprint(img)
    img_info = get_image_info(img)

    return {
        "walls":        walls,
        "count":        len(walls),
        "image_width":  img_info["width"],
        "image_height": img_info["height"]
    }


# ── Debug: see what CV detected drawn on the image ───────────────
_debug_path = None

@app.post("/debug-blueprint")
async def debug_blueprint(request: Request, file: UploadFile = File(...)):
    global _debug_path
    contents = await file.read()
    np_arr   = np.frombuffer(contents, np.uint8)
    img      = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        return {"error": "Could not decode image"}

    walls       = process_blueprint(img)
    _debug_path = save_debug_image(img, walls, "debug_output.png")

    # Build dynamic URL based on host
    scheme = request.url.scheme
    netloc = request.url.netloc
    
    return {
        "walls_detected": len(walls),
        "view_at":        f"{scheme}://{netloc}/debug-image"
    }


@app.get("/debug-image")
async def get_debug_image():
    if _debug_path and os.path.exists(_debug_path):
        return FileResponse(_debug_path, media_type="image/png")
    return {"error": "POST to /debug-blueprint first"}

_sync_payload = None

@app.get("/viewer")
async def viewer():
    return FileResponse(
        os.path.join(os.path.dirname(__file__), "viewer.html"),
        media_type="text/html"
    )

@app.post("/sync-upload")
async def sync_upload(request: Request):
    """
    Commander's app POSTs the serialized state here.
    Stores it in memory so phones can fetch it via /sync-data.
    """
    body = await request.body()
    global _sync_payload
    _sync_payload = body.decode("utf-8")
    return {"status": "ok", "bytes": len(_sync_payload)}

@app.get("/sync-data")
async def sync_data():
    """
    Phones on the same network GET this after scanning QR.
    Returns the latest tactical state as JSON.
    """
    global _sync_payload
    if not _sync_payload:
        return {"error": "No sync data available. Commander must sync first."}
    return json.loads(_sync_payload)

@app.get("/local-ip")
async def local_ip():
    """
    Returns this machine's local network IP address.
    Used to build the QR code URL that phones on same WiFi can reach.
    Prefers local WiFi IPs (192.168.x.x) over VPN IPs.
    """
    try:
        # Get all network interfaces
        import socket
        hostname = socket.gethostname()
        all_ips = socket.gethostbyname_ex(hostname)[2]

        # Debug: return all IPs found
        debug_info = {
            "hostname": hostname,
            "all_ips": all_ips,
            "selected_ip": None
        }

        # Prioritize: 192.168.x.x (WiFi) > 172.16-31.x.x > 10.x.x.x (but avoid VPN)
        priority_ips = []

        for ip in all_ips:
            if ip.startswith('192.168.'):
                priority_ips.insert(0, ip)  # Highest priority
            elif ip.startswith('172.') and 16 <= int(ip.split('.')[1]) <= 31:
                priority_ips.append(ip)  # Medium priority
            elif ip.startswith('10.') and not ip.startswith('10.2.'):  # Avoid ProtonVPN
                priority_ips.append(ip)  # Lower priority

        debug_info["priority_ips"] = priority_ips

        if priority_ips:
            debug_info["selected_ip"] = priority_ips[0]
            return {"ip": priority_ips[0], "debug": debug_info}

    except Exception as e:
        debug_info["error"] = str(e)

    # Fallback: manually check common interfaces
    try:
        import subprocess
        result = subprocess.run(['ipconfig'], capture_output=True, text=True, shell=True)
        lines = result.stdout.split('\n')
        for i, line in enumerate(lines):
            if '192.168.' in line and 'IPv4 Address' in line:
                ip = line.split(':')[1].strip()
                return {"ip": ip, "debug": {"method": "ipconfig_fallback"}}
    except Exception as e:
        debug_info["ipconfig_error"] = str(e)

    # Final fallback
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return {"ip": ip, "debug": {"method": "socket_fallback"}}
    except Exception as e:
        debug_info["socket_error"] = str(e)

    return {"ip": "127.0.0.1", "debug": debug_info}