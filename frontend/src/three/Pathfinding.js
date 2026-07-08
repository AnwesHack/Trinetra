import * as THREE from "three";
import * as PF from "pathfinding";

const MARKER_TAG      = "path-marker";
const RISK_THRESHOLD  = 0.65;   // path node risk above this → recompute
const RECOMPUTE_MS    = 500;     // debounce — max once per 500ms

// ── Dynamic path state ────────────────────────────────────────
let _dynamicState = {
    active:        false,
    gridData:      null,
    startWorld:    null,
    endWorld:      null,
    currentPath:   [],     // [[col,row], ...]
    worldPoints:   [],     // THREE.Vector3[]
    lastRecompute: 0,      // timestamp of last recompute
    scene:         null,
    floorY:        0,
    onPathUpdate:  null    // callback → App.jsx updates UI
};

// ─────────────────────────────────────────────────────────────
// STATIC PATH (single run — used for UI click flow)
// ─────────────────────────────────────────────────────────────

export function findPath(gridData, startWorld, endWorld) {
    if (!gridData) return [];
    return _runAStar(gridData, startWorld, endWorld);
}

export function pathToWorld(path, gridData, floorY = 0) {
    if (!path || path.length === 0) return [];
    return path.map(([col, row]) => {
        const cell = gridData.grid[row][col];
        return new THREE.Vector3(cell.worldX, floorY + 0.15, cell.worldZ);
    });
}

export function drawPath(scene, worldPoints) {
    clearPath(scene);
    if (!worldPoints || worldPoints.length < 2) return;
    _renderPath(scene, worldPoints);
}

export function clearPath(scene) {
    if (!scene) return;
    const dead = [];
    scene.traverse(o => {
        if (o.userData?.tag === MARKER_TAG) dead.push(o);
    });
    dead.forEach(o => {
        o.geometry?.dispose();
        o.material?.dispose();
        scene.remove(o);
    });
}

// ─────────────────────────────────────────────────────────────
// DYNAMIC PATH (auto-recomputes when fire/risk changes)
// ─────────────────────────────────────────────────────────────

/**
 * startDynamicPath()
 *
 * Call this instead of findPath() when you want a live path
 * that updates as fire spreads.
 *
 * @param {THREE.Scene} scene
 * @param {object}      gridData   - current floor grid
 * @param {object}      startWorld - {x, z} world position
 * @param {object}      endWorld   - {x, z} world position
 * @param {number}      floorY     - floor vertical offset
 * @param {function}    onUpdate   - called with (stepCount) when path changes
 */
export function startDynamicPath(
    scene, gridData, startWorld, endWorld, floorY = 0, onUpdate = null
) {
    // Clear any existing dynamic path
    stopDynamicPath(scene);

    const path = _runAStar(gridData, startWorld, endWorld);
    if (!path.length) return false;

    const pts = pathToWorld(path, gridData, floorY);
    _renderPath(scene, pts);

    _dynamicState = {
        active:        true,
        gridData,
        startWorld,
        endWorld,
        currentPath:   path,
        worldPoints:   pts,
        lastRecompute: Date.now(),
        scene,
        floorY,
        onPathUpdate:  onUpdate
    };

    return true;
}

/**
 * notifyEnvironmentChanged()
 *
 * Call this whenever fire spreads or heatmap updates.
 * Internally debounced — safe to call every fire tick.
 *
 * Returns true if path was recomputed.
 */
export function notifyEnvironmentChanged() {
    const s = _dynamicState;
    if (!s.active || !s.gridData) return false;

    const now = Date.now();

    // Debounce — do not recompute more than once per RECOMPUTE_MS
    if (now - s.lastRecompute < RECOMPUTE_MS) return false;

    // Check if current path is still safe
    const needsRecompute = _pathHasHighRisk(s.currentPath, s.gridData);
    if (!needsRecompute) return false;

    // Recompute
    const newPath = _runAStar(s.gridData, s.startWorld, s.endWorld);
    if (!newPath.length) {
        // No path found — draw nothing, notify caller
        clearPath(s.scene);
        if (s.onPathUpdate) s.onPathUpdate(0);
        return false;
    }

    // Smooth transition — only update if path actually changed
    if (_pathsEqual(newPath, s.currentPath)) return false;

    s.currentPath   = newPath;
    s.worldPoints   = pathToWorld(newPath, s.gridData, s.floorY);
    s.lastRecompute = now;

    // Redraw path
    clearPath(s.scene);
    _renderPath(s.scene, s.worldPoints);

    if (s.onPathUpdate) s.onPathUpdate(newPath.length);

    return true;
}

/**
 * stopDynamicPath()
 * Clears live path and disables auto-recompute.
 */
export function stopDynamicPath(scene) {
    _dynamicState.active = false;
    if (scene) clearPath(scene);
}

/**
 * isDynamicPathActive()
 */
export function isDynamicPathActive() {
    return _dynamicState.active;
}

