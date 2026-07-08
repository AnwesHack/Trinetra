import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function createScene(container) {
    if (!container) {
        console.error("Scene.js: container is null");
        return null;
    }

    // ── Scene ─────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.fog = new THREE.FogExp2(0x0d1117, 0.015);

    // ── Camera ────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
        70,
        container.clientWidth / container.clientHeight,
        0.1,
        500
    );
    camera.position.set(0, 18, 28);
    camera.lookAt(0, 0, 0);

    // ── Renderer ──────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // ── Lights ────────────────────────────────────────────────no
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(25, 50, 25);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width  = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near   = 0.5;
    dirLight.shadow.camera.far    = 200;
    dirLight.shadow.camera.left   = -60;
    dirLight.shadow.camera.right  =  60;
    dirLight.shadow.camera.top    =  60;
    dirLight.shadow.camera.bottom = -60;
    scene.add(dirLight);

    const fill = new THREE.DirectionalLight(0x4466aa, 0.3);
    fill.position.set(-10, -5, -10);
    scene.add(fill);

    // ── Floor ─────────────────────────────────────────────────
    const floorGeo = new THREE.PlaneGeometry(300, 300);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x0a0c10 });
    const floor    = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x    = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.position.y    = -2.0; // Moved down significantly
    floor.name          = "main-floor";
    scene.add(floor);

    // ── Grid ──────────────────────────────────────────────────
    const grid = new THREE.GridHelper(200, 50, 0x1f2937, 0x111827);
    grid.position.y = -1.99; // Placed slightly above the floor
    scene.add(grid);

    // ── OrbitControls (replaced by FPSControls on Day 6) ──────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minDistance   = 2;
    controls.maxDistance   = 150;

    // ── Resize ────────────────────────────────────────────────
    const onResize = () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // ── Cleanup ───────────────────────────────────────────────
    const cleanup = () => {
        window.removeEventListener("resize", onResize);
        controls.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
        }
    };

    return { scene, camera, renderer, controls, cleanup };
}