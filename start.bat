@echo off
title Tactical Blueprint System
color 0B
cls

echo.
echo  ================================================
echo    TACTICAL BLUEPRINT SYSTEM
echo  ================================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python not found.
    echo  Install from https://python.org
    pause & exit /b 1
)

REM Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found.
    echo  Install from https://nodejs.org
    pause & exit /b 1
)

echo  Starting backend...
cd /d "%~dp0backend"

if not exist venv (
    echo  Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate

pip install -r requirements.txt -q

start cmd /k "cd /d %~dp0backend && venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 8000"

echo  Starting frontend...
cd /d "%~dp0frontend"

if not exist node_modules (
    echo  Installing npm packages...
    npm install
)

start cmd /k "cd /d %~dp0frontend && npm run dev"

echo  Waiting for services...
timeout /t 5 /nobreak >nul

start http://localhost:5173

echo.
echo  System running.
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo.
echo  Close the two terminal windows to stop.
pause
```

---

## Demo script — 5 minutes, practice 20 times
```
0:00  Double-click start.bat
      Browser opens automatically

0:30  Upload blueprint (use simple.png)
      "✓ 29 walls rendered"

1:00  Orbit the building — show top-down view
      "The system detected all walls automatically"

1:30  Click viewport → enter FPS
      WASD walk through building
      "Commander can walk through before troops enter"

2:00  ESC → orbit mode
      Set Exit Point (blue cylinder)
      Show Heatmap
      "Red zones are highest tactical risk"

2:45  Place Observer
      "Green = visible from this position
       Red = blind spots — enemy can hide here"

3:15  Set Start + End → Find Path
      "Optimal assault route calculated"

3:45  Pull ethernet cable
      Reload page — system still works
      "Fully offline — no internet required in the field"

4:15  Adjust heatmap weight sliders
      "Commander can tune risk parameters"

4:45  "Reduces briefing time from hours to minutes"