import * as THREE from "three";
import * as PF from "pathfinding";

const AGENT_TAG   = "agent-mesh";
const BASE_SPEED  = 0.04;

let _agents  = [];
let _scene   = null;
let _running = false;

// ── Crowd overlay group ───────────────────────────────────────
const CROWD_OVERLAY = "crowd-density-overlay";

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

export function startAgents(scene, gridData, exitCell, agentCount = 5) {
    stopAgents(scene);

    if (!gridData || !exitCell) {
        console.warn("AgentSimulation: missing gridData or exitCell");
        return;
    }

    _scene   = scene;
    _running = true;

    const { grid, rows, cols } = gridData;
    const floorY = gridData.floorY ?? 0;

    // ── Step 1: Init crowd tracking fields on every cell ──────
    // We ADD these fields to existing cell objects — not replace them
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            grid[r][c].agentCount  = 0;       // how many agents in this cell
            grid[r][c].occupied    = false;    // quick boolean check
            grid[r][c].dynamicCost = 0;        // extra A* cost from crowding
        }
    }

    // Collect walkable spawn positions
    const walkable = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            if (grid[r][c].walkable && !(grid[r][c].fireLevel ?? 0))
                walkable.push({ r, c });

    if (walkable.length < agentCount) {
        console.warn("AgentSimulation: not enough walkable cells");
        return;
    }

    const starts = _shuffle([...walkable]).slice(0, agentCount);

    const colors = [
        0x00ccff, 0x00ff88, 0xffcc00, 0xff66ff,
        0xff8800, 0x66ffcc, 0xff4444, 0x44ff44,
        0x4444ff, 0xffffff
    ];

    _agents = starts.map((start, i) => {
        const path = _computePath(gridData, start, exitCell);
        const cell = grid[start.r][start.c];
        if (!path.length) return null;

        const geo  = new THREE.SphereGeometry(0.22, 8, 8);
        const mat  = new THREE.MeshLambertMaterial({
            color: colors[i % colors.length]
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cell.worldX, floorY + 0.3, cell.worldZ);
        mesh.userData.tag         = AGENT_TAG;
        mesh.userData.baseColor   = colors[i % colors.length];
        mesh.userData.waitFrames  = 0;   // how many frames blocked
        scene.add(mesh);

        // Mark starting cell as occupied
        cell.agentCount++;
        cell.occupied = true;

        return {
            mesh,
            path,
            pathIndex:    0,
            gridData,
            exitCell,
            floorY,
            reached:      false,
            currentCell:  { r: start.r, c: start.c },
            waitFrames:   0    // frames blocked on current waypoint
        };
    }).filter(Boolean);
}

/**
 * updateAgents()
 * Called every frame from App.jsx animation loop.
 *
 * Frame order (critical — do not change sequence):
 *   1. Clear all occupancy counts
 *   2. Count agents per cell from current positions
 *   3. Update dynamicCost based on new counts
 *   4. Update crowd visual overlay
 *   5. Move each agent using density-adjusted speed
 */
export function updateAgents() {
    if (!_running || !_agents.length) return;

    // Pull gridData from first alive agent
    const sample = _agents.find(a => !a.reached);
    if (!sample) return;
    const { grid, rows, cols } = sample.gridData;

    // ── Step 1: Clear occupancy ───────────────────────────────
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            grid[r][c].agentCount  = 0;
            grid[r][c].occupied    = false;
            grid[r][c].dynamicCost = 0;
        }
    }

    // ── Step 2: Count agents per cell ─────────────────────────
    _agents.forEach(agent => {
        if (agent.reached) return;
        const { r, c } = agent.currentCell;
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
            grid[r][c].agentCount++;
            grid[r][c].occupied = grid[r][c].agentCount > 0;
        }
    });

    // ── Step 3: Update dynamicCost from density ───────────────
    // Cells with many agents get extra pathfinding cost
    // so A* routes future agents around congestion
    const DENSITY_THRESHOLD = 3;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const count = grid[r][c].agentCount;
            if (count >= DENSITY_THRESHOLD) {
                grid[r][c].dynamicCost = count * 2;
            }
        }
    }

    // ── Step 4: Update crowd visual overlay ───────────────────
    _updateCrowdOverlay(sample.gridData, sample.floorY);

    // ── Step 5: Move each agent ───────────────────────────────
    _agents.forEach(agent => {
        if (agent.reached) return;
        _moveAgent(agent, grid, rows, cols);
    });
}

export function stopAgents(scene) {
    _running = false;
    _agents  = [];

    if (!scene) return;

    // Remove agent meshes
    const dead = [];
    scene.traverse(o => {
        if (o.userData?.tag === AGENT_TAG) dead.push(o);
    });
    dead.forEach(o => {
        o.geometry?.dispose();
        o.material?.dispose();
        scene.remove(o);
    });

    // Remove crowd overlay
    const overlay = scene.getObjectByName(CROWD_OVERLAY);
    if (overlay) {
        overlay.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
        scene.remove(overlay);
    }
}

export function areAgentsRunning() {
    return _running && _agents.some(a => !a.reached);
}

// ─────────────────────────────────────────────────────────────
// PRIVATE — AGENT MOVEMENT
// ─────────────────────────────────────────────────────────────

