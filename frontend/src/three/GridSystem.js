import * as THREE from "three";

export function createGrid(walls, scale = 0.05, cellSize = 0.5, floorY = 0) {
    if (!walls || walls.length === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    walls.forEach(w => {
        const x1 = w.start[0]*scale, z1 = w.start[1]*scale;
        const x2 = w.end[0]*scale,   z2 = w.end[1]*scale;
        minX = Math.min(minX,x1,x2); maxX = Math.max(maxX,x1,x2);
        minZ = Math.min(minZ,z1,z2); maxZ = Math.max(maxZ,z1,z2);
    });

    const PAD = cellSize * 3;
    minX -= PAD; minZ -= PAD;
    maxX += PAD; maxZ += PAD;

    const cols = Math.ceil((maxX - minX) / cellSize);
    const rows = Math.ceil((maxZ - minZ) / cellSize);

    const grid = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => ({
            col:         c,
            row:         r,
            worldX:      minX + (c + 0.5) * cellSize,
            worldZ:      minZ + (r + 0.5) * cellSize,
            walkable:    true,
            visible:     false,
            risk:        0,
            fireLevel:   0,

            // ── Crowd fields (used by AgentSimulation) ────────
            agentCount:  0,    // agents currently in this cell
            occupied:    false, // true if agentCount > 0
            dynamicCost: 0     // extra A* cost from congestion
            // ──────────────────────────────────────────────────
        }))
    );

    walls.forEach(w => {
        const x1 = w.start[0]*scale, z1 = w.start[1]*scale;
        const x2 = w.end[0]*scale,   z2 = w.end[1]*scale;
        const steps = Math.ceil(
            Math.sqrt((x2-x1)**2+(z2-z1)**2)/(cellSize*0.4)
        );
        for (let i = 0; i <= steps; i++) {
            const t  = steps===0?0:i/steps;
            const wx = x1+(x2-x1)*t;
            const wz = z1+(z2-z1)*t;
            const c  = Math.floor((wx-minX)/cellSize);
            const r  = Math.floor((wz-minZ)/cellSize);
            if (r>=0&&r<rows&&c>=0&&c<cols)
                grid[r][c].walkable = false;
        }
    });

    return { grid, rows, cols, minX, minZ, maxX, maxZ, cellSize, floorY };
}

export function worldToCell(worldX, worldZ, gridData) {
    if (!gridData) return null;
    const { minX, minZ, cellSize, cols, rows } = gridData;
    const col = Math.floor((worldX - minX) / cellSize);
    const row = Math.floor((worldZ - minZ) / cellSize);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    return { col, row };
}

export function cellToWorld(col, row, gridData) {
    if (!gridData) return null;
    return {
        x: gridData.minX + (col + 0.5) * gridData.cellSize,
        z: gridData.minZ + (row + 0.5) * gridData.cellSize
    };
}

export function debugDrawGrid(scene, gridData, floorY = 0) {
    if (!scene || !gridData) return;
    removeDebugGrid(scene);

    const { grid, rows, cols, cellSize } = gridData;
    const group = new THREE.Group();
    group.name  = "debug-grid";

    const geo = new THREE.PlaneGeometry(cellSize * 0.9, cellSize * 0.9);
    const mat = new THREE.MeshBasicMaterial({
        color:0xff3333, transparent:true,
        opacity:0.6, side:THREE.DoubleSide, depthWrite:false
    });

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c].walkable) continue;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(grid[r][c].worldX, floorY+0.1, grid[r][c].worldZ);
            group.add(mesh);
        }
    }

    scene.add(group);
}

export function removeDebugGrid(scene) {
    if (!scene) return;
    const existing = scene.getObjectByName("debug-grid");
    if (existing) {
        existing.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(existing);
    }
}
