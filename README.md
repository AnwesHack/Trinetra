
# Tactical Blueprint Intelligence System

A browser-based tactical analysis platform that converts 2D building blueprints into interactive 3D environments with real-time intelligence overlays. Built for defence and security operations — works completely offline after initial setup.

![System Preview](docs/preview.png)

---

## Features

- **2D → 3D Conversion** — Upload any floor plan PNG/JPG and get an interactive 3D building instantly
- **First-Person Walkthrough** — WASD navigation inside the building at eye level
- **Multi-Floor Support** — Upload separate blueprints per floor, stacked vertically in 3D
- **A\* Pathfinding** — Click two points, get the optimal route avoiding all walls
- **Blind Spot Detection** — Raycasting visibility analysis from any observer position
- **Dynamic Risk Heatmap** — Real-time green→yellow→red risk overlay, updates as conditions change
- **Fire Spread Simulation** — Grid-based hazard propagation, heatmap updates live
- **Multi-Agent Evacuation** — Spawn agents that navigate to exits, reroute around fire
- **Blueprint Splitter** — Crop sub-regions from combined multi-floor drawings
- **QR Sync** — Offline phone viewer via local WiFi QR code, no internet needed
- **Correction Tools** — Remove phantom walls detected by OpenCV
- **Fully Offline** — No cloud, no internet required after first setup

---

## Tech Stack

| Layer | Technology |
|---|---|
| Computer Vision | Python 3.11 + OpenCV |
| Backend API | FastAPI + Uvicorn |
| 3D Engine | Three.js r167 |
| Frontend | React 18 + Vite |
| Pathfinding | pathfinding.js |
| Offline Maps | Leaflet + leaflet.offline |
| QR Generation | qrcode (npm) |

---

## Prerequisites

Install these before anything else.

| Tool | Version | Download |
|---|---|---|
| Python | 3.11.x | https://python.org/downloads |
| Node.js | 20 LTS | https://nodejs.org |
| Git | Latest | https://git-scm.com/download/win |

> **Windows users:** During Python install, check **"Add Python to PATH"**.
> During Node install, use all defaults.

---

## Project Structure

```
tactical-system/
├── backend/
│   ├── venv/                      # Python virtual environment (auto-created)
│   ├── cv/
│   │   ├── __init__.py
│   │   └── blueprint_processor.py # OpenCV wall detection
│   ├── main.py                    # FastAPI server
│   ├── viewer.html                # Mobile QR viewer
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── api/api.js             # Backend API calls
│       ├── components/
│       │   ├── Upload.jsx
│       │   ├── Controls.jsx
│       │   ├── CorrectionTools.jsx
│       │   ├── BlueprintSplitter.jsx
│       │   ├── TacticalOverlay.jsx
│       │   └── QRSync.jsx
│       ├── three/
│       │   ├── Scene.js           # Three.js scene + camera
│       │   ├── WallGenerator.js   # 2D walls → 3D boxes
│       │   ├── FPSControls.js     # WASD first-person camera
│       │   ├── FloorManager.js    # Multi-floor stacking
│       │   ├── GridSystem.js      # 2D occupancy grid
│       │   ├── Pathfinding.js     # A* implementation
│       │   ├── Visibility.js      # Raycasting blind spots
│       │   ├── Heatmap.js         # Risk color overlay
│       │   ├── FireSimulation.js  # Grid-based fire spread
│       │   └── AgentSimulation.js # Multi-agent movement
│       ├── utils/
│       │   └── SyncManager.js     # QR serialization
│       └── App.jsx                # Root component
│
├── test-blueprints/               # Put test PNG files here
├── start.bat                      # Windows one-click launcher
└── README.md
```

---

## Setup & Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/tactical-system.git
cd tactical-system
```

### Step 2 — Backend setup

```bash
cd backend

# Create Python virtual environment
python -m venv venv

# Activate it (Windows)
venv\Scripts\activate

# Install packages
pip install -r requirements.txt
```

### Step 3 — Frontend setup

```bash
cd ../frontend

# Install npm packages
npm install
```

### Step 4 — Run the system

**Option A — One click (Windows)**
```
Double-click start.bat in the root folder
```

**Option B — Manual (two terminals)**

Terminal 1 — Backend:
```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

Terminal 2 — Frontend:
```bash
cd frontend
npm run dev
```

Open browser: **http://localhost:5173**

---

