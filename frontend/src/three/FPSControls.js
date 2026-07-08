import * as THREE from "three";

export function createFPSControls(camera, renderer, getWallMeshes) {
    let isLocked    = false;
    let yaw         = 0;
    let pitch       = 0;
    let currentFloorY = 0;   // ← tracks which floor Y we're on
    const keys      = {};

    const SPEED          = 0.12;
    const EYE_HEIGHT     = 1.7;
    const COLLISION_DIST = 0.5;

    // ── Pointer Lock & Mouse Look (Replaced with Click & Drag) ────────────────
    let isDragging = false;
    
    renderer.domElement.addEventListener("mousedown", (e) => {
        if (!isLocked) return;
        if (e.button === 0) isDragging = true;
    });

    renderer.domElement.addEventListener("mouseup", () => {
        isDragging = false;
    });

    renderer.domElement.addEventListener("mouseleave", () => {
        isDragging = false;
    });

    document.addEventListener("mousemove", (e) => {
        if (!isLocked || !isDragging) return;
        yaw   -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch  = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, pitch));
        camera.rotation.order = "YXZ";
        camera.rotation.y     = yaw;
        camera.rotation.x     = pitch;
    });

    // ── Keyboard ──────────────────────────────────────────────
    document.addEventListener("keydown", (e) => { keys[e.code] = true;  });
    document.addEventListener("keyup",   (e) => { keys[e.code] = false; });

    // ── Collision ─────────────────────────────────────────────
    const colRay = new THREE.Raycaster();

    function wouldCollide(from, direction) {
        colRay.set(from, direction.clone().normalize());
        colRay.far = COLLISION_DIST;
        const hits = colRay.intersectObjects(getWallMeshes(), false);
        return hits.length > 0;
    }

    // ── Update — called every frame ───────────────────────────
    function update() {
        if (!isLocked) return;

        const forward = new THREE.Vector3(
            -Math.sin(yaw), 0, -Math.cos(yaw)
        ).normalize();

        const right = new THREE.Vector3(
            Math.cos(yaw), 0, -Math.sin(yaw)
        ).normalize();

        const pos = camera.position;

        if (keys["KeyW"] && !wouldCollide(pos, forward))
            pos.addScaledVector(forward,  SPEED);
        if (keys["KeyS"] && !wouldCollide(pos, forward.clone().negate()))
            pos.addScaledVector(forward, -SPEED);
        if (keys["KeyA"] && !wouldCollide(pos, right.clone().negate()))
            pos.addScaledVector(right,   -SPEED);
        if (keys["KeyD"] && !wouldCollide(pos, right))
            pos.addScaledVector(right,    SPEED);

        // ← Lock Y to current floor's eye height, not always 1.7
        camera.position.y = currentFloorY + EYE_HEIGHT;
    }

    // ── Set which floor the player is on ──────────────────────
    // Call this whenever the active floor changes
    function setFloorY(floorY) {
        currentFloorY = floorY;
    }

    // ── Teleport to XZ position ───────────────────────────────
    function teleportTo(x, z, lookAtX, lookAtZ) {
        camera.position.set(x, currentFloorY + EYE_HEIGHT, z);
        yaw   = Math.atan2(-(lookAtX - x), -(lookAtZ - z));
        pitch = 0;
        camera.rotation.order = "YXZ";
        camera.rotation.y     = yaw;
        camera.rotation.x     = pitch;
    }

    // ── Teleport with explicit Y (multi-floor) ────────────────
    function teleportToWithY(x, y, z, lookAtX, lookAtZ) {
        // y here is floorY + EYE_HEIGHT, so derive floorY
        currentFloorY = y - EYE_HEIGHT;
        camera.position.set(x, y, z);
        yaw   = Math.atan2(-(lookAtX - x), -(lookAtZ - z));
        pitch = 0;
        camera.rotation.order = "YXZ";
        camera.rotation.y     = yaw;
        camera.rotation.x     = pitch;
    }

    function getIsLocked() { return isLocked; }

    function setFpsModeState(state) {
        if (state && !isLocked) {
            yaw = camera.rotation.y;
            pitch = camera.rotation.x || 0;
        }
        isLocked = state;
        isDragging = false;
    }

    return {
        update,
        getIsLocked,
        setFpsModeState,
        teleportTo,
        teleportToWithY,
        setFloorY
    };
}