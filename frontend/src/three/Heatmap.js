import * as THREE from "three";

const HEATMAP_NAME = "risk-heatmap";

export function computeHeatmap(gridData, exitCells = [], weights = {}) {
    if (!gridData) return;

    const { wBlind = 5, wDist = 2, wCorner = 3 } = weights;
    const { grid, rows, cols } = gridData;

    const dist = Array.from({ length: rows }, () =>
        Array(cols).fill(Infinity)
    );

    const queue = [];

    exitCells.forEach(({ col, row }) => {
        if (
            row >= 0 && row < rows &&
            col >= 0 && col < cols &&
            grid[row][col].walkable
        ) {
            dist[row][col] = 0;
            queue.push({ row, col });
        }
    });

    let head = 0;
    while (head < queue.length) {
        const { row, col } = queue[head++];
        const neighbors = [
            [row - 1, col],
            [row + 1, col],
            [row, col - 1],
            [row, col + 1]
        ];
        neighbors.forEach(([nr, nc]) => {
            if (
                nr >= 0 && nr < rows &&
                nc >= 0 && nc < cols &&
                grid[nr][nc].walkable &&
                dist[nr][nc] === Infinity
            ) {
                dist[nr][nc] = dist[row][col] + 1;
                queue.push({ row: nr, col: nc });
            }
        });
    }

    let maxDist = 1;
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            if (dist[r][c] !== Infinity)
                maxDist = Math.max(maxDist, dist[r][c]);

    const adjWallCount = (r, c) => {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        return dirs.filter(([dr, dc]) => {
            const nr = r + dr, nc = c + dc;
            return (
                nr >= 0 && nr < rows &&
                nc >= 0 && nc < cols &&
                !grid[nr][nc].walkable
            );
        }).length;
    };

    let maxRisk = 0;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (!cell.walkable) {
                cell.risk = 0;
                continue;
            }

            const blind  = cell.visible ? 0 : 1;
            const normD  = dist[r][c] === Infinity
                ? 1
                : dist[r][c] / maxDist;
            const corner = adjWallCount(r, c) >= 2 ? 1 : 0;

            cell.risk = wBlind * blind + wDist * normD + wCorner * corner;
            if (cell.risk > maxRisk) maxRisk = cell.risk;
        }
    }

    if (maxRisk > 0) {
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++)
                grid[r][c].risk = grid[r][c].risk / maxRisk;
    }
}

export function renderHeatmap(scene, gridData, floorY = 0) {
    removeHeatmap(scene);
    if (!gridData) return;

    const { grid, rows, cols, cellSize } = gridData;

    const group = new THREE.Group();
    group.name  = HEATMAP_NAME;

    const green  = new THREE.Color(0x27ae60);
    const yellow = new THREE.Color(0xf1c40f);
    const red    = new THREE.Color(0xc0392b);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (!cell.walkable) continue;

            const risk = Math.max(0, Math.min(1, cell.risk));

            let color;
            if (risk < 0.5) {
                color = green.clone().lerp(yellow, risk * 2);
            } else {
                color = yellow.clone().lerp(red, (risk - 0.5) * 2);
            }

            const geo = new THREE.PlaneGeometry(
                cellSize * 0.88,
                cellSize * 0.88
            );
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity:     0.6,
                side:        THREE.DoubleSide,
                depthWrite:  false
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(cell.worldX, floorY + 0.09, cell.worldZ);
            group.add(mesh);
        }
    }

    scene.add(group);
}

export function removeHeatmap(scene) {
    if (!scene) return;
    const existing = scene.getObjectByName(HEATMAP_NAME);
    if (existing) {
        existing.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(existing);
    }
}