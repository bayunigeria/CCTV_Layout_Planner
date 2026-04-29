# CAMS CCTV Layout Planner — Technical Documentation

## 1. System Overview

CAMS is a Node.js + Express intranet web application for CCTV floor planning and live IP reachability visualization.

Core characteristics:
- Single-server deployment model
- File-based persistence (JSON + uploaded files)
- Browser-based UI (no frontend framework, no build step)
- Live ping status via Server-Sent Events (SSE)
- Multi-layout model with backward compatibility for legacy single-layout data

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Backend | Express 4.x |
| Upload handling | Multer |
| Plan storage | JSON file (`data/plan.json`) |
| Image storage | Filesystem (`uploads/`) |
| Frontend | Vanilla JS + HTML/CSS |
| Real-time | Server-Sent Events (EventSource) |

---

## 3. High-Level Architecture

```
Browser (Main UI)
  ├── GET /api/plan          → load plan
  ├── PUT /api/plan          → save plan (debounced 220 ms)
  ├── POST /api/upload        → upload image
  └── GET /api/ping-live     → SSE stream (per layout)

Browser (Display UI)
  ├── GET /api/plan          → load plan
  └── GET /api/ping-live     → SSE stream (per layout)

Server (server.js)
  ├── Express HTTP + static file serving
  ├── Plan read/write with sanitization
  ├── Multer image upload
  └── Ping engine (child_process exec)
```

---

## 4. Component Responsibilities

### 4.1 Backend (`server.js`)
- Serve static assets and routes
- Read/write plan JSON with full sanitization on both read and write
- Handle image uploads (MIME check, size limit, UUID-based filename)
- Emit SSE ping events for a specific layout
- Auto-create `data/` and `uploads/` directories on first run
- Auto-create default `data/plan.json` if not present

### 4.2 Main Frontend (`index.html`, `app.js`, `styles.css`)
- Layout and camera CRUD operations
- Canvas pan navigation (left-click drag)
- Right-click context menu for adding camera nodes
- Drag-and-drop marker repositioning
- Live search with canvas marker highlighting
- JSON import/export and PNG export
- Trigger and consume live ping monitoring via SSE

### 4.3 Display Frontend (`display.html`)
- Read-only rendering of layout and camera status
- SSE-based live status updates
- Layout tabs and URL-based layout selection (`?layoutId=<id>`)

---

## 5. Data Model

### 5.1 Current Plan Schema

```json
{
  "layouts": [
    {
      "id": 1,
      "name": "Floor 1",
      "layoutDataUrl": "/uploads/layout.png",
      "cameras": [
        {
          "id": 1,
          "name": "CAM-01",
          "x": 45.7,
          "y": 31.2,
          "angle": 90,
          "note": "Lobby view",
          "preview": "/uploads/preview.png",
          "ip": "192.168.1.10"
        }
      ],
      "selectedId": 1,
      "nextId": 2,
      "cameraSearch": ""
    }
  ],
  "selectedLayoutId": 1
}
```

### 5.2 Coordinate System

Camera positions (`x`, `y`) are stored as percentages (0–100) of the layout image dimensions. This makes positions resolution-independent and portable across different screen sizes.

### 5.3 Persistence Characteristics

| Data | Persisted |
|---|---|
| Layouts, cameras, positions, angles, notes | Yes (`data/plan.json`) |
| Uploaded images | Yes (`uploads/`) |
| Live ping status | No (session-only, never written to disk) |
| Canvas pan state | No (resets on page reload / layout switch) |
| Search query | Yes (stored per layout in `cameraSearch` field) |

---

## 6. API Specifications

### 6.1 `GET /api/plan`
- **Purpose:** Retrieve the sanitized plan payload
- **Response:** JSON object (current schema)

### 6.2 `PUT /api/plan`
- **Purpose:** Save the plan payload
- **Body:** Plan JSON
- **Behavior:** Full sanitization applied before write to `data/plan.json`

### 6.3 `POST /api/upload`
- **Purpose:** Upload a layout image or camera preview
- **Constraints:** MIME types: `image/jpeg`, `image/png`, `image/webp`; max 8 MB
- **Response:** `{ ok, path, filename }`
- **Storage:** `uploads/<timestamp>-<uuid>.<ext>`

### 6.4 `GET /api/ping-live?layoutId=<id>`
- **Purpose:** Stream live ping results for one layout
- **Protocol:** Server-Sent Events (`text/event-stream`)
- **Cycle:** ~1.5 s per full layout ping round
- **Active event:**
  ```json
  { "layoutId": 2, "id": 12, "alive": true }
  ```
- **Idle event (no cameras with IP):**
  ```json
  { "type": "idle", "layoutId": 2 }
  ```

### 6.5 `GET /display`
- **Purpose:** Serve the display-only monitoring view

---

## 7. Frontend Architecture Details

### 7.1 Canvas Pan System

The canvas uses a two-layer DOM structure inside `#stage`:

```
#stage (overflow: hidden, position: relative)
└── #emptyState (absolute, outside viewport — not affected by pan)
└── #viewport  (absolute, inset: 0, will-change: transform)
    ├── #layoutImage (width: 100%)
    └── #markerLayer (absolute, inset: 0)
        └── .marker (absolute, left: X%, top: Y%)
```

Pan is applied as a CSS `transform: translate(panX, panY)` on `#viewport`. This moves both the image and all markers together without affecting layout reflow.

