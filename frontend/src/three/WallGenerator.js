import * as THREE from "three";

const WALL_TAG = "tactical-wall";

let _cameraRef   = null;
let _controlsRef = null;

export function setCameraRef(camera, controls) {
    _cameraRef   = camera;
    _controlsRef = controls;
}

export function generateWalls(scene, walls, scale = 0.05, height = 3.0) {
    if (!scene || !walls || walls.length === 0) return;

    const mat = new THREE.MeshLambertMaterial({
        color: 0xb0bec5,
        side:  THREE.DoubleSide,
    });

    walls.forEach((wall, index) => {
        const x1 = wall.start[0] * scale;
        const z1 = wall.start[1] * scale;
        const x2 = wall.end[0]   * scale;
        const z2 = wall.end[1]   * scale;

        const dx     = x2 - x1;
        const dz     = z2 - z1;
        const length = Math.sqrt(dx * dx + dz * dz);

        if (length < 0.05) return;

        const geo  = new THREE.BoxGeometry(length, height, 0.15);
        const mesh = new THREE.Mesh(geo, mat.clone());

        mesh.position.set(
            (x1 + x2) / 2,
            height / 2,
            (z1 + z2) / 2
        );

        mesh.rotation.y = -Math.atan2(dz, dx);

        mesh.castShadow    = true;
        mesh.receiveShadow = true;

        mesh.userData.tag       = WALL_TAG;
        mesh.userData.wallIndex = index;
        mesh.userData.wallData  = wall;

        scene.add(mesh);
    });

    _fitFloor(scene, walls, scale);
}

export function clearWalls(scene) {
    if (!scene) return;
    const dead = [];
    scene.traverse(o => {
        if (o.userData?.tag === WALL_TAG) dead.push(o);
    });
    dead.forEach(o => {
        o.geometry?.dispose();
        o.material?.dispose();
        scene.remove(o);
    });
}

export function removeWallByIndex(scene, index) {
    if (!scene) return;
    let target = null;
    scene.traverse(o => {
        if (o.userData.tag === WALL_TAG && o.userData.wallIndex === index)
            target = o;
    });
    if (target) {
        target.geometry?.dispose();
        target.material?.dispose();
        scene.remove(target);
    }
}

export function getWallMeshes(scene) {
    const list = [];
    if (!scene) return list;
    scene.traverse(o => {
        if (o.userData?.tag === WALL_TAG) list.push(o);
    });
    return list;
}

export function getBuildingCenter(walls, scale) {
    if (!walls || walls.length === 0) {
        return { cx: 0, cz: 0, entryX: 0, entryZ: 5 };
    }

    let minX = Infinity,  maxX = -Infinity;
    let minZ = Infinity,  maxZ = -Infinity;

    walls.forEach(w => {
        const x1 = w.start[0] * scale, z1 = w.start[1] * scale;
        const x2 = w.end[0]   * scale, z2 = w.end[1]   * scale;
        minX = Math.min(minX, x1, x2);  maxX = Math.max(maxX, x1, x2);
        minZ = Math.min(minZ, z1, z2);  maxZ = Math.max(maxZ, z1, z2);
    });

    return {
        cx:     (minX + maxX) / 2,
        cz:     (minZ + maxZ) / 2,
        entryX: (minX + maxX) / 2,
        entryZ: maxZ + 2
    };
}

// ── PRIVATE ───────────────────────────────────────────────────

function _fitFloor(scene, walls, scale) {
    let minX = Infinity,  maxX = -Infinity;
    let minZ = Infinity,  maxZ = -Infinity;

    walls.forEach(w => {
        const x1 = w.start[0] * scale, z1 = w.start[1] * scale;
        const x2 = w.end[0]   * scale, z2 = w.end[1]   * scale;
        minX = Math.min(minX, x1, x2);  maxX = Math.max(maxX, x1, x2);
        minZ = Math.min(minZ, z1, z2);  maxZ = Math.max(maxZ, z1, z2);
    });

    const pad          = 4;
    const floorW       = (maxX - minX) + pad * 2;
    const floorD       = (maxZ - minZ) + pad * 2;
    const centerX      = (minX + maxX) / 2;
    const centerZ      = (minZ + maxZ) / 2;
    const buildingSize = Math.max(floorW, floorD);

    const floor = scene.getObjectByName("main-floor");
    if (floor) {
        floor.geometry.dispose();
        floor.geometry = new THREE.PlaneGeometry(floorW, floorD);
        floor.position.set(centerX, -0.01, centerZ);
    }

    if (_cameraRef) {
        const camDist = buildingSize * 1.0;
        _cameraRef.position.set(
            centerX,
            camDist * 0.7,
            centerZ + camDist
        );
        _cameraRef.lookAt(centerX, 0, centerZ);
    }

    if (_controlsRef) {
        _controlsRef.target.set(centerX, 0, centerZ);
        _controlsRef.update();
    }
}