import * as THREE from "three";

// Vertical distance between floor levels in world units
const FLOOR_HEIGHT = 12;

// Tag for floor-specific meshes so we can find/remove them
const FLOOR_WALL_TAG   = "floor-wall";
const STAIR_TAG        = "stair-marker";
const FLOOR_PLANE_TAG  = "floor-plane";

/**
 * FloorManager
 *
 * Manages multiple floors in one Three.js scene.
 * Each floor has:
 *   - floorIndex: 0 = ground, 1 = first upper, etc.
 *   - walls:      raw wall JSON from API
 *   - grid:       createGrid() output (added when grid is built)
 *   - meshGroup:  THREE.Group containing all meshes for this floor
 *   - stairs:     array of { col, row } stair cells on this floor
 *
 * Floors are stacked vertically:
 *   floor 0 → y = 0
 *   floor 1 → y = FLOOR_HEIGHT
 *   floor 2 → y = FLOOR_HEIGHT * 2
 *   etc.
 */
export class FloorManager {
    constructor(scene) {
        this.scene      = scene;
        this.floors     = [];        // array of floor data objects
        this.activeFloor = 0;        // which floor is currently shown
    }

    // ── Get floor Y offset ────────────────────────────────────
    getFloorY(floorIndex) {
        return floorIndex * FLOOR_HEIGHT;
    }

    // ── Add a new floor ───────────────────────────────────────
    // Called when user uploads a blueprint for a new floor.
    addFloor(floorIndex, walls, scale = 0.05, wallHeight = 3.0) {
        // Remove existing floor at this index if re-uploading
        this.removeFloor(floorIndex);

        const floorY     = this.getFloorY(floorIndex);
        const meshGroup  = new THREE.Group();
        meshGroup.name   = `floor-group-${floorIndex}`;
        meshGroup.position.y = floorY;

        // Build wall meshes
        const wallMat = new THREE.MeshLambertMaterial({
            color: _floorColor(floorIndex),
            side:  THREE.DoubleSide,
        });

        walls.forEach((wall, idx) => {
            const x1 = wall.start[0] * scale;
            const z1 = wall.start[1] * scale;
            const x2 = wall.end[0]   * scale;
            const z2 = wall.end[1]   * scale;

            const dx     = x2 - x1;
            const dz     = z2 - z1;
            const length = Math.sqrt(dx * dx + dz * dz);
            if (length < 0.05) return;

            const geo  = new THREE.BoxGeometry(length, wallHeight, 0.15);
            const mesh = new THREE.Mesh(geo, wallMat.clone());

            mesh.position.set(
                (x1 + x2) / 2,
                wallHeight / 2,
                (z1 + z2) / 2
            );
            mesh.rotation.y = -Math.atan2(dz, dx);

            mesh.castShadow    = true;
            mesh.receiveShadow = true;

            mesh.userData.tag        = FLOOR_WALL_TAG;
            mesh.userData.floorIndex = floorIndex;
            mesh.userData.wallIndex  = idx;
            mesh.userData.wallData   = wall;

            meshGroup.add(mesh);
        });

        // Build floor plane for this level
        const floorPlane = _buildFloorPlane(walls, scale, floorIndex);
        if (floorPlane) {
            floorPlane.userData.tag        = FLOOR_PLANE_TAG;
            floorPlane.userData.floorIndex = floorIndex;
            meshGroup.add(floorPlane);
        }

        this.scene.add(meshGroup);

        const floorData = {
            floorIndex,
            walls,
            scale,
            meshGroup,
            grid:      null,   // set later by App.jsx via setGrid()
            stairs:    [],     // stair cells — set by markStairs()
            visible:   true
        };

        this.floors[floorIndex] = floorData;
        return floorData;
    }

    // ── Remove a floor ────────────────────────────────────────
    removeFloor(floorIndex) {
        const existing = this.floors[floorIndex];
        if (!existing) return;

        existing.meshGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        this.scene.remove(existing.meshGroup);
        this.floors[floorIndex] = null;
    }

    // ── Attach grid data to a floor ───────────────────────────
    // Called from App.jsx after createGrid() runs
    setGrid(floorIndex, gridData) {
        if (this.floors[floorIndex]) {
            this.floors[floorIndex].grid = gridData;
        }
    }

    // ── Get grid for a specific floor ────────────────────────
    getGrid(floorIndex) {
        return this.floors[floorIndex]?.grid || null;
    }

    // ── Get walls for a specific floor ───────────────────────
    getWalls(floorIndex) {
        return this.floors[floorIndex]?.walls || [];
    }

    // ── Get all wall meshes for a floor ──────────────────────
    // Used by FPSControls for collision on active floor
    getWallMeshes(floorIndex) {
        const floor = this.floors[floorIndex];
        if (!floor) return [];
        const meshes = [];
        floor.meshGroup.traverse(o => {
            if (o.userData?.tag === FLOOR_WALL_TAG) meshes.push(o);
        });
        return meshes;
    }

    // ── Get floor plane for raycasting clicks ─────────────────
    getFloorPlane(floorIndex) {
        const floor = this.floors[floorIndex];
        if (!floor) return null;
        let plane = null;
        floor.meshGroup.traverse(o => {
            if (o.userData?.tag === FLOOR_PLANE_TAG) plane = o;
        });
        return plane;
    }

