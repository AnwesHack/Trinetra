import * as THREE from "three";

const OVERLAY_NAME = "visibility-overlay";
const RAY_COUNT    = 360;
const MAX_RANGE    = 30;

export function computeVisibility(scene, observerPos, gridData) {
    if (!gridData || !scene) return;

    const { grid, rows, cols, cellSize, minX, minZ } = gridData;

    const walls = [];
    scene.traverse(o => {
        if (
            o.isMesh && (
                o.userData?.tag === "tactical-wall" ||
                o.userData?.tag === "floor-wall"
            )
        ) walls.push(o);
    });

    const origin = new THREE.Vector3(
        observerPos.x,
        observerPos.y + 1.7,
        observerPos.z
    );

    const raycaster = new THREE.Raycaster();

    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            grid[r][c].visible = false;

    for (let i = 0; i < RAY_COUNT; i++) {
        const angle = (i / RAY_COUNT) * Math.PI * 2;
        const dir   = new THREE.Vector3(
            Math.cos(angle),
            0,
            Math.sin(angle)
        ).normalize();

        raycaster.set(origin, dir);
        raycaster.far = MAX_RANGE;

        const hits    = raycaster.intersectObjects(walls, false);
        const maxDist = hits.length > 0 ? hits[0].distance : MAX_RANGE;

        const steps = Math.ceil(maxDist / (cellSize * 0.5));
        for (let s = 0; s <= steps; s++) {
            const dist = (s / steps) * maxDist;
            const wx   = origin.x + dir.x * dist;
            const wz   = origin.z + dir.z * dist;
            const col  = Math.floor((wx - minX) / cellSize);
            const row  = Math.floor((wz - minZ) / cellSize);
            if (row >= 0 && row < rows && col >= 0 && col < cols) {
                grid[row][col].visible = true;
            }
        }
    }
}

export function renderVisibilityOverlay(scene, gridData, floorY = 0) {
    removeVisibilityOverlay(scene);
    if (!gridData) return;

    const { grid, rows, cols, cellSize } = gridData;

    const group = new THREE.Group();
    group.name  = OVERLAY_NAME;

    const geoVis   = new THREE.PlaneGeometry(cellSize * 0.88, cellSize * 0.88);
    const geoBlind = new THREE.PlaneGeometry(cellSize * 0.88, cellSize * 0.88);

    const matVis = new THREE.MeshBasicMaterial({
        color:       0x00aa55,
        transparent: true,
        opacity:     0.25,
        side:        THREE.DoubleSide,
        depthWrite:  false
    });
    const matBlind = new THREE.MeshBasicMaterial({
        color:       0xcc2222,
        transparent: true,
        opacity:     0.55,
        side:        THREE.DoubleSide,
        depthWrite:  false
    });

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (!cell.walkable) continue;

            const mesh = new THREE.Mesh(
                cell.visible ? geoVis  : geoBlind,
                cell.visible ? matVis  : matBlind
            );
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(cell.worldX, floorY + 0.08, cell.worldZ);
            group.add(mesh);
        }
    }

    scene.add(group);
}

export function removeVisibilityOverlay(scene) {
    if (!scene) return;
    const existing = scene.getObjectByName(OVERLAY_NAME);
    if (existing) {
        existing.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        scene.remove(existing);
    }
}

export function placeObserverMarker(scene, position) {
    removeObserverMarker(scene);

    const geo  = new THREE.SphereGeometry(0.25, 12, 12);
    const mat  = new THREE.MeshLambertMaterial({ color: 0xffff00 });
    const mesh = new THREE.Mesh(geo, mat);

    mesh.position.set(position.x, position.y + 1.7, position.z);
    mesh.name = "observer-marker";
    scene.add(mesh);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(position.x, position.y,       position.z),
        new THREE.Vector3(position.x, position.y + 1.7, position.z)
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffff00 });
    const line    = new THREE.Line(lineGeo, lineMat);
    line.name     = "observer-line";
    scene.add(line);
}

export function removeObserverMarker(scene) {
    if (!scene) return;
    ["observer-marker", "observer-line"].forEach(name => {
        const obj = scene.getObjectByName(name);
        if (obj) {
            obj.geometry?.dispose();
            obj.material?.dispose();
            scene.remove(obj);
        }
    });
}