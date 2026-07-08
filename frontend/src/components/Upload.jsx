import React, { useState } from "react";
import { uploadBlueprint } from "../api/api";

export default function Upload({ onData, disabled }) {
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState(null);
    const [fileName, setFileName] = useState("");
    const [count,    setCount]    = useState(null);

    const handleFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setFileName(file.name);
        setLoading(true);
        setError(null);
        setCount(null);

        try {
            const data = await uploadBlueprint(file);

            if (data.error) {
                setError(data.error);
                return;
            }
            if (!data.walls || data.walls.length === 0) {
                setError("No walls detected. Try a cleaner blueprint.");
                return;
            }

            setCount(data.walls.length);
            onData(data);

        } catch (err) {
            if (err.code === "ERR_NETWORK") {
                setError("Cannot reach backend. Run uvicorn on port 8000.");
            } else {
                setError("Upload failed: " + (err.message || "unknown error"));
            }
        } finally {
            setLoading(false);
            e.target.value = "";
        }
    };

    return (
        <div>
            <p className="section-label">Blueprint</p>

            <label className="upload-area">
                <div style={{ fontSize: 13, color: "#58a6ff" }}>
                    {loading ? "Processing..." : "Upload PNG / JPG"}
                </div>
                <div style={{ fontSize: 11, color: "#6e7681", marginTop: 4 }}>
                    Click to choose file
                </div>
                <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleFile}
                    disabled={disabled || loading}
                    style={{ display: "none" }}
                />
            </label>

            {fileName && !error && (
                <p style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>
                    {fileName}
                </p>
            )}
            {count !== null && (
                <p style={{ fontSize: 12, color: "#5dbe6a", marginTop: 4 }}>
                    ✓ {count} walls detected
                </p>
            )}
            {error && (
                <p style={{ fontSize: 11, color: "#ff6b6b", marginTop: 4 }}>
                    ✗ {error}
                </p>
            )}
        </div>
    );
}