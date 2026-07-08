import QRCode from "qrcode";

const QR_MAX_BYTES = 2953;

/**
 * Compress walls by rounding coordinates to integers.
 * Reduces bytes by ~60% without losing visual accuracy.
 */
function compressWalls(walls) {
    return walls.map(w => ({
        s: [Math.round(w.start[0]), Math.round(w.start[1])],
        e: [Math.round(w.end[0]), Math.round(w.end[1])]
    }));
}

export function serializeState({
    floors = [],
    scale = 0.05,
    wallHeight = 3.0,
    exitCells = [],
    activeFloor = 0,
    weights = {},
    annotations = []
}) {
    const payload = {
        v: "1.0",
        ts: Date.now(),
        sc: scale,
        wh: wallHeight,
        af: activeFloor,
        ec: exitCells,
        wt: weights,
        an: annotations,
        fl: floors.map(f => ({
            fi: f.floorIndex,
            w: compressWalls(f.walls),
            st: f.stairs || []
        }))
    };

    return JSON.stringify(payload);
}

function base64Encode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export async function generateQR(serialized, localIP, port = 8000) {
    const encodedPayload = base64Encode(serialized);
    const payloadUrl = `http://${localIP}:${port}/viewer?payload=${encodeURIComponent(encodedPayload)}`;
    const networkUrl = `http://${localIP}:${port}/viewer`;

    const payloadSize = new TextEncoder().encode(payloadUrl).length;

    let qrContent;
    let mode;
    let url;

    if (payloadSize <= QR_MAX_BYTES) {
        qrContent = payloadUrl;
        mode = "payload";
        url = payloadUrl;
    } else {
        qrContent = networkUrl;
        mode = "network";
        url = networkUrl;
    }

    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, qrContent, {
        width: 300,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "L"
    });

    return { canvas, mode, url, bytes: new TextEncoder().encode(serialized).length };
}

export async function parseScannedData(scannedText) {
    if (scannedText.startsWith("http")) {
        const res = await fetch(scannedText);
        const data = await res.json();
        return data;
    } else {
        return JSON.parse(scannedText);
    }
}