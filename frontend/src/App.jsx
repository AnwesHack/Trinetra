import React, { useRef, useEffect, useState } from "react";
import { createScene } from "./three/Scene";
import {
    generateWalls, clearWalls,
    setCameraRef, getWallMeshes,
    getBuildingCenter
} from "./three/WallGenerator";
import { createFPSControls } from "./three/FPSControls";
import { createGrid, debugDrawGrid, removeDebugGrid } from "./three/GridSystem";
import {
    findPath, pathToWorld, drawPath,
    clearPath, placeStartMarker, placeEndMarker,
    notifyEnvironmentChanged, startDynamicPath
} from "./three/Pathfinding";
import {
    computeVisibility, renderVisibilityOverlay,
    removeVisibilityOverlay, placeObserverMarker,
    removeObserverMarker
} from "./three/Visibility";
import { computeHeatmap, renderHeatmap, removeHeatmap } from "./three/Heatmap";
import { FloorManager, FLOOR_HEIGHT } from "./three/FloorManager";
import {
    startFire, stopFire,
    placeFireMarker, removeFireMarker
} from "./three/FireSimulation";
import {
    startAgents, stopAgents, updateAgents, areAgentsRunning
} from "./three/AgentSimulation";
import { Section, Slider, Btn, Toggle, Legend } from "./components/Controls";
import {
    Menu, Layers, Settings, Flame, Users,
    Activity, QrCode, Crosshair, Wrench, Zap
} from "lucide-react";
import { checkHealth, uploadBlueprint } from "./api/api";
import CorrectionTools from "./components/CorrectionTools";
import QRSync from "./components/QRSync";
import * as THREE from "three";
import "./App.css";

const MAX_FLOORS = 5;

// Custom hook to track true FPS
function useFPS() {
    const [fps, setFps] = useState(0);
    const frameCount = useRef(0);
    const lastTime = useRef(performance.now());
    const rAF = useRef(null);

    useEffect(() => {
        const loop = () => {
            const now = performance.now();
            frameCount.current++;
            if (now >= lastTime.current + 1000) {
                setFps(Math.round((frameCount.current * 1000) / (now - lastTime.current)));
                frameCount.current = 0;
                lastTime.current = now;
            }
            rAF.current = requestAnimationFrame(loop);
        };
        rAF.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(rAF.current);
    }, []);
    return fps;
}

