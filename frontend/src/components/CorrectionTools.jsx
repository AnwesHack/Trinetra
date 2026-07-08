import React, { useState } from "react";
import { removeWallByIndex } from "../three/WallGenerator";

export default function CorrectionTools({ scene, wallData, onWallDataChange }) {
    const [mode,    setMode]    = useState("view");
    const [history, setHistory] = useState([]);

    if (!wallData || wallData.walls.length === 0) {
        return (
            <div>
                <p className="section-label" style={{ marginTop: 16 }}>
                    Correction Tools
                </p>
                <p className="hint-text">Upload a blueprint first</p>
            </div>
        );
    }

    const removeWall = (index) => {
        setHistory(prev => [
            ...prev,
            { type: "remove", index, wall: wallData.walls[index] }
        ]);
        if (scene) removeWallByIndex(scene, index);
        const updated = wallData.walls.filter((_, i) => i !== index);
        onWallDataChange({ ...wallData, walls: updated, count: updated.length });
    };

    const undo = () => {
        if (!history.length) return;
        const last = history[history.length - 1];
        if (last.type === "remove") {
            const updated = [...wallData.walls];
            updated.splice(last.index, 0, last.wall);
            onWallDataChange({ ...wallData, walls: updated, count: updated.length });
        }
        setHistory(prev => prev.slice(0, -1));
    };

    return (
        <div>
            <p className="section-label" style={{ marginTop: 16 }}>
                Correction Tools
            </p>

            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <button
                    className="btn"
                    style={{ background: mode === "view" ? "#1f3a8c" : "#21262d" }}
                    onClick={() => setMode("view")}
                >
                    View
                </button>
                <button
                    className="btn"
                    style={{ background: mode === "remove" ? "#8b2222" : "#21262d" }}
                    onClick={() => setMode("remove")}
                >
                    Remove
                </button>
            </div>

            {mode === "remove" && (
                <div>
                    <p className="hint-text" style={{ marginBottom: 4 }}>
                        {wallData.walls.length} walls — click to delete
                    </p>
                    <div className="wall-list">
                        {wallData.walls.map((w, i) => (
                            <div
                                key={i}
                                className="wall-item"
                                onClick={() => removeWall(i)}
                            >
                                {i}: [{w.start[0]},{w.start[1]}]→[{w.end[0]},{w.end[1]}]
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <button
                className="btn"
                style={{
                    marginTop: 8,
                    background: "#21262d",
                    opacity: history.length === 0 ? 0.4 : 1
                }}
                onClick={undo}
                disabled={history.length === 0}
            >
                Undo ({history.length})
            </button>
        </div>
    );
}