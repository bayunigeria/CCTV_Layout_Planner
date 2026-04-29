# CAMS — CCTV Layout Planner

A lightweight intranet web application for planning and monitoring CCTV camera placements across multiple floors or areas. Built with Node.js + Express, no database required.

---

## Features

| Feature | Description |
|---|---|
| Multi-layout management | Manage multiple floors or areas in one project |
| Camera point placement | Right-click on the layout to add a camera node |
| Pan navigation | Left-click drag to pan/navigate across the layout |
| Live search with canvas highlight | Type a camera name to filter the list and highlight matching markers on the canvas |
| Camera details | Label, direction (angle), local IP, notes, preview image |
| Live ping monitoring | Per-camera IP reachability with color status (green/red/amber) |
| JSON export / import | Full backup and migration support |
| PNG export | Static image export with camera overlays for reporting |
| Display-only view | Read-only NOC/monitoring screen at `/display` |

---

## Quick Start (Development)

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
http://localhost:8080
```

---

## Installation (End Users — Windows)

For end users who do not have Node.js installed, use the provided installer:

1. Download or clone this repository
2. Double-click **`install.bat`**
3. The installer will:
   - Check and install Node.js LTS if not already present
   - Install all required packages
   - Create a `start-cams.bat` shortcut in the project folder
4. After installation, double-click **`start-cams.bat`** to launch the server
5. Open your browser and go to `http://localhost:8080`

> The server runs locally on port `8080` by default. It is accessible to other devices on the same network via `http://<your-ip>:8080`.

---

## Configuration

Set environment variables before starting:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Server port |
| `HOST` | `0.0.0.0` | Bind address (`0.0.0.0` = all interfaces) |

**Example:**
```bash
PORT=9000 npm start
```

On Windows (batch):
```batch
set PORT=9000
node server.js
```

---

## Usage Guide

### Adding Camera Nodes
- Upload a floor layout image via **Upload Layout**
- **Right-click** anywhere on the layout image to open the _"Add Node Here?"_ context menu
- Click **Add Node** to place a camera marker at that position

### Navigating the Canvas
- **Left-click drag** on the canvas to pan/move the view
- **Double-click** on the canvas to reset the view to default position

### Searching for Cameras
- Type in the **Search by label** input box in the Camera Points panel
- The list filters instantly (live search — no button required)
- Matching markers **glow green** on the canvas; non-matching markers are dimmed

### Moving a Camera
- **Click and drag** any marker to reposition it

### Live Ping Monitoring
1. Fill in the **Local IP Address** field for each camera
2. Click **Start Monitoring** in the Camera Points panel
3. Markers and list items update color in real time:
   - **Green** = reachable (TTL reply received)
   - **Red** = unreachable (RTO)
   - **Amber blinking** = checking

### Display-Only View
- Open `/display` or `/display?layoutId=<id>` for a read-only monitoring screen
- Suitable for NOC wallboards and supervisor screens

---

## Project Structure

```
CAMS/
├── server.js           # Express backend + API
├── app.js              # Main planner client (JS)
├── index.html          # Main planner UI
├── styles.css          # Main planner styles
├── display.html        # Read-only monitoring view
├── preview.html        # Camera preview helper page
├── install.bat         # Windows installer (run once)
├── start-cams.bat      # Launch script (created by installer)
├── package.json
├── data/
│   └── plan.json       # Persisted layout & camera data
├── uploads/            # Uploaded layout & preview images
└── docs/
    ├── USER_GUIDE.md
    └── TECHNICAL_DOCUMENTATION.md
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/plan` | Retrieve current plan |
| `PUT` | `/api/plan` | Save plan |
| `POST` | `/api/upload` | Upload image (max 8 MB, JPEG/PNG/WEBP) |
| `GET` | `/api/ping-live?layoutId=<id>` | SSE stream of live ping results |
| `GET` | `/display` | Display-only view |

---

## Changelog

### v3.0.0
- Right-click context menu to add camera nodes (replaces accidental left-click add)
- Left-click drag for canvas pan/navigation
- Double-click to reset pan to origin
- Live search now highlights matching markers on the canvas with glow effect; non-matching markers dimmed
- `renderMarkers()` now responds to search state changes

### v2.0.0
- Live IP ping monitoring via Server-Sent Events
- Per-camera color status (alive/dead/pending)
- Display-only page (`/display`) for NOC screens
- Multi-layout support

### v1.0.0
- Initial CCTV layout planner
- Camera point placement, editing, drag-and-drop
- JSON and PNG export/import

---

## Requirements

- Node.js 18 or later
- Windows / Linux / macOS
- Modern browser (Chrome, Edge, Firefox)
- Network access from server host to camera IPs (for ping monitoring)

---

## License

Private / Internal Use