## How to Use

### Basic workflow

```
1. Open http://localhost:5173
2. Under "Multi-Floor Blueprint" → click "Upload Floor 0"
3. Choose a PNG/JPG blueprint image
4. Walls detect and render as 3D boxes automatically
5. Adjust Scale slider until building looks correct
6. Click the 3D viewport to enter FPS mode (WASD to walk)
7. Press ESC to return to orbit mode
```

### Pathfinding

```
1. Click "1. Set Start" → click the floor inside a room
2. Click "2. Set End" → click another room
3. Click "3. Find Path" → green route appears
```

### Risk Heatmap

```
1. Click "1. Set Exit Point" → click near a door
2. Click "Place Observer" → click inside the building
3. Click "2. Show Heatmap" → red/yellow/green overlay appears
4. Adjust weight sliders to change risk priorities
```

### Fire Simulation

```
1. Click "Set Fire Origin" → click anywhere on the floor
2. Fire spreads automatically every 0.6 seconds
3. Heatmap updates live as fire spreads
4. Agents automatically reroute around burning cells
5. Click "Stop Fire" to clear
```

### Multi-Agent Evacuation

```
1. Set an Exit Point first (required)
2. Set agent count with slider
3. Click "Start Agents"
4. Coloured spheres navigate toward exit using A*
5. They slow in crowded areas, reroute around fire
6. White = agent reached exit
```

### Multi-Floor Buildings

```
1. Upload Floor 0 → ground level renders
2. Upload Floor 1 → stacks 12 units above
3. Click F0/F1 buttons to switch between floors
4. Click "View: All Stacked" to see all floors simultaneously
5. All analysis tools work per-floor independently
```

### QR Sync (Offline Phone Viewer)

```
1. Upload your blueprint
2. Connect phone to the same WiFi as your laptop
3. Click "Generate QR Sync" in the sidebar
4. Scan the QR code with your phone camera
5. 3D model opens in phone browser — no internet needed
```

### Blueprint Splitter

```
For blueprints with multiple floors in one image:
1. Open Blueprint Splitter section
2. Upload the combined image
3. Draw a box around Floor 0 region → "Use as Floor 0"
4. Draw a box around Floor 1 region → "Use as Floor 1"
5. Each crop uploads and processes automatically
```

---

## CV Tuning Guide

If wall detection gives too many or too few walls, edit `backend/cv/blueprint_processor.py`:

```python
lines = cv2.HoughLinesP(
    edges,
    rho=1,
    theta=np.pi / 180,
    threshold=100,      # Raise → fewer lines. Lower → more lines
    minLineLength=50,   # Raise → ignore short noise lines
    maxLineGap=12
)
```

| Problem | Fix |
|---|---|
| 500+ walls detected | Raise threshold to 150, minLineLength to 80 |
| 0 walls detected | Lower threshold to 50, minLineLength to 25 |
| Blurry scanned blueprint | Change GaussianBlur kernel from (5,5) to (7,7) |

Use the debug endpoint to visualise what OpenCV detects:
```
1. POST your blueprint to: http://localhost:8000/debug-blueprint
2. Open: http://localhost:8000/debug-image
3. Red lines = detected walls
```

---

## Offline Operation

The system is fully offline after initial setup. No data is sent externally.

For QR phone sync — both devices must be on the **same local WiFi network**
(a router with no internet is sufficient). If scanning the QR gives a connection
error, run this in an Administrator Command Prompt:

```bash
netsh advfirewall firewall add rule name="FastAPI 8000" dir=in action=allow protocol=TCP localport=8000
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError` | venv not activated | Run `venv\Scripts\activate` first |
| CORS error in browser | Middleware order wrong | Ensure `app.add_middleware()` is before all `@app` routes |
| Blank 3D viewport | Scene creation failed | Check browser console (F12) for errors |
| `0 walls detected` | CV thresholds too strict | Lower threshold and minLineLength |
| Agents not moving | `updateAgents()` not in loop | Check App.jsx animation loop calls `updateAgents()` |
| QR shows blank on phone | Wrong IP or firewall | Open firewall port 8000, verify phone on same WiFi |
| White screen on load | Missing export in a module | Check browser console for exact missing export name |

---

## Environment Variables

None required. All configuration is done via the UI sliders and the CV tuning guide above.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch strategy and pull request guidelines.

---

## License

This project is for academic and research purposes.