// ─────────────────────────────────────────────────────────────
// MARKER PLACEMENT (unchanged from before)
// ─────────────────────────────────────────────────────────────

export function placeStartMarker(scene, position) {
    _clearMarkerByName(scene, "start-marker");
    _clearMarkerByName(scene, "start-ring");

    const geo  = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8);
    const mat  = new THREE.MeshLambertMaterial({ color: 0x00cc44 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(position.x, position.y + 0.75, position.z);
    mesh.name         = "start-marker";
    mesh.userData.tag = MARKER_TAG;
    scene.add(mesh);

    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 16);
    const ringMat = new THREE.MeshBasicMaterial({
        color:0x00ff44, transparent:true, opacity:0.7, side:THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x   = -Math.PI / 2;
    ring.position.set(position.x, position.y + 0.05, position.z);
    ring.name         = "start-ring";
    ring.userData.tag = MARKER_TAG;
    scene.add(ring);
}

export function placeEndMarker(scene, position) {
    _clearMarkerByName(scene, "end-marker");
    _clearMarkerByName(scene, "end-ring");

    const geo  = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8);
    const mat  = new THREE.MeshLambertMaterial({ color: 0xff3333 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(position.x, position.y + 0.75, position.z);
    mesh.name         = "end-marker";
    mesh.userData.tag = MARKER_TAG;
    scene.add(mesh);

    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 16);
    const ringMat = new THREE.MeshBasicMaterial({
        color:0xff4444, transparent:true, opacity:0.7, side:THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x   = -Math.PI / 2;
    ring.position.set(position.x, position.y + 0.05, position.z);
    ring.name         = "end-ring";
    ring.userData.tag = MARKER_TAG;
    scene.add(ring);
}

// ─────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────

function _runAStar(gridData, startWorld, endWorld) {
    const { grid, cols, rows } = gridData;

    const pfGrid = new PF.Grid(cols, rows);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            // Block walls, heavy fire, extreme congestion, and high-risk cells
            if (
                !cell.walkable ||
                (cell.fireLevel  ?? 0) > 3  ||
                (cell.dynamicCost ?? 0) > 10 ||
                (cell.risk        ?? 0) > RISK_THRESHOLD
            ) {
                pfGrid.setWalkableAt(c, r, false);
            }
        }
    }

    const sc = _nearestWalkable(
        Math.floor((startWorld.x - gridData.minX) / gridData.cellSize),
        Math.floor((startWorld.z - gridData.minZ) / gridData.cellSize),
        grid, cols, rows
    );
    const ec = _nearestWalkable(
        Math.floor((endWorld.x - gridData.minX) / gridData.cellSize),
        Math.floor((endWorld.z - gridData.minZ) / gridData.cellSize),
        grid, cols, rows
    );

    if (!sc || !ec) return [];

    const finder = new (PF.AStarFinder || PF.default.AStarFinder)({ allowDiagonal: false });
    return finder.findPath(sc.c, sc.r, ec.c, ec.r, pfGrid);
}

function _pathHasHighRisk(path, gridData) {
    if (!path || !path.length) return false;
    const { grid } = gridData;

    return path.some(([col, row]) => {
        const cell = grid[row]?.[col];
        if (!cell) return true;   // cell gone — recompute
        // Recompute if fire reached path OR risk too high
        return (
            (cell.fireLevel  ?? 0) > 0 ||
            (cell.risk        ?? 0) > RISK_THRESHOLD
        );
    });
}

function _pathsEqual(a, b) {
    if (a.length !== b.length) return false;
    return a.every(([ac, ar], i) => ac === b[i][0] && ar === b[i][1]);
}

function _renderPath(scene, worldPoints) {
    if (!worldPoints || worldPoints.length < 2) return;

    // Main line
    const geo  = new THREE.BufferGeometry().setFromPoints(worldPoints);
    const mat  = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    line.name         = "path-line";
    line.userData.tag = MARKER_TAG;
    scene.add(line);

    // Dot every 3rd point for FPS visibility
    worldPoints.forEach((pt, i) => {
        if (i % 3 !== 0) return;
        const dGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const dMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
        const dot  = new THREE.Mesh(dGeo, dMat);
        dot.position.copy(pt);
        dot.userData.tag = MARKER_TAG;
        scene.add(dot);
    });
}

function _nearestWalkable(c, r, grid, cols, rows) {
    if (r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c].walkable)
        return { c, r };
    for (let d = 1; d < 8; d++)
        for (let dr = -d; dr <= d; dr++)
            for (let dc = -d; dc <= d; dc++) {
                const nr = r+dr, nc = c+dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                    grid[nr][nc].walkable)
                    return { c: nc, r: nr };
            }
    return null;
}

function _clearMarkerByName(scene, name) {
    const obj = scene.getObjectByName(name);
    if (obj) {
        obj.geometry?.dispose();
        obj.material?.dispose();
        scene.remove(obj);
    }
}