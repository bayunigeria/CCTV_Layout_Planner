# CAMS CCTV Layout Planner — User Guide

## 1. Purpose
CAMS (CCTV Layout Planner) is used to map CCTV camera positions on building layouts, manage multiple floors or areas, and monitor camera reachability (Reply/RTO) in live session mode.

---

## 2. Access and Roles

| URL | Role |
|---|---|
| `http://<server-ip>:<port>/` | Planner / Admin — full editing |
| `http://<server-ip>:<port>/display` | Display-only — NOC/monitoring screen |
| `http://<server-ip>:<port>/display?layoutId=<id>` | Display-only for a specific floor/layout |

---

## 3. Main Features

1. Multi-layout management (Floor 1, Floor 2, etc.)
2. Right-click to add camera nodes (no accidental clicks)
3. Left-click drag to pan/navigate the layout canvas
4. Live search — filters the list and highlights matching markers on the canvas
5. Camera details: Label, Direction, Local IP Address, Notes, Preview image
6. Live ping monitoring with color status (green/red/amber)
7. JSON export/import for backup and migration
8. PNG export for static reporting
9. Display-only page for NOC/monitoring screens

---

## 4. First-Time Setup

1. Open CAMS main page (`/`)
2. Click **Upload Layout** and select a floor plan image (JPG/PNG/WEBP)
3. Right-click anywhere on the layout image to add your first camera node
4. Fill in the camera details in the panel on the right
5. Repeat for all cameras

---

## 5. Layout Management

### Add Layout
1. In the **Layouts** panel, click **Add Layout**
2. A new layout is created and selected automatically
3. Rename it in the **Layout name** field

### Switch Layout
1. Select the target layout from the layout dropdown
2. Camera points, image, and search state are specific to each layout
3. The canvas view resets to the default position when switching

### Remove Layout
1. Select the layout to remove
2. Click **Remove Layout**
3. Confirm deletion
4. At least 1 layout must remain at all times

---

## 6. Camera Node Operations

### Add a Camera Node
1. Upload a layout image first
2. **Right-click** anywhere on the layout canvas
3. A small popup appears: **"Add Node Here?"**
4. Click **Add Node** to confirm, or **Cancel** to dismiss
5. The node is placed at the exact position you right-clicked

> Tip: Press **Escape** or click anywhere outside the popup to cancel.

### Navigate the Canvas (Pan)
- **Left-click and drag** on the canvas background to pan the view
- The cursor changes to a grab hand while panning
- **Double-click** on the canvas background to reset the view to the original position

### Move a Camera Node
- **Click and drag** any marker to reposition it
- Release to save the new position

### Edit Camera Details
1. Click a marker on the canvas, or click the camera name in the **Camera Points** list
2. The **Camera Details** panel updates on the right
3. Editable fields:
   - **Label** — must be unique within the same layout
   - **Direction** (0–359 degrees) — controls the angle the camera marker points
   - **Local IP Address** — IPv4 format (e.g. `192.168.1.100`), used for ping monitoring
   - **Notes** — free text for coverage area, blind spots, etc.
   - **Upload Camera View Preview** — optional thumbnail image

### Delete a Camera
1. Select the camera
2. Click **Remove This Camera** in the Camera Details panel

---

## 7. Live Search

1. Type in the **Search by label** input in the Camera Points panel
2. Results update instantly with no button press needed
3. The sidebar list filters to matching names
4. On the canvas, matching markers **glow with a green highlight** and non-matching markers become **dimmed**
5. Clear the search box to return all markers to normal

---

## 8. Live Ping Monitoring

### Start Monitoring
1. Ensure at least one camera has a valid IPv4 address (e.g. `192.168.1.10`)
2. Click **Start Monitoring** in the Camera Points panel
3. The server pings camera IPs periodically and streams results in real time

### Color Status
| Color | Meaning |
|---|---|
| Green | Reachable (TTL reply received) |
| Red | Unreachable (no reply / RTO) |
| Amber blinking | Checking (ping in progress) |

### Stop Monitoring
- Click **Stop Monitoring**
- All live status indicators are cleared

### Important Notes
- Ping status is **session-only** — it is not saved and resets on page refresh
- Monitoring scope is the **currently selected layout**
- Network must allow ICMP traffic from the server host to camera IPs

---

## 9. Display-Only View

### Open the View
- `/display` — loads the first / default layout
- `/display?layoutId=<id>` — loads a specific layout

### What Is Visible
- Layout image with camera markers and live color status
- Camera list with IP and ping status
- Layout tabs (if more than one layout exists)

### Recommended Use Cases
- NOC wallboard or large-screen display
- Supervisor monitoring during shift
- Stakeholder read-only view

---

## 10. Backup and Restore

### Export JSON
1. Click **Export JSON**
2. Save the file to your backup location

### Import JSON
1. Click **Import JSON**
2. Select a previously exported file
3. Verify that layouts and camera points loaded correctly

---

## 11. PNG Report Export

1. Select the desired layout
2. Click **Export PNG**
3. A PNG image with camera overlays is downloaded — ready for reports or handovers

---

## 12. Best Practices

1. Use a consistent naming convention, e.g. `CAM-F1-ENTRANCE-01`
2. Enter Local IP Address only with valid IPv4 values
3. Export JSON after any major update (change window, new floor, etc.)
4. Validate the display-only page after updating a floor layout
5. Use the search box to quickly locate cameras in large floor plans

---

## 13. Common Troubleshooting

### Camera marker does not change color during monitoring
- Confirm Local IP Address is filled and formatted correctly (IPv4)
- Confirm monitoring has been started
- Confirm the server host can reach the camera IP (test with ping from server)

### "Duplicate label" warning
- Rename the selected camera with a unique label within the current layout

### Upload fails
- Ensure image type is JPG/JPEG/PNG/WEBP
- Ensure file size is under 8 MB
- Retry after checking network or server status

### Display page not accessible
- Confirm URL path uses `/display`
- Confirm CAMS server process is running
- Confirm firewall allows the configured port (default: 8080)

### Context menu (Add Node) does not appear
- Ensure a layout image has been uploaded first
- Right-click on the canvas area, not on an existing marker

---

## 14. Data Handling Notes

- Plan data (layouts and cameras) is persisted to `data/plan.json` on the server
- Uploaded images are stored in the `uploads/` folder on the server
- Ping status is session-only and is never written to disk
