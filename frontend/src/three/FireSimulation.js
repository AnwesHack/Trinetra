import * as THREE from "three";

const FIRE_NAME      = "fire-overlay";
const SPREAD_MS      = 600;
const MAX_FIRE_LEVEL = 8;

let _interval = null;

export function startFire(scene, gridData, originCol, originRow, onUpdate) {
    stopFire(scene, gridData);
    if (!gridData) return;

    const { grid, rows, cols } = gridData;

    // Reset all fire levels
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            grid[r][c].fireLevel = 0;

    // Validate and ignite origin
    if (
        originRow < 0 || originRow >= rows ||
        originCol < 0 || originCol >= cols ||
        !grid[originRow][originCol].walkable
    ) return;

    grid[originRow][originCol].fireLevel = 1;

    // Initial render
    _renderFire(scene, gridData);

    _interval = setInterval(() => {
        _spreadFire(grid, rows, cols);
        _renderFire(scene, gridData);
        if (onUpdate) onUpdate();
    }, SPREAD_MS);
}

export function stopFire(scene, gridData) {
    if (_interval) {
        clearInterval(_interval);
        _interval = null;
    }
    if (gridData) {
        const { grid, rows, cols } = gridData;
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++)
                grid[r][c].fireLevel = 0;
    }
    if (scene) _clearFire(scene);
}

export function isFireRunning() {
    return _interval !== null;
}

export function placeFireMarker(scene, position, floorY = 0) {
    _removeNamed(scene, "fire-origin-marker");
    const geo  = new THREE.SphereGeometry(0.35, 8, 8);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xff4400 });
    const mesh = new THREE.Mesh(geo, mat);
    // Use floorY so marker appears on the correct floor level
    mesh.position.set(position.x, floorY + 0.6, position.z);
    mesh.name = "fire-origin-marker";
    scene.add(mesh);
}

export function removeFireMarker(scene) {
    _removeNamed(scene, "fire-origin-marker");
}

// ── PRIVATE ───────────────────────────────────────────────────

function _spreadFire(grid, rows, cols) {
    const burning = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            if (grid[r][c].fireLevel > 0 && grid[r][c].fireLevel < MAX_FIRE_LEVEL)
                burning.push({ r, c });

    burning.forEach(({ r, c }) => {
        [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr,nc]) => {
            if (
                nr >= 0 && nr < rows &&
                nc >= 0 && nc < cols &&
                grid[nr][nc].walkable &&
                grid[nr][nc].fireLevel === 0 &&
                Math.random() < 0.7
            ) {
                grid[nr][nc].fireLevel = grid[r][c].fireLevel + 1;
            }
        });
        grid[r][c].fireLevel = Math.min(MAX_FIRE_LEVEL, grid[r][c].fireLevel + 1);
    });
}

function _renderFire(scene, gridData) {
    _clearFire(scene);
    if (!gridData) return;

    const { grid, rows, cols, cellSize } = gridData;

    // ── KEY FIX: read floorY from gridData, not hardcoded 0.12 ──
    const floorY = gridData.floorY ?? 0;

    const group = new THREE.Group();
    group.name  = FIRE_NAME;

    const yellow = new THREE.Color(0xffff00);
    const red    = new THREE.Color(0xff1100);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (!cell.walkable || !cell.fireLevel) continue;

            const t     = Math.min(1, cell.fireLevel / MAX_FIRE_LEVEL);
            const color = yellow.clone().lerp(red, t);

            const geo = new THREE.PlaneGeometry(cellSize * 0.85, cellSize * 0.85);
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity:     0.45 + t * 0.4,
                side:        THREE.DoubleSide,
                depthWrite:  false
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            // floorY from gridData positions fire on the correct floor
            mesh.position.set(cell.worldX, floorY + 0.12, cell.worldZ);
            group.add(mesh);
        }
    }

    scene.add(group);
}

function _clearFire(scene) {
    if (!scene) return;
    const old = scene.getObjectByName(FIRE_NAME);
    if (old) {
        old.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
        scene.remove(old);
    }
}

function _removeNamed(scene, name) {
    if (!scene) return;
    const obj = scene.getObjectByName(name);
    if (obj) {
        obj.geometry?.dispose();
        obj.material?.dispose();
        scene.remove(obj);
    }
}