function _moveAgent(agent, grid, rows, cols) {
    const entry = agent.path[agent.pathIndex];
    if (!entry) { agent.reached = true; return; }

    const [col, row] = entry;
    const cell = grid[row]?.[col];
    if (!cell) { agent.reached = true; return; }

    // Fire rerouting
    if ((cell.fireLevel ?? 0) > 0) {
        const newPath = _computePath(
            agent.gridData,
            agent.currentCell,
            agent.exitCell
        );
        if (newPath.length > 0) {
            agent.path      = newPath;
            agent.pathIndex = 0;
        } else {
            agent.reached = true;
        }
        return;
    }

    // ── Occupancy check — wait or reroute if blocked ──────────
    if (cell.occupied && cell.agentCount > 1) {
        agent.waitFrames++;

        // Wait up to 8 frames then reroute around congestion
        if (agent.waitFrames < 8) {
            return;   // just wait this frame
        }

        // Been waiting too long — recompute path with dynamicCosts active
        const newPath = _computePath(
            agent.gridData,
            agent.currentCell,
            agent.exitCell
        );
        if (newPath.length > 0 && newPath.length <= agent.path.length + 10) {
            agent.path      = newPath;
            agent.pathIndex = 0;
        }
        agent.waitFrames = 0;
        return;
    }

    agent.waitFrames = 0;

    // ── Density-based speed reduction ─────────────────────────
    // density = agents in current cell + immediate neighbours
    const density  = _getLocalDensity(agent.currentCell, grid, rows, cols);

    // Formula: speed = baseSpeed / (1 + density * 0.5)
    const speed    = BASE_SPEED / (1 + density * 0.5);

    const target   = new THREE.Vector3(
        cell.worldX,
        agent.floorY + 0.3,
        cell.worldZ
    );
    const current  = agent.mesh.position;
    const dist     = current.distanceTo(target);

    if (dist < speed + 0.05) {
        agent.mesh.position.copy(target);

        // Update current cell tracker
        agent.currentCell = { r: row, c: col };
        agent.pathIndex++;

        if (agent.pathIndex >= agent.path.length) {
            agent.reached = true;
            agent.mesh.material.color.set(0xffffff);
        }
    } else {
        const dir = target.clone().sub(current).normalize();
        agent.mesh.position.addScaledVector(dir, speed);
        agent.mesh.lookAt(target);
    }
}

// ─────────────────────────────────────────────────────────────
// PRIVATE — CROWD VISUAL OVERLAY
// ─────────────────────────────────────────────────────────────

function _updateCrowdOverlay(gridData, floorY) {
    if (!_scene) return;

    const { grid, rows, cols, cellSize } = gridData;

    // Remove old overlay
    const old = _scene.getObjectByName(CROWD_OVERLAY);
    if (old) {
        old.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        });
        _scene.remove(old);
    }

    const group = new THREE.Group();
    group.name  = CROWD_OVERLAY;

    // Only draw cells with at least 1 agent
    // Color scale: 1 agent = faint yellow, 3+ = orange, 5+ = red
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell  = grid[r][c];
            const count = cell.agentCount ?? 0;
            if (count === 0) continue;

            // Color lerp: yellow → orange → red
            const t     = Math.min(1, (count - 1) / 4);  // 0 at 1 agent, 1 at 5+ agents
            const color = new THREE.Color(0xffff00)
                .lerp(new THREE.Color(0xff2200), t);

            const geo = new THREE.PlaneGeometry(
                cellSize * 0.75, cellSize * 0.75
            );
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity:     0.25 + t * 0.35,   // more opaque when denser
                side:        THREE.DoubleSide,
                depthWrite:  false
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(cell.worldX, floorY + 0.11, cell.worldZ);
            group.add(mesh);
        }
    }

    _scene.add(group);
}

// ─────────────────────────────────────────────────────────────
// PRIVATE — PATHFINDING
// ─────────────────────────────────────────────────────────────

function _computePath(gridData, start, exitCell) {
    const { grid, cols, rows } = gridData;

    const pfGrid = new PF.Grid(cols, rows);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];

            // Block walls and fire
            if (!cell.walkable || (cell.fireLevel ?? 0) > 3) {
                pfGrid.setWalkableAt(c, r, false);
                continue;
            }

            // ── Bottleneck cost injection ─────────────────────
            // finalCost = baseCost(1) + risk + dynamicCost
            // pathfinding.js doesn't expose per-cell weights directly
            // but we can mark very congested cells as unwalkable
            // when density is extreme (>5 agents) and there is an alternative
            if ((cell.dynamicCost ?? 0) > 10 && (cell.agentCount ?? 0) > 5) {
                pfGrid.setWalkableAt(c, r, false);
            }
        }
    }

    const sc = _nearestWalkable(start.c,       start.r,       grid, cols, rows);
    const ec = _nearestWalkable(exitCell.col,   exitCell.row,  grid, cols, rows);
    if (!sc || !ec) return [];

    const finder = new (PF.AStarFinder || PF.default.AStarFinder)({ allowDiagonal: false });
    return finder.findPath(sc.c, sc.r, ec.c, ec.r, pfGrid);
}

// ─────────────────────────────────────────────────────────────
// PRIVATE — HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Local density = agents in current cell + 4 immediate neighbours.
 * Used for speed formula. Max meaningful value is around 5-8.
 */
function _getLocalDensity(currentCell, grid, rows, cols) {
    const { r, c } = currentCell;
    let count = 0;

    [[0,0],[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            count += grid[nr][nc].agentCount ?? 0;
        }
    });

    return count;
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

function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}