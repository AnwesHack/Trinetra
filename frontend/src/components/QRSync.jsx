import React, { useState, useRef, useEffect } from "react";
import { serializeState, generateQR } from "../utils/SyncManager";

export default function QRSync({
    floors = [],
    scale = 0.05,
    wallHeight = 3.0,
    exitCells = [],
    activeFloor = 0,
    weights = {}
}) {
    const [generating, setGenerating] = useState(false);
    const [qrCanvas, setQrCanvas] = useState(null);
    const [mode, setMode] = useState(null);
    const [info, setInfo] = useState("");
    const [error, setError] = useState(null);

    const generate = async () => {
        if (!floors.length) {
            setError("Upload at least one floor blueprint first.");
            return;
        }

        setGenerating(true);
        setQrCanvas(null);
        setError(null);
        setMode(null);
        setInfo("");

        try {
            // Step 1: Serialize state
            const serialized = serializeState({
                floors,
                scale,
                wallHeight,
                exitCells,
                activeFloor,
                weights
            });

            const bytes = new TextEncoder().encode(serialized).length;

            // Step 2: Get local IP
            let localIP = "127.0.0.1";
            try {
                const ipRes = await fetch("http://127.0.0.1:8000/local-ip");
                const ipData = await ipRes.json();
                localIP = ipData.ip;
            } catch {
                // fallback to localhost
            }

            // Step 3: Generate the QR URL / payload
            const { canvas, mode: m, url } = await generateQR(
                serialized, localIP, 8000
            );

            // Step 4: Only upload state when the QR points to /viewer without payload
            if (m === "network") {
                const uploadResponse = await fetch(`http://${localIP}:8000/sync-upload`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: serialized
                });
                if (!uploadResponse.ok) {
                    throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
                }
                console.log("Data uploaded successfully");
            }

            // Step 5: Convert canvas to data URL so React can render it
            const dataURL = canvas.toDataURL("image/png");

            setQrCanvas(dataURL);
            setMode(m);

            if (m === "payload") {
                setInfo(
                    `${bytes} bytes encoded into the viewer URL. ` +
                    `Phone scans and loads the mobile viewer directly.`
                );
            } else {
                setInfo(
                    `Model uploaded to ${localIP}:8000. ` +
                    `Phone must be on same WiFi to fetch it.`
                );
            }

        } catch (err) {
            setError("Failed to generate QR: " + err.message);
            console.error(err);
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div>
            <p style={{
                fontSize: 11, color: "#6e7681",
                lineHeight: 1.6, marginBottom: 8
            }}>
                Generate a QR code. Troops scan it on their phone
                to receive the full 3D model — no internet needed.
            </p>

            {/* Generate button */}
            <button
                onClick={generate}
                disabled={generating}
                style={{
                    width: "100%",
                    padding: "8px 12px",
                    marginBottom: 8,
                    background: generating ? "#21262d" : "#1f3a8c",
                    color: generating ? "#6e7681" : "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: generating ? "not-allowed" : "pointer"
                }}
            >
                {generating ? "Generating..." : "Generate QR Sync"}
            </button>

            {/* QR code image — rendered from data URL */}
            {qrCanvas && (
                <div style={{
                    background: "#ffffff",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8
                }}>
                    <img
                        src={qrCanvas}
                        alt="QR Code"
                        style={{
                            width: 240,
                            height: 240,
                            imageRendering: "pixelated",
                            display: "block"
                        }}
                    />
                    <p style={{
                        fontSize: 10,
                        color: "#333",
                        textAlign: "center",
                        lineHeight: 1.4
                    }}>
                        Scan with phone camera
                    </p>
                </div>
            )}

            {/* Mode badge */}
            {mode && (
                <div style={{
                    display: "inline-block",
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    marginBottom: 6,
                    background: mode === "payload" ? "#1c6e3a" : "#6e4c1c",
                    color: "#fff"
                }}>
                    {mode === "payload" ? "PAYLOAD URL" : "NETWORK URL"}
                </div>
            )}

            {/* Info */}
            {info && (
                <p style={{
                    fontSize: 10,
                    color: "#6e7681",
                    lineHeight: 1.6,
                    marginBottom: 4
                }}>
                    {info}
                </p>
            )}

            {/* Error */}
            {error && (
                <p style={{
                    fontSize: 11,
                    color: "#ff6b6b",
                    marginBottom: 4
                }}>
                    ✗ {error}
                </p>
            )}

            {/* Troop instructions */}
            {qrCanvas && (
                <div style={{
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 10,
                    color: "#8b949e",
                    lineHeight: 1.7
                }}>
                    <strong style={{ color: "#c9d1d9" }}>
                        Troop instructions:
                    </strong>
                    <br />
                    1. Open phone camera or QR scanner
                    <br />
                    2. Scan this code
                    <br />
                    {mode === "network"
                        ? "3. Connect phone to same WiFi as this laptop"
                        : "3. Scan and open the viewer directly on your phone"}
                    <br />
                    4. 3D model opens in phone browser
                </div>
            )}
        </div>
    );
}