**Coordinate conversion** (screen → image percentage):
```js
x = ((clientX - stageRect.left - panX) / stageRect.width) * 100
y = ((clientY - stageRect.top  - panY) / stageRect.height) * 100
```

This formula is used in both the right-click node placement and drag-repositioning handlers.

Pan state resets (`panX = panY = 0`) on:
- Layout switch
- JSON import
- Reset (clear all)
- Double-click on canvas

### 7.2 Right-Click Context Menu

- `contextmenu` event on `#stage` is intercepted with `preventDefault()`
- A custom `#ctxMenu` div is positioned at `(clientX + 4, clientY + 4)`, clamped to viewport bounds
- The camera percentage coordinates are pre-computed at right-click time and stored in `_ctxMenuPos`
- Clicking **Add Node** calls `addCamera(_ctxMenuPos.x, _ctxMenuPos.y)` then hides the menu
- Menu closes on: Cancel button, Escape key, or click outside

### 7.3 Live Search + Canvas Highlight

The search query is stored per-layout in `layout.cameraSearch`. On every search input event:
1. `renderCameraList()` — filters the sidebar list
2. `renderMarkers()` — rebuilds all markers with search classes:
   - `.search-match` — `filter: drop-shadow(...)` green glow
   - `.search-dim` — `opacity: 0.25`
   - No class when search is empty (all markers normal)

### 7.4 Save Debounce

All mutations schedule a save via `scheduleSave()`, which debounces at 220 ms. Saves are queued: if a save is in flight when another is requested, a retry flag (`_saveAgain`) ensures no data is lost. Falls back to `localStorage` if the server is unreachable.

---

## 8. Ping Processing Lifecycle

1. Browser opens SSE connection to `/api/ping-live?layoutId=<id>`
2. Server reads `data/plan.json` and resolves the target layout
3. Cameras with valid IPv4 are pinged concurrently via `child_process.exec`
4. Ping output is parsed for the `TTL=` pattern
5. Each result is streamed as an SSE event: `{ layoutId, id, alive }`
6. Cycle repeats every ~1.5 seconds while the connection is open
7. On `req.close`, the active flag is cleared and the cycle stops

---

## 9. Security and Operational Notes

- Application is designed for **intranet use only**
- Upload MIME restriction and file size limit are enforced server-side
- No authentication layer by default — protect via network ACL or reverse proxy
- `uploads/` is statically served; apply OS-level monitoring per IT policy
- No encryption at rest in current architecture

---

## 10. Performance Considerations

- Ping workload scales with the number of cameras in the monitored layout
- Multiple simultaneous SSE clients (display screens) multiply ping load
- File-based JSON persistence is sufficient for typical floor plans (tens to low hundreds of cameras)

---

## 11. Compatibility and Legacy

- Legacy single-layout payload is auto-transformed to multi-layout format on read
- Default floor naming convention is `Floor <n>`
- Session-only ping status is intentionally non-persistent by design

---

## 12. Deployment

### 12.1 Startup

```bash
npm install
npm start
```

### 12.2 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | TCP port to listen on |
| `HOST` | `0.0.0.0` | Bind address |

### 12.3 Windows Service (Persistent Across Session Disconnects)

Use Task Scheduler with the following action:

```
Program:  node.exe
Arguments: server.js
Start in: C:\path\to\CAMS
```

Or use the generated `start-cams.bat` for manual startup.

### 12.4 Windows Server 2008 Note

```batch
set NODE_SKIP_PLATFORM_CHECK=1
node server.js
```

---

## 13. File/Directory Map

| Path | Description |
|---|---|
| `server.js` | Backend: API endpoints, ping engine, static serving |
| `app.js` | Main planner: state, rendering, event handling |
| `index.html` | Main planner UI shell |
| `styles.css` | Main planner stylesheet |
| `display.html` | Read-only live monitoring view |
| `preview.html` | Camera preview helper page |
| `install.bat` | Windows one-click installer |
| `start-cams.bat` | Launch script (created by installer) |
| `data/plan.json` | Persisted plan data |
| `uploads/` | Uploaded layout and preview images |
| `docs/` | Documentation |

---

## 14. Smoke Test Checklist (Post-Deployment)

1. Open `/` — main planner loads
2. Upload a layout image — image renders on canvas
3. Right-click canvas — context menu appears
4. Add a node — marker appears at correct position
5. Pan canvas (left-click drag) — view shifts correctly
6. Search for a camera name — list filters and markers highlight
7. Open `/display` — read-only view loads with same data
8. Start ping monitoring — color indicators appear on markers
9. Export JSON — file downloads correctly
10. Import JSON — data restores correctly

---

## 15. Changelog

### v3.0.0
- Right-click context menu for adding nodes (prevents accidental left-click placement)
- Left-click drag pan with `#viewport` CSS transform architecture
- Double-click to reset canvas pan
- Live search highlights matching markers on canvas (drop-shadow glow); non-matching markers dimmed
- `renderMarkers()` responds to search state changes in sync with sidebar list
- Version bumped in `package.json`

### v2.0.0
- Live IP ping monitoring via SSE (`/api/ping-live`)
- Per-camera color status (alive/dead/pending)
- Display-only page (`/display`) with layout tab switching
- Multi-layout support with per-layout camera context

### v1.0.0
- Initial CCTV layout planner
- Camera point placement, editing, drag-and-drop
- JSON and PNG export/import
- Single-layout model