    // ── Mark a grid cell as a staircase ──────────────────────
    // Stair cells are connectors between floors.
    // A* does not use these yet — just marks them visually.
    markStair(floorIndex, col, row) {
        const floor = this.floors[floorIndex];
        if (!floor) return;

        // Avoid duplicate stair markers
        const exists = floor.stairs.find(
            s => s.col === col && s.row === row
        );
        if (exists) return;

        floor.stairs.push({ col, row });

        // Visual marker — yellow box on the grid cell
        const grid = floor.grid;
        if (!grid) return;

        const cell = grid.grid[row]?.[col];
        if (!cell) return;

        const geo  = new THREE.BoxGeometry(
            grid.cellSize * 0.8,
            0.3,
            grid.cellSize * 0.8
        );
        const mat  = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cell.worldX, 0.15, cell.worldZ);
        mesh.name            = `stair-${floorIndex}-${col}-${row}`;
        mesh.userData.tag    = STAIR_TAG;
        mesh.userData.floor  = floorIndex;
        mesh.userData.col    = col;
        mesh.userData.row    = row;

        floor.meshGroup.add(mesh);
    }

    // ── Remove a stair marker ─────────────────────────────────
    removeStair(floorIndex, col, row) {
        const floor = this.floors[floorIndex];
        if (!floor) return;

        floor.stairs = floor.stairs.filter(
            s => !(s.col === col && s.row === row)
        );

        const name = `stair-${floorIndex}-${col}-${row}`;
        const obj  = floor.meshGroup.getObjectByName(name);
        if (obj) {
            obj.geometry?.dispose();
            obj.material?.dispose();
            floor.meshGroup.remove(obj);
        }
    }

    // ── Show / hide a floor ───────────────────────────────────
    setFloorVisible(floorIndex, visible) {
        const floor = this.floors[floorIndex];
        if (!floor) return;
        floor.meshGroup.visible = visible;
        floor.visible           = visible;
    }

    // ── Show only one floor, hide all others ──────────────────
    isolateFloor(floorIndex) {
        this.floors.forEach((floor, idx) => {
            if (!floor) return;
            this.setFloorVisible(idx, idx === floorIndex);
        });
        this.activeFloor = floorIndex;
    }

    // ── Show all floors at once ───────────────────────────────
    showAllFloors() {
        this.floors.forEach((floor, idx) => {
            if (!floor) return;
            this.setFloorVisible(idx, true);
        });
    }

    // ── Get total number of floors added ─────────────────────
    getFloorCount() {
        return this.floors.filter(Boolean).length;
    }

    // ── Get array of floor indices that have data ─────────────
    getFloorIndices() {
        return this.floors
            .map((f, i) => f ? i : null)
            .filter(i => i !== null);
    }

    // ── Move camera to a floor ────────────────────────────────
    // Call this when switching floors so camera jumps to that level
    moveCameraToFloor(floorIndex, camera, controls) {
        if (!camera) return;
        const floorY = this.getFloorY(floorIndex);

        // Keep XZ position, just shift Y
        camera.position.y += floorY - this.getFloorY(this.activeFloor);

        if (controls) {
            controls.target.y = floorY;
            controls.update();
        }

        this.activeFloor = floorIndex;
    }

    // ── Teleport FPS camera to a floor ────────────────────────
    teleportFPSToFloor(floorIndex, fps, wallData, scale) {
        if (!fps) return;
        const floorY = this.getFloorY(floorIndex);
        const walls  = this.getWalls(floorIndex);
        if (!walls.length) return;

        // Find building center for this floor
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        walls.forEach(w => {
            const x1 = w.start[0]*scale, z1 = w.start[1]*scale;
            const x2 = w.end[0]*scale,   z2 = w.end[1]*scale;
            minX = Math.min(minX,x1,x2); maxX = Math.max(maxX,x1,x2);
            minZ = Math.min(minZ,z1,z2); maxZ = Math.max(maxZ,z1,z2);
        });

        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;

        // Offset the teleport Y by floor height
        fps.teleportToWithY(
            (minX + maxX) / 2,
            floorY + 1.7,          // eye height on this floor
            maxZ + 2,
            cx,
            cz
        );

        this.activeFloor = floorIndex;
    }

    // ── Clear everything ──────────────────────────────────────
    clearAll() {
        this.floors.forEach((_, idx) => this.removeFloor(idx));
        this.floors      = [];
        this.activeFloor = 0;
    }
}

// ── PRIVATE HELPERS ───────────────────────────────────────────

// Different wall colors per floor so you can tell them apart
function _floorColor(floorIndex) {
    const colors = [
        0xb0bec5,   // floor 0 — grey
        0x90caf9,   // floor 1 — light blue
        0xa5d6a7,   // floor 2 — light green
        0xffcc80,   // floor 3 — light orange
        0xf48fb1,   // floor 4 — light pink
    ];
    return colors[floorIndex % colors.length];
}

// Build a floor plane sized to the building bounding box
function _buildFloorPlane(walls, scale, floorIndex) {
    if (!walls.length) return null;

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    walls.forEach(w => {
        const x1 = w.start[0]*scale, z1 = w.start[1]*scale;
        const x2 = w.end[0]*scale,   z2 = w.end[1]*scale;
        minX = Math.min(minX,x1,x2); maxX = Math.max(maxX,x1,x2);
        minZ = Math.min(minZ,z1,z2); maxZ = Math.max(maxZ,z1,z2);
    });

    const pad = 4;
    const w   = (maxX - minX) + pad * 2;
    const d   = (maxZ - minZ) + pad * 2;
    const cx  = (minX + maxX) / 2;
    const cz  = (minZ + maxZ) / 2;

    const geo  = new THREE.PlaneGeometry(w, d);

    // Slightly different floor color per level
    const floorColors = [0x111122, 0x111a22, 0x111a11, 0x1a1a11];
    const mat  = new THREE.MeshLambertMaterial({
        color: floorColors[floorIndex % floorColors.length]
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x    = -Math.PI / 2;
    mesh.position.set(cx, -0.01, cz);
    mesh.receiveShadow = true;
    mesh.name          = `floor-plane-${floorIndex}`;

    return mesh;
}

export { FLOOR_HEIGHT };