function App() {
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const rendererRef = useRef(null);
    const fpsRef = useRef(null);
    const controlsRef = useRef(null);
    const floorMgrRef = useRef(null);
    const clickRayRef = useRef(new THREE.Raycaster());
    const startPosRef = useRef(null);
    const endPosRef = useRef(null);
    const exitCellRef = useRef([]);

    const [status, setStatus] = useState("Initializing...");
    const [uiFpsMode, setUiFpsMode] = useState(false); // Controls both high-perf UI & 3D FPS camera
    const [activeFloor, setActiveFloor] = useState(0);
    const [floorCount, setFloorCount] = useState(0);
    const [floorUploads, setFloorUploads] = useState({});
    const [viewMode, setViewMode] = useState("single");
    const [stairMode, setStairMode] = useState(false);
    const [scale, setScale] = useState(0.05);
    const [wallH, setWallH] = useState(3.0);
    const [showGrid, setShowGrid] = useState(false);
    const [showVis, setShowVis] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [clickMode, setClickMode] = useState("none");
    const [visClickMode, setVisClickMode] = useState(false);
    const [exitClickMode, setExitClickMode] = useState(false);
    const [fireClickMode, setFireClickMode] = useState(false);
    const [startSet, setStartSet] = useState(false);
    const [endSet, setEndSet] = useState(false);
    const [pathFound, setPathFound] = useState(null);
    const [observerSet, setObserverSet] = useState(false);
    const [exitSet, setExitSet] = useState(false);
    const [fireRunning, setFireRunning] = useState(false);
    const [agentsRunning, setAgentsRunning] = useState(false);
    const [agentCount, setAgentCount] = useState(5);
    const [wBlind, setWBlind] = useState(5);
    const [wDist, setWDist] = useState(2);
    const [wCorner, setWCorner] = useState(3);

    const currentFps = useFPS();

    const getFloorY = (idx) =>
        floorMgrRef.current
            ? floorMgrRef.current.getFloorY(idx)
            : idx * FLOOR_HEIGHT;

    // ── EFFECT 1 — scene ONCE ─────────────────────────────────
    useEffect(() => {
        if (!mountRef.current) return;

        const { scene, camera, renderer, controls, cleanup } =
            createScene(mountRef.current);

        sceneRef.current = scene;
        cameraRef.current = camera;
        rendererRef.current = renderer;
        controlsRef.current = controls;
        setCameraRef(camera, controls);

        const mgr = new FloorManager(scene);
        floorMgrRef.current = mgr;

        const fps = createFPSControls(
            camera, renderer,
            () => floorMgrRef.current
                ? floorMgrRef.current.getWallMeshes(
                    floorMgrRef.current.activeFloor)
                : []
        );
        fpsRef.current = fps;

        let animId;
        const animate = () => {
            animId = requestAnimationFrame(animate);
            fps.update();
            updateAgents();
            if (!fps.getIsLocked()) controls.update();
            renderer.render(scene, camera);
        };
        animate();

        checkHealth()
            .then(d => setStatus("✓ " + d.message))
            .catch(() => setStatus("✗ Backend offline — run uvicorn"));

        return () => { cancelAnimationFrame(animId); cleanup(); };
    }, []);

    // ── Upload floor ──────────────────────────────────────────
    const handleFloorUpload = async (floorIndex, file) => {
        if (!file) return;
        setStatus(`Processing floor ${floorIndex}...`);
        try {
            const data = await uploadBlueprint(file);
            if (!data.walls?.length) {
                setStatus(`✗ No walls for floor ${floorIndex}`);
                return;
            }
            const mgr = floorMgrRef.current;
            const floorY = getFloorY(floorIndex);

            mgr.addFloor(floorIndex, data.walls, scale, wallH);

            const grid = createGrid(data.walls, scale, 0.5, floorY);
            mgr.setGrid(floorIndex, grid);

            setFloorUploads(prev => ({
                ...prev,
                [floorIndex]: {
                    walls: data.walls, count: data.walls.length,
                    fileName: file.name
                }
            }));
            setFloorCount(mgr.getFloorCount());
            switchToFloor(floorIndex);
            setStatus(`✓ Floor ${floorIndex}: ${data.walls.length} walls`);
        } catch (err) {
            setStatus(`✗ Upload failed for floor ${floorIndex}`);
            console.error(err);
        }
    };

    // ── Switch floor ──────────────────────────────────────────
    const switchToFloor = (idx) => {
        const mgr = floorMgrRef.current;
        if (!mgr) return;
        clearOverlays();
        if (viewMode === "single") mgr.isolateFloor(idx);
        else { mgr.showAllFloors(); mgr.activeFloor = idx; }

        const floorY = getFloorY(idx);

        if (fpsRef.current?.setFloorY) {
            fpsRef.current.setFloorY(floorY);
        }

        if (cameraRef.current && controlsRef.current) {
            cameraRef.current.position.y = floorY + 18;
            controlsRef.current.target.y = floorY;
            controlsRef.current.update();
        }
        setActiveFloor(idx);
        setStatus(`Floor ${idx} active`);
    };

    const toggleViewMode = () => {
        const mgr = floorMgrRef.current;
        if (!mgr) return;
        const next = viewMode === "single" ? "all" : "single";
        if (next === "all") mgr.showAllFloors();
        else mgr.isolateFloor(activeFloor);
        setViewMode(next);
    };

    const clearOverlays = () => {
        if (!sceneRef.current) return;
        clearPath(sceneRef.current);
        removeVisibilityOverlay(sceneRef.current);
        removeObserverMarker(sceneRef.current);
        removeHeatmap(sceneRef.current);
        removeDebugGrid(sceneRef.current);
        _clearExitMarker(sceneRef.current);
        stopFire(sceneRef.current, floorMgrRef.current?.getGrid(activeFloor));
        stopAgents(sceneRef.current);
        removeFireMarker(sceneRef.current);

        startPosRef.current = null;
        endPosRef.current = null;
        exitCellRef.current = [];

        setStartSet(false); setEndSet(false);
        setPathFound(null); setShowVis(false);
        setObserverSet(false); setShowHeatmap(false);
        setExitSet(false); setShowGrid(false);
        setClickMode("none"); setVisClickMode(false);
        setExitClickMode(false); setFireClickMode(false);
        setFireRunning(false); setAgentsRunning(false);
    };

    // ── EFFECT 2 — grid debug ─────────────────────────────────
    useEffect(() => {
        const grid = floorMgrRef.current?.getGrid(activeFloor);
        if (!sceneRef.current || !grid) return;
        showGrid
            ? debugDrawGrid(sceneRef.current, grid, getFloorY(activeFloor))
            : removeDebugGrid(sceneRef.current);
    }, [showGrid, activeFloor]);

    // ── EFFECT 3 — visibility ─────────────────────────────────
    useEffect(() => {
        const grid = floorMgrRef.current?.getGrid(activeFloor);
        if (!sceneRef.current || !grid) return;
        showVis
            ? renderVisibilityOverlay(sceneRef.current, grid, getFloorY(activeFloor))
            : removeVisibilityOverlay(sceneRef.current);
    }, [showVis, activeFloor]);

    // ── EFFECT 4 — heatmap ────────────────────────────────────
    useEffect(() => {
        const grid = floorMgrRef.current?.getGrid(activeFloor);
        if (!showHeatmap || !sceneRef.current || !grid) return;
        computeHeatmap(grid, exitCellRef.current, { wBlind, wDist, wCorner });
        renderHeatmap(sceneRef.current, grid, getFloorY(activeFloor));
    }, [showHeatmap, wBlind, wDist, wCorner, activeFloor]);

    // ── EFFECT 5 — floor click ────────────────────────────────
    useEffect(() => {
        const canvas = rendererRef.current?.domElement;
        if (!canvas) return;

        const onFloorClick = (e) => {
            if (uiFpsMode) return;
            const anyActive =
                clickMode !== "none" || visClickMode ||
                exitClickMode || stairMode || fireClickMode;
            if (!anyActive) return;
            if (!sceneRef.current || !cameraRef.current) return;

            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
            clickRayRef.current.setFromCamera(mouse, cameraRef.current);

            const mgr = floorMgrRef.current;
            const floorPlane = mgr?.getFloorPlane(activeFloor);
            if (!floorPlane) return;

            const hits = clickRayRef.current.intersectObject(floorPlane);
            if (!hits.length) return;

            const point = hits[0].point.clone();
            const grid = mgr.getGrid(activeFloor);
            const floorY = getFloorY(activeFloor);

            if (clickMode === "start") {
                startPosRef.current = point.clone();
                placeStartMarker(sceneRef.current, point);
                setStartSet(true);
                setClickMode("end");
                setStatus("✓ Start set — click floor for end");

            } else if (clickMode === "end") {
                endPosRef.current = point.clone();
                placeEndMarker(sceneRef.current, point);
                setEndSet(true);
                setClickMode("none");
                setStatus("✓ End set — click Find Path");

            } else if (visClickMode) {
                placeObserverMarker(sceneRef.current, point);
                setObserverSet(true);
                setVisClickMode(false);
                if (grid) {
                    computeVisibility(sceneRef.current, point, grid);
                    setShowVis(true);
                    renderVisibilityOverlay(sceneRef.current, grid, floorY);
                    if (showHeatmap) {
                        computeHeatmap(grid, exitCellRef.current, { wBlind, wDist, wCorner });
                        renderHeatmap(sceneRef.current, grid, floorY);
                    }
                    setStatus("✓ Visibility computed");
                }

            } else if (exitClickMode) {
                if (!grid) return;
                const { minX, minZ, cellSize, cols, rows, grid: g } = grid;
                const col = Math.floor((point.x - minX) / cellSize);
                const row = Math.floor((point.z - minZ) / cellSize);
                if (col >= 0 && col < cols && row >= 0 && row < rows && g[row][col].walkable) {
                    exitCellRef.current = [{ col, row }];
                    setExitSet(true);
                    setExitClickMode(false);
                    _placeExitMarker(sceneRef.current, point);
                    setStatus("✓ Exit set");
                }

            } else if (stairMode) {
                if (!grid) return;
                const { minX, minZ, cellSize, cols, rows } = grid;
                const col = Math.floor((point.x - minX) / cellSize);
                const row = Math.floor((point.z - minZ) / cellSize);
                if (col >= 0 && col < cols && row >= 0 && row < rows) {
                    mgr.markStair(activeFloor, col, row);
                    setStatus(`✓ Stair marked on floor ${activeFloor} at [${col},${row}]`);
                }

            } else if (fireClickMode) {
                if (!grid) return;
                const { minX, minZ, cellSize, cols, rows, grid: g } = grid;
                const col = Math.floor((point.x - minX) / cellSize);
                const row = Math.floor((point.z - minZ) / cellSize);
                if (col >= 0 && col < cols && row >= 0 && row < rows && g[row][col].walkable) {
                    placeFireMarker(sceneRef.current, point, floorY);
                    setFireClickMode(false);

                    startFire(sceneRef.current, grid, col, row, () => {
                        if (showHeatmap && grid && sceneRef.current) {
                            computeHeatmap(grid, exitCellRef.current, { wBlind, wDist, wCorner });
                            renderHeatmap(sceneRef.current, grid, floorY);
                        }
                        // Trigger dynamic path recompute
                        notifyEnvironmentChanged();
                    });

                    setFireRunning(true);
                    setStatus("🔥 Fire spreading — heatmap updating live");
                }
            }
        };

        canvas.addEventListener("click", onFloorClick);
        return () => canvas.removeEventListener("click", onFloorClick);
    }, [
        clickMode, uiFpsMode, visClickMode, exitClickMode,
        stairMode, fireClickMode, activeFloor,
        showHeatmap, wBlind, wDist, wCorner
    ]);

    // ── EFFECT 6 — fps mode sync ──────────────────────────────
    useEffect(() => {
        if (fpsRef.current) {
            fpsRef.current.setFpsModeState(uiFpsMode);
        }
    }, [uiFpsMode]);

    // ── Actions ───────────────────────────────────────────────
    const runPathfinding = () => {
        const grid = floorMgrRef.current?.getGrid(activeFloor);
        const floorY = getFloorY(activeFloor);
        if (!startPosRef.current || !endPosRef.current || !grid) return;
        
        const success = startDynamicPath(
            sceneRef.current, 
            grid, 
            startPosRef.current, 
            endPosRef.current, 
            floorY,
            (steps) => {
                if (steps > 0) setStatus(`✓ Path updated — ${steps} steps`);
                else setStatus("✗ Path blocked by fire!");
            }
        );

        if (!success) {
            setPathFound(false);
            setStatus("✗ No path found or origin blocked");
            return;
        }

        setPathFound(true);
        setStatus("✓ Path established — monitoring for environmental hazards");
    };

    const resetPath = () => {
        clearPath(sceneRef.current);
        startPosRef.current = null; endPosRef.current = null;
        setStartSet(false); setEndSet(false);
        setPathFound(null); setClickMode("none");
    };

    const resetVisibility = () => {
        removeVisibilityOverlay(sceneRef.current);
        removeObserverMarker(sceneRef.current);
        setShowVis(false); setObserverSet(false); setVisClickMode(false);
    };

    const toggleHeatmap = () => {
        const grid = floorMgrRef.current?.getGrid(activeFloor);
        if (showHeatmap) {
            removeHeatmap(sceneRef.current);
            setShowHeatmap(false);
        } else {
            if (!grid) return;
            computeHeatmap(grid, exitCellRef.current, { wBlind, wDist, wCorner });
            renderHeatmap(sceneRef.current, grid, getFloorY(activeFloor));
            setShowHeatmap(true);
        }
    };

    const handleStopFire = () => {
        const grid = floorMgrRef.current?.getGrid(activeFloor);
        stopFire(sceneRef.current, grid);
        removeFireMarker(sceneRef.current);
        setFireRunning(false);
        setStatus("Fire stopped");
        if (showHeatmap && grid) {
            computeHeatmap(grid, exitCellRef.current, { wBlind, wDist, wCorner });
            renderHeatmap(sceneRef.current, grid, getFloorY(activeFloor));
        }
    };

    const handleStartAgents = () => {
        const grid = floorMgrRef.current?.getGrid(activeFloor);
        if (!grid || !exitCellRef.current?.length) {
            setStatus("✗ Set an exit point first");
            return;
        }
        startAgents(sceneRef.current, grid, exitCellRef.current[0], agentCount);
        setAgentsRunning(true);
        setStatus(`✓ ${agentCount} agents moving toward exit`);
    };

    const handleStopAgents = () => {
        stopAgents(sceneRef.current);
        setAgentsRunning(false);
        setStatus("Agents stopped");
    };

    const getHint = () => {
        if (clickMode === "start") return "👆 Click floor — START point";
        if (clickMode === "end") return "👆 Click floor — END point";
        if (visClickMode) return "👆 Click floor — observer";
        if (exitClickMode) return "👆 Click floor — exit point";
        if (stairMode) return "👆 Click floor — stair connector";
        if (fireClickMode) return "👆 Click floor — fire origin";
        return null;
    };

    const hint = getHint();
    const activeUpload = floorUploads[activeFloor];

    return (
        <div className={`app-layout ${uiFpsMode ? "high-performance-mode" : ""}`}>
            {/* Global Status Bar float */}
            <div style={{
                position: "absolute", bottom: uiFpsMode ? 70 : 24, left: "50%", transform: "translateX(-50%)", zIndex: 1000,
                background: "rgba(9, 9, 11, 0.8)", backdropFilter: "blur(12px)", padding: "8px 20px",
                borderRadius: "20px", border: "1px solid rgba(234, 88, 12, 0.3)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)", pointerEvents: "none",
                transition: "bottom 0.3s ease"
            }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: status.includes("✗") ? "#ef4444" : "#22c55e" }}>
                    {status.includes("✓") ? "✅ " + status.substring(2) : status}
                </span>
                {hint && !uiFpsMode && (
                    <span style={{ marginLeft: 16, borderLeft: "1px solid #3f3f46", paddingLeft: 16, color: "#fdba74" }}>
                        {hint}
                    </span>
                )}
            </div>

            <div className={`sidebar`}>
                {/* 1. Left: Brand */}
                <div className="sidebar-header" style={{ display: "flex", alignItems: "center", zIndex: 10 }}>
                    <div className="app-title">TACTICAL</div>
                </div>

                {/* FPS Mode Toggle — sits between brand and nav links */}
                <div style={{ display: "flex", alignItems: "center", padding: "0 16px", flexShrink: 0 }}>
                    <div
                        className={`glass-toggle ${uiFpsMode ? "active" : ""}`}
                        onClick={() => setUiFpsMode(!uiFpsMode)}
                    >
                        <span className="toggle-label">FPS MODE</span>
                        <div className="toggle-track">
                            <div className="toggle-thumb">
                                <Zap size={12} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Center: Navigation Links */}
                <div className="sidebar-content">
                    {/* Multi-Floor Blueprints */}
                    <Section title="MULTI-FLOOR BLUEPRINT" icon={Layers}>
                        <p className="hint-text" style={{ marginBottom: 12 }}>
                            Mount blueprint topologies.
                        </p>
                        {Array.from({ length: MAX_FLOORS }, (_, i) => (
                            <div key={i} style={{ marginBottom: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                    <div style={{
                                        width: 8, height: 8, borderRadius: "50%",
                                        background: floorUploads[i] ? "#ea580c" : "#3f3f46",
                                        boxShadow: floorUploads[i] ? "0 0 8px #ea580c" : "none",
                                        flexShrink: 0
                                    }} />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: floorUploads[i] ? "#e4e4e7" : "#71717a" }}>
                                        LEVEL {i}{floorUploads[i] ? ` — [${floorUploads[i].count} NODES]` : ""}
                                    </span>
                                </div>
                                <label style={{
                                    display: "block", padding: "8px 12px",
                                    background: activeFloor === i && floorUploads[i] ? "rgba(234, 88, 12, 0.2)" : "rgba(39, 39, 42, 0.4)",
                                    border: activeFloor === i ? "1px solid #ea580c" : "1px solid rgba(63, 63, 70, 0.5)",
                                    borderRadius: 6, fontSize: 11, fontWeight: 600, color: activeFloor === i ? "#ffedd5" : "#a1a1aa",
                                    cursor: "pointer", textAlign: "center", transition: "all 0.3s ease",
                                    boxShadow: activeFloor === i ? "0 0 12px rgba(234, 88, 12, 0.2)" : "none"
                                }}>
                                    {floorUploads[i] ? `RE-INITIALIZE LEVEL ${i}` : `MOUNT LEVEL ${i}`}
                                    <input type="file" accept="image/*" style={{ display: "none" }}
                                        onChange={e => { const f = e.target.files[0]; if (f) handleFloorUpload(i, f); e.target.value = ""; }} />
                                </label>
                            </div>
                        ))}

                        {floorCount > 1 && (
                            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(234, 88, 12, 0.15)" }}>
                                <p style={{
                                    fontSize: 10, color: "#71717a", marginBottom: 8, fontWeight: 600,
                                    textTransform: "uppercase", letterSpacing: 0.5
                                }}>Network Tier Isolation</p>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                                    {floorMgrRef.current?.getFloorIndices().map(idx => (
                                        <button key={idx} onClick={() => switchToFloor(idx)}
                                            style={{
                                                padding: "6px 14px", fontSize: 11, fontWeight: 700,
                                                background: activeFloor === idx ? "rgba(234, 88, 12, 0.8)" : "rgba(39, 39, 42, 0.5)",
                                                color: activeFloor === idx ? "#ffffff" : "#a1a1aa",
                                                border: activeFloor === idx ? "1px solid #f97316" : "1px solid transparent",
                                                borderRadius: 4, cursor: "pointer", transition: "all 0.2s"
                                            }}>
                                            L{idx}
                                        </button>
                                    ))}
                                </div>
                                <Btn onClick={toggleViewMode}>
                                    {viewMode === "single" ? "RENDER: FULL STACK" : "ISOLATE ACTIVE TIER"}
                                </Btn>
                            </div>
                        )}

                        {floorCount > 0 && (
                            <Btn onClick={() => setStairMode(v => !v)} active={stairMode} icon={Activity} style={{ marginTop: 8 }}>
                                {stairMode ? "CANCEL STAIR MODE" : "DEFINE STAIR VECTOR"}
                            </Btn>
                        )}
                    </Section>

                    {/* Settings & Parameters */}
                    {floorCount > 0 && (
                        <Section title="PARAMETERS" icon={Settings} defaultOpen={false}>
                            <Slider label="Wall Height: Y" value={wallH} min={1} max={8} step={0.5} onChange={setWallH} />
                            <Slider label={`Scale: ${scale.toFixed(3)}`} value={scale} min={0.01} max={0.2} step={0.005} onChange={setScale} />
                        </Section>
                    )}

                    {/* Analysis Tools */}
                    {activeUpload && (
                        <>
                            <Section title="FIRE SIMULATION" icon={Flame}>
                                <Btn onClick={() => setFireClickMode(v => !v)} active={fireClickMode}>
                                    {fireClickMode ? "Cancel..." : "Set Fire Origin"}
                                </Btn>
                                <p style={{ fontSize: 9, color: "#a1a1aa", marginTop: 4 }}>
                                    Click "Set Fire Origin" then click the floor.
                                </p>
                                {fireRunning && <Btn onClick={handleStopFire} style={{ marginTop: 6 }} active>Stop Fire</Btn>}
                            </Section>

                            <Section title={`HEATMAP - FLOOR ${activeFloor}`} icon={Activity}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <Btn onClick={() => setExitClickMode(v => !v)} active={exitClickMode}>
                                        {exitSet ? "✅ Exit Point set" : "1. Set Exit Point"}
                                    </Btn>
                                    <Btn onClick={toggleHeatmap} active={showHeatmap}>
                                        {showHeatmap ? "Hide Heatmap" : "2. Show Heatmap"}
                                    </Btn>
                                </div>
                                {showHeatmap && (
                                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
                                        <div style={{ width: "48%" }}><Slider label="BLIND SP" value={wBlind} min={0} max={10} step={1} onChange={setWBlind} /></div>
                                        <div style={{ width: "48%" }}><Slider label="DIST W" value={wDist} min={0} max={10} step={1} onChange={setWDist} /></div>
                                        <div style={{ width: "48%" }}><Slider label="CONGEST" value={wCorner} min={0} max={10} step={1} onChange={setWCorner} /></div>
                                        <Legend items={[
                                            { color: "rgba(34, 197, 94, 0.8)", label: "Low" },
                                            { color: "rgba(234, 179, 8, 0.8)", label: "Elevated" },
                                            { color: "rgba(239, 68, 68, 0.8)", label: "Critical" }
                                        ]} />
                                    </div>
                                )}
                            </Section>

                            <Section title={`VISIBILITY - FLOOR ${activeFloor}`} icon={Crosshair}>
                                <div style={{ display: "flex", gap: 4 }}>
                                    <Btn onClick={() => setVisClickMode(v => !v)} active={visClickMode} style={{ flex: 2 }}>
                                        {visClickMode ? "Cancel..." : "Place Observer"}
                                    </Btn>
                                    {observerSet && <Btn onClick={resetVisibility} style={{ flex: 1 }}>Clear</Btn>}
                                </div>
                                {showVis && (
                                    <Legend items={[
                                        { color: "rgba(34, 197, 94, 0.8)", label: "Visible Line of Sight" },
                                        { color: "rgba(239, 68, 68, 0.8)", label: "Obscured / Blind" }
                                    ]} />
                                )}
                            </Section>

                            <Section title={`PATHFINDING - FLOOR ${activeFloor}`} icon={Crosshair}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
                                    <Btn onClick={() => setClickMode(clickMode === "start" ? "none" : "start")}
                                        active={clickMode === "start"}>
                                        {startSet ? "✓ Start set" : "1. Start set"}
                                    </Btn>
                                    <Btn onClick={() => setClickMode(clickMode === "end" ? "none" : "end")}
                                        active={clickMode === "end"}>
                                        {endSet ? "✓ End set" : "2. End set"}
                                    </Btn>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <Btn onClick={runPathfinding} disabled={!startSet || !endSet}>
                                        3. Find Path
                                    </Btn>
                                    <Btn onClick={resetPath}>Reset Path</Btn>
                                </div>
                            </Section>
                        </>
                    )}

                    {/* Toolset */}
                    {floorCount > 0 && (
                        <Section title="Diagnostics" icon={Wrench}>
                            <div style={{ display: "flex", gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <Toggle label="RENDER GRID" value={showGrid} onChange={setShowGrid} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    {activeUpload && (
                                        <CorrectionTools
                                            scene={sceneRef.current}
                                            wallData={
                                                floorUploads[activeFloor]
                                                    ? {
                                                        walls: floorUploads[activeFloor].walls,
                                                        count: floorUploads[activeFloor].count
                                                    }
                                                    : null
                                            }
                                            onWallDataChange={data => {
                                                const floorIndex = activeFloor;
                                                const floorY = getFloorY(floorIndex);
                                                
                                                // 1. Update React state
                                                setFloorUploads(prev => ({
                                                    ...prev,
                                                    [floorIndex]: {
                                                        ...prev[activeFloor],
                                                        walls: data.walls, count: data.count
                                                    }
                                                }));

                                                // 2. Sync with Three.js logic layers
                                                const mgr = floorMgrRef.current;
                                                if (mgr) {
                                                    // This rebuilds the grid and re-attaches it
                                                    const newGrid = createGrid(data.walls, scale, 0.5, floorY);
                                                    mgr.setGrid(floorIndex, newGrid);
                                                    
                                                    // Trigger live updates to visibility/heatmap if active
                                                    if (showHeatmap && newGrid) {
                                                        computeHeatmap(newGrid, exitCellRef.current, { wBlind, wDist, wCorner });
                                                        renderHeatmap(sceneRef.current, newGrid, floorY);
                                                    }
                                                    if (showVis && newGrid && observerSet) {
                                                        // Note: Vis requires observer point which we don't have here easily 
                                                        // but we just reset it to be safe
                                                    }
                                                }
                                                setStatus(`✓ Floor ${floorIndex} updated: ${data.count} walls`);
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </Section>
                    )}

                    {/* Devices */}
                    {floorCount > 0 && (
                        <Section title="QR SYNC" icon={QrCode}>
                            {/*...QR component...*/}
                            <QRSync
                                floors={
                                    floorMgrRef.current?.getFloorIndices()
                                        .map(i => ({
                                            floorIndex: i,
                                            walls: floorMgrRef.current.getWalls(i),
                                            stairs: floorMgrRef.current.floors[i]?.stairs || []
                                        })) || []
                                }
                                scale={scale} wallHeight={wallH}
                                exitCells={exitCellRef.current}
                                activeFloor={activeFloor}
                                weights={{ wBlind, wDist, wCorner }}
                            />
                        </Section>
                    )}
                </div>

                {/* 3. Right: Action Button (FPS Mode) */}
                <div className="nav-actions" style={{ display: "flex", alignItems: "center", zIndex: 10 }}>
                    <div
                        className={`glass-toggle ${uiFpsMode ? "active" : ""}`}
                        onClick={() => setUiFpsMode(!uiFpsMode)}
                    >
                        <span className="toggle-label">FPS MODE</span>
                        <div className="toggle-track">
                            <div className="toggle-thumb">
                                <Zap size={12} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom FPS Overlay Hud */}
            {uiFpsMode && floorCount > 0 && (
                <div className="fps-hud-overlay">
                    <span className="fps-label">PERFORMANCE METRICS</span>
                    <div className="fps-value">{currentFps} <span style={{ fontSize: 14 }}>Hz</span></div>
                    <div className="fps-sparkline"></div>
                </div>
            )}

            <div className="viewport" ref={mountRef}>
                {floorCount > 0 && (
                    <>
                        {/* 3D FPS Drag-to-Look HUD */}
                        {uiFpsMode && (
                            <>
                                <div className="crosshair"></div>
                                <div className="hud-instructions" style={{ pointerEvents: "none" }}>
                                    FPS OVERRIDE ACTIVE — WASD TO MOVE · CLICK & DRAG TO LOOK
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function _placeExitMarker(scene, position) {
    _clearExitMarker(scene);
    const geo = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xea580c }); // Burnt Orange
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(position.x, position.y + 0.75, position.z);
    mesh.name = "exit-marker";
    scene.add(mesh);
    const rGeo = new THREE.RingGeometry(0.3, 0.5, 16);
    const rMat = new THREE.MeshBasicMaterial({
        color: 0xea580c, transparent: true, opacity: 0.8, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(rGeo, rMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, position.y + 0.05, position.z);
    ring.name = "exit-ring";
    scene.add(ring);
}

function _clearExitMarker(scene) {
    if (!scene) return;
    ["exit-marker", "exit-ring"].forEach(name => {
        const o = scene.getObjectByName(name);
        if (o) { o.geometry?.dispose(); o.material?.dispose(); scene.remove(o); }
    });
}

export default App;