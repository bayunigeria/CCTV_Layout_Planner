const STORAGE_KEY = "cams-layout-planner-fallback-v2";
const PREVIEW_CONTEXT_KEY = "cams-preview-context-v1";

const state = {
  layouts: [],
  selectedLayoutId: null,
};

const layoutInput = document.getElementById("layoutInput");
const importBtn = document.getElementById("importBtn");
const exportBtn = document.getElementById("exportBtn");
const exportPngBtn = document.getElementById("exportPngBtn");
const clearBtn = document.getElementById("clearBtn");
const stage = document.getElementById("stage");
const viewport = document.getElementById("viewport");
const layoutImage = document.getElementById("layoutImage");
const markerLayer = document.getElementById("markerLayer");
const emptyState = document.getElementById("emptyState");
const ctxMenu = document.getElementById("ctxMenu");
const ctxAddBtn = document.getElementById("ctxAddBtn");
const ctxCancelBtn = document.getElementById("ctxCancelBtn");
const cameraList = document.getElementById("cameraList");
const cameraSearchInput = document.getElementById("cameraSearchInput");
const editor = document.getElementById("editor");
const editorHint = document.getElementById("editorHint");
const hoverCard = document.getElementById("hoverCard");

const nameInput = document.getElementById("nameInput");
const nameError = document.getElementById("nameError");
const angleInput = document.getElementById("angleInput");
const noteInput = document.getElementById("noteInput");
const previewInput = document.getElementById("previewInput");
const deleteBtn = document.getElementById("deleteBtn");
const ipInput = document.getElementById("ipInput");
const pingToggleBtn = document.getElementById("pingToggleBtn");

const layoutSelect = document.getElementById("layoutSelect");
const layoutNameInput = document.getElementById("layoutNameInput");
const addLayoutBtn = document.getElementById("addLayoutBtn");
const removeLayoutBtn = document.getElementById("removeLayoutBtn");

let _drag = null;
let _saveTimer = null;
let _saving = false;
let _saveAgain = false;
let _hoverHideTimer = null;
let pingActive = false;
let _pingEventSource = null;
const pingStatus = {};

let panX = 0;
let panY = 0;
let _ctxMenuPos = null;

function normalizeLabel(label) {
  return String(label || "").trim().toLowerCase();
}

function applyPan() {
  viewport.style.transform = `translate(${panX}px, ${panY}px)`;
}

function resetPan() {
  panX = 0;
  panY = 0;
  applyPan();
}

function showCtxMenu(e) {
  const layout = getActiveLayout();
  if (!layout.layoutDataUrl) return;

  const rect = stage.getBoundingClientRect();
  const x = ((e.clientX - rect.left - panX) / rect.width) * 100;
  const y = ((e.clientY - rect.top - panY) / rect.height) * 100;
  if (x < 0 || y < 0 || x > 100 || y > 100) return;

  _ctxMenuPos = { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };

  const menuX = Math.min(window.innerWidth - 165, e.clientX + 4);
  const menuY = Math.min(window.innerHeight - 100, e.clientY + 4);
  ctxMenu.style.left = `${menuX}px`;
  ctxMenu.style.top = `${menuY}px`;
  ctxMenu.classList.remove("hidden");
}

function hideCtxMenu() {
  ctxMenu.classList.add("hidden");
  _ctxMenuPos = null;
}

function isValidIpv4(ip) {
  const parts = String(ip || "").trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function createEmptyLayout(id, name) {
  return {
    id,
    name: String(name || "Layout").trim() || "Layout",
    layoutDataUrl: "",
    cameras: [],
    selectedId: null,
    nextId: 1,
    cameraSearch: "",
  };
}

function getLayoutById(id) {
  return state.layouts.find((layout) => layout.id === id) || null;
}

function getActiveLayout() {
  let active = getLayoutById(state.selectedLayoutId);
  if (active) return active;

  if (!state.layouts.length) {
    const defaultLayout = createEmptyLayout(1, "Floor 1");
    state.layouts.push(defaultLayout);
    state.selectedLayoutId = defaultLayout.id;
    return defaultLayout;
  }

  state.selectedLayoutId = state.layouts[0].id;
  return state.layouts[0];
}

function nextLayoutId() {
  return Math.max(0, ...state.layouts.map((l) => Number(l.id) || 0)) + 1;
}

function makeUniqueLayoutName(baseName) {
  const base = String(baseName || "Layout").trim() || "Layout";
  const used = new Set(state.layouts.map((l) => normalizeLabel(l.name)));
  if (!used.has(normalizeLabel(base))) return base;

  let i = 2;
  let candidate = `${base} ${i}`;
  while (used.has(normalizeLabel(candidate))) {
    i += 1;
    candidate = `${base} ${i}`;
  }
  return candidate;
}

function sanitizeCamera(input) {
  return {
    id: Number(input?.id) || 0,
    name: String(input?.name || ""),
    x: Number(input?.x) || 0,
    y: Number(input?.y) || 0,
    angle: Number(input?.angle) || 0,
    note: String(input?.note || ""),
    preview: String(input?.preview || ""),
    ip: String(input?.ip || ""),
  };
}

function sanitizeLayout(input, fallbackId = 1) {
  const cameras = Array.isArray(input?.cameras) ? input.cameras.map(sanitizeCamera) : [];
  const computedNextId = Math.max(0, ...cameras.map((c) => Number(c.id) || 0)) + 1;

  return {
    id: Number(input?.id) || fallbackId,
    name: String(input?.name || `Floor ${fallbackId}`).trim() || `Floor ${fallbackId}`,
    layoutDataUrl: String(input?.layoutDataUrl || ""),
    cameras,
    selectedId: input?.selectedId == null ? null : Number(input.selectedId),
    nextId: Number(input?.nextId) || computedNextId,
    cameraSearch: String(input?.cameraSearch || ""),
  };
}

function hasDuplicateLabel(label, excludeId = null, layout = getActiveLayout()) {
  const normalized = normalizeLabel(label);
  if (!normalized) return false;
  return layout.cameras.some((camera) => {
    if (excludeId !== null && camera.id === excludeId) return false;
    return normalizeLabel(camera.name) === normalized;
  });
}

function makeUniqueLabel(baseLabel, excludeId = null, layout = getActiveLayout()) {
  const base = String(baseLabel || "").trim() || "Unnamed";
  if (!hasDuplicateLabel(base, excludeId, layout)) return base;

  let index = 2;
  let candidate = `${base} (${index})`;
  while (hasDuplicateLabel(candidate, excludeId, layout)) {
    index += 1;
    candidate = `${base} (${index})`;
  }
  return candidate;
}

function enforceUniqueLabels(layout) {
  layout.cameras.forEach((camera, i) => {
    const fallback = `CAM-${String(i + 1).padStart(2, "0")}`;
    const current = String(camera.name || "").trim() || fallback;
    camera.name = makeUniqueLabel(current, camera.id, layout);
  });
}

function normalizePlan(input) {
  let layouts = [];

  if (Array.isArray(input?.layouts) && input.layouts.length) {
    layouts = input.layouts
      .filter((l) => l && typeof l === "object")
      .map((layout, i) => sanitizeLayout(layout, i + 1));
  } else {
    const legacyLayout = sanitizeLayout(
      {
        id: 1,
        name: "Floor 1",
        layoutDataUrl: input?.layoutDataUrl || "",
        cameras: Array.isArray(input?.cameras) ? input.cameras : [],
        selectedId: input?.selectedId,
        nextId: input?.nextId,
        cameraSearch: input?.cameraSearch,
      },
      1
    );
    layouts = [legacyLayout];
  }

  if (!layouts.length) {
    layouts = [createEmptyLayout(1, "Floor 1")];
  }

  layouts.forEach(enforceUniqueLabels);

  const selectedLayoutId = Number(input?.selectedLayoutId);
  const hasSelected = layouts.some((l) => l.id === selectedLayoutId);

  state.layouts = layouts;
  state.selectedLayoutId = hasSelected ? selectedLayoutId : layouts[0].id;
}

function toPlanPayload() {
  return {
    layouts: state.layouts.map((layout) => ({
      id: layout.id,
      name: layout.name,
      layoutDataUrl: layout.layoutDataUrl,
      cameras: layout.cameras.map((c) => ({
        id: c.id,
        name: c.name,
        x: c.x,
        y: c.y,
        angle: c.angle,
        note: c.note,
        preview: c.preview,
        ip: c.ip || "",
      })),
      selectedId: layout.selectedId,
      nextId: layout.nextId,
      cameraSearch: layout.cameraSearch,
    })),
    selectedLayoutId: state.selectedLayoutId,
  };
}

function setNameError(message) {
  if (!message) {
    nameError.classList.add("hidden");
    nameError.textContent = "";
    nameInput.removeAttribute("aria-invalid");
    return;
  }

  nameError.classList.remove("hidden");
  nameError.textContent = message;
  nameInput.setAttribute("aria-invalid", "true");
}

function getSelectedCamera() {
  const layout = getActiveLayout();
  return layout.cameras.find((c) => c.id === layout.selectedId) || null;
}

async function apiGetPlan() {
  const response = await fetch("/api/plan", { method: "GET" });
  if (!response.ok) throw new Error("Failed to load plan");
  return response.json();
}

async function apiSavePlan() {
  const response = await fetch("/api/plan", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toPlanPayload()),
  });
  if (!response.ok) throw new Error("Failed to save plan");
}

async function uploadImageFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.path) {
    throw new Error(payload?.message || "Upload failed");
  }

  return payload.path;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file locally"));
    reader.readAsDataURL(file);
  });
}

function saveFallbackLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toPlanPayload()));
}

function loadFallbackLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    normalizePlan(JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

async function pushSave() {
  if (_saving) {
    _saveAgain = true;
    return;
  }

  _saving = true;
  try {
    await apiSavePlan();
    saveFallbackLocal();
  } catch {
    saveFallbackLocal();
  } finally {
    _saving = false;
    if (_saveAgain) {
      _saveAgain = false;
      await pushSave();
    }
  }
}

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    pushSave();
  }, 220);
}

function setSelectedCamera(id) {
  const layout = getActiveLayout();
  layout.selectedId = id;
  render();
  scheduleSave();
}

function addCamera(xPercent, yPercent) {
  const layout = getActiveLayout();
  const defaultName = makeUniqueLabel(`CAM-${String(layout.nextId).padStart(2, "0")}`, null, layout);
  const cam = {
    id: layout.nextId++,
    name: defaultName,
    x: xPercent,
    y: yPercent,
    angle: 0,
    note: "",
    preview: "",
    ip: "",
  };
  layout.cameras.push(cam);
  layout.selectedId = cam.id;
  render();
  scheduleSave();
}

function pingKey(layoutId, cameraId) {
  return `${layoutId}:${cameraId}`;
}

function removeSelectedCamera() {
  const layout = getActiveLayout();
  if (!layout.selectedId) return;
  delete pingStatus[pingKey(layout.id, layout.selectedId)];
  layout.cameras = layout.cameras.filter((c) => c.id !== layout.selectedId);
  layout.selectedId = layout.cameras[0]?.id || null;
  render();
  scheduleSave();
}

function updateSelectedCamera(changes) {
  const sel = getSelectedCamera();
  if (!sel) return;
  Object.assign(sel, changes);
  render();
  scheduleSave();
}

function addLayout() {
  const id = nextLayoutId();
  const name = makeUniqueLayoutName(`Floor ${id}`);
  state.layouts.push(createEmptyLayout(id, name));
  state.selectedLayoutId = id;
  stopPingMonitoring();
  render();
  scheduleSave();
}

function removeLayout() {
  if (state.layouts.length <= 1) {
    alert("At least 1 layout is required.");
    return;
  }

  const layout = getActiveLayout();
  if (!confirm(`Remove layout "${layout.name}" and all its camera points?`)) return;

  stopPingMonitoring();
  state.layouts = state.layouts.filter((l) => l.id !== layout.id);
  state.selectedLayoutId = state.layouts[0].id;
  render();
  scheduleSave();
}

function setLayoutName(name) {
  const layout = getActiveLayout();
  layout.name = String(name || "").trim() || `Floor ${layout.id}`;
  renderLayoutControls();
  scheduleSave();
}

function setActiveLayout(layoutId) {
  if (Number(layoutId) === state.selectedLayoutId) return;
  if (!getLayoutById(Number(layoutId))) return;

  stopPingMonitoring();
  state.selectedLayoutId = Number(layoutId);
  resetPan();
  render();
  scheduleSave();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(toPlanPayload(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cctv-plan-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      stopPingMonitoring();
      normalizePlan(JSON.parse(String(reader.result || "")));
      resetPan();
      render();
      scheduleSave();
    } catch {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
}

function clearAll() {
  if (!confirm("Reset all layout and camera data?")) return;
  stopPingMonitoring();
  state.layouts = [createEmptyLayout(1, "Floor 1")];
  state.selectedLayoutId = 1;
  resetPan();
  render();
  scheduleSave();
}

async function exportPng() {
  const layout = getActiveLayout();
  if (!layout.layoutDataUrl) {
    alert("Upload a layout image first.");
    return;
  }

  exportPngBtn.textContent = "Generating...";
  exportPngBtn.disabled = true;

  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = layout.layoutDataUrl;
    });

    const W = img.naturalWidth;
    const H = img.naturalHeight;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(img, 0, 0, W, H);

    layout.cameras.forEach((cam) => {
      const cx = (cam.x / 100) * W;
      const cy = (cam.y / 100) * H;
      const r = Math.max(10, Math.min(W, H) * 0.015);

      const len = r * 2.2;
      const halfBase = r * 0.9;
      const angle = ((cam.angle || 0) + 90) * (Math.PI / 180);
      const leftBaseAngle = angle - Math.PI / 2;
      const rightBaseAngle = angle + Math.PI / 2;
      const baseCenterX = cx - Math.cos(angle) * len;
      const baseCenterY = cy - Math.sin(angle) * len;
      const leftX = baseCenterX + Math.cos(leftBaseAngle) * halfBase;
      const leftY = baseCenterY + Math.sin(leftBaseAngle) * halfBase;
      const rightX = baseCenterX + Math.cos(rightBaseAngle) * halfBase;
      const rightY = baseCenterY + Math.sin(rightBaseAngle) * halfBase;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fillStyle = "#d97706";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.font = `bold ${Math.max(12, r * 1.1)}px Space Grotesk, sans-serif`;
      ctx.fillStyle = "#1f2937";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(cam.name, baseCenterX + 8, baseCenterY);
    });

    ctx.font = `${Math.max(14, W * 0.018)}px Space Grotesk, sans-serif`;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("CCTV Layout Planner", W - 12, H - 10);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${layout.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "layout"}-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    alert("PNG export failed. Make sure the layout is loaded.");
  } finally {
    exportPngBtn.textContent = "Export PNG";
    exportPngBtn.disabled = false;
  }
}

function showHoverCard(camera, rect) {
  clearTimeout(_hoverHideTimer);

  const previewHtml = camera.preview
    ? `<button type="button" class="hover-preview-btn" data-preview-src="${camera.preview}" data-preview-label="${camera.name}"><img src="${camera.preview}" alt="Preview ${camera.name}" /></button>`
    : `<div style="height:100px;background:#f1f5f9;display:grid;place-content:center;color:#94a3b8;font-size:.8rem">No preview uploaded</div>`;

  hoverCard.innerHTML = `${previewHtml}
    <div class="hover-meta">
      <p class="hover-angle">Direction: ${camera.angle}�</p>
      <p class="hover-title">${camera.name}</p>
      ${camera.preview ? '<p class="hover-open-hint">Click preview to open full image</p>' : ""}
      <p class="hover-note">${camera.note || "No notes added."}</p>
    </div>`;

  const previewButton = hoverCard.querySelector(".hover-preview-btn");
  if (previewButton) {
    previewButton.addEventListener("click", () => {
      openPreviewViewer(camera);
    });
  }

  const cardX = Math.min(window.innerWidth - 245, rect.left + 18);
  const cardY = Math.max(12, rect.top - 200);
  hoverCard.style.left = `${cardX}px`;
  hoverCard.style.top = `${cardY}px`;
  hoverCard.classList.remove("hidden");
}

function scheduleHideHoverCard() {
  clearTimeout(_hoverHideTimer);
  _hoverHideTimer = setTimeout(() => {
    hoverCard.classList.add("hidden");
  }, 120);
}

function hideHoverCard() {
  clearTimeout(_hoverHideTimer);
  hoverCard.classList.add("hidden");
}

function openPreviewViewer(camera) {
  const layout = getActiveLayout();
  const previewItems = layout.cameras
    .filter((c) => c.preview)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base", numeric: true }))
    .map((c) => ({
      id: c.id,
      label: c.name,
      src: c.preview,
    }));

  const context = {
    items: previewItems,
    activeCameraId: camera.id,
    savedAt: Date.now(),
  };

  localStorage.setItem(PREVIEW_CONTEXT_KEY, JSON.stringify(context));

  const params = new URLSearchParams({
    cameraId: String(camera.id),
    src: camera.preview || "",
    label: camera.name || "Camera Preview",
  });

  window.open(`/preview.html?${params.toString()}`, "_blank", "noopener");
}

function startPingMonitoring() {
  if (_pingEventSource) {
    _pingEventSource.close();
    _pingEventSource = null;
  }

  const layout = getActiveLayout();
  const targets = layout.cameras.filter((c) => isValidIpv4(c.ip));
  if (!targets.length) {
    alert("Enter at least 1 valid camera IP address (e.g. 192.168.1.10) before starting monitoring.");
    return;
  }

  Object.keys(pingStatus).forEach((k) => delete pingStatus[k]);
  targets.forEach((c) => {
    pingStatus[pingKey(layout.id, c.id)] = "pending";
  });

  pingActive = true;
  updatePingToggleBtn();
  renderMarkers();
  renderCameraList();

  _pingEventSource = new EventSource(`/api/ping-live?layoutId=${encodeURIComponent(String(layout.id))}`);

  _pingEventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (typeof data.id === "undefined") return;

      const dataLayoutId = Number(data.layoutId) || layout.id;
      const activeLayout = getActiveLayout();
      if (activeLayout.id !== dataLayoutId) return;

      pingStatus[pingKey(dataLayoutId, Number(data.id))] = data.alive ? "alive" : "dead";
      renderMarkers();
      renderCameraList();
    } catch {
      // ignore malformed event
    }
  };

  _pingEventSource.onerror = () => {
    if (_pingEventSource) {
      _pingEventSource.close();
      _pingEventSource = null;
    }
    pingActive = false;
    Object.keys(pingStatus).forEach((k) => delete pingStatus[k]);
    updatePingToggleBtn();
    renderMarkers();
    renderCameraList();
  };
}

function stopPingMonitoring() {
  if (_pingEventSource) {
    _pingEventSource.close();
    _pingEventSource = null;
  }
  pingActive = false;
  Object.keys(pingStatus).forEach((k) => delete pingStatus[k]);
  updatePingToggleBtn();
  renderMarkers();
  renderCameraList();
}

function updatePingToggleBtn() {
  if (!pingToggleBtn) return;
  if (pingActive) {
    pingToggleBtn.textContent = "Stop Monitoring";
    pingToggleBtn.classList.add("active");
  } else {
    pingToggleBtn.textContent = "Start Monitoring";
    pingToggleBtn.classList.remove("active");
  }
}

function togglePingMonitoring() {
  if (pingActive) {
    stopPingMonitoring();
  } else {
    startPingMonitoring();
  }
}

function startDrag(event, camera) {
  event.preventDefault();

  const rect = stage.getBoundingClientRect();
  const layout = getActiveLayout();
  _drag = {
    cameraId: camera.id,
    layoutId: layout.id,
    stageRect: rect,
    moved: false,
  };

  function onMove(e) {
    if (!_drag) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = ((clientX - _drag.stageRect.left - panX) / _drag.stageRect.width) * 100;
    const y = ((clientY - _drag.stageRect.top - panY) / _drag.stageRect.height) * 100;

    if (x < 0 || y < 0 || x > 100 || y > 100) return;

    const dragLayout = getLayoutById(_drag.layoutId);
    const cam = dragLayout?.cameras.find((c) => c.id === _drag.cameraId);
    if (!cam) return;

    cam.x = Number(x.toFixed(2));
    cam.y = Number(y.toFixed(2));
    _drag.moved = true;
    renderMarkers();
  }

  function onUp() {
    if (_drag?.moved) {
      const dragLayout = getLayoutById(_drag.layoutId);
      if (dragLayout) {
        dragLayout.selectedId = _drag.cameraId;
      }
      render();
      scheduleSave();
    }
    _drag = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp);
}

function renderLayoutControls() {
  const activeLayout = getActiveLayout();

  layoutSelect.innerHTML = "";
  state.layouts
    .sort((a, b) => a.id - b.id)
    .forEach((layout) => {
      const option = document.createElement("option");
      option.value = String(layout.id);
      option.textContent = `${layout.name} (${layout.cameras.length})`;
      layoutSelect.appendChild(option);
    });

  layoutSelect.value = String(activeLayout.id);
  layoutNameInput.value = activeLayout.name || "";
  removeLayoutBtn.disabled = state.layouts.length <= 1;
}

function renderMarkers() {
  markerLayer.innerHTML = "";
  const layout = getActiveLayout();
  const searchQuery = normalizeLabel(layout.cameraSearch);

  layout.cameras.forEach((cam) => {
    const marker = document.createElement("button");
    marker.type = "button";
    const ps = pingStatus[pingKey(layout.id, cam.id)];
    const pingClass = ps === "alive" ? " ping-alive" : ps === "dead" ? " ping-dead" : ps === "pending" ? " ping-pending" : "";
    let searchClass = "";
    if (searchQuery) {
      searchClass = normalizeLabel(cam.name).includes(searchQuery) ? " search-match" : " search-dim";
    }
    marker.className = `marker${cam.id === layout.selectedId ? " selected" : ""}${pingClass}${searchClass}`;
    marker.style.left = `${cam.x}%`;
    marker.style.top = `${cam.y}%`;
    marker.style.transform = `translate(-50%, -100%) rotate(${cam.angle || 0}deg)`;
    marker.setAttribute("aria-label", cam.name);

    marker.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!_drag?.moved) setSelectedCamera(cam.id);
    });

    marker.addEventListener("mousedown", (e) => startDrag(e, cam));
    marker.addEventListener("touchstart", (e) => startDrag(e, cam), { passive: false });

    marker.addEventListener("mouseenter", () => {
      const rect = marker.getBoundingClientRect();
      showHoverCard(cam, rect);
    });
    marker.addEventListener("mouseleave", scheduleHideHoverCard);

    markerLayer.appendChild(marker);
  });
}

function renderCameraList() {
  cameraList.innerHTML = "";
  const layout = getActiveLayout();

  if (!layout.cameras.length) {
    cameraList.innerHTML = `<p class="muted">No camera points yet.</p>`;
    return;
  }

  const sortedCameras = [...layout.cameras].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base", numeric: true })
  );

  const searchQuery = normalizeLabel(layout.cameraSearch);
  const filteredCameras = !searchQuery
    ? sortedCameras
    : sortedCameras.filter((camera) => normalizeLabel(camera.name).includes(searchQuery));

  if (!filteredCameras.length) {
    cameraList.innerHTML = `<p class="muted">No label matches your search.</p>`;
    return;
  }

  filteredCameras.forEach((cam) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `camera-item${cam.id === layout.selectedId ? " active" : ""}`;

    const ps = pingStatus[pingKey(layout.id, cam.id)];
    if (ps) {
      const dot = document.createElement("span");
      dot.className = `ping-dot dot-${ps}`;
      item.appendChild(dot);
    }

    const labelSpan = document.createElement("span");
    labelSpan.textContent = cam.name;
    item.appendChild(labelSpan);

    item.addEventListener("click", () => setSelectedCamera(cam.id));
    cameraList.appendChild(item);
  });
}

function renderEditor() {
  const sel = getSelectedCamera();
  if (!sel) {
    editor.classList.add("hidden");
    editorHint.classList.remove("hidden");
    setNameError("");
    return;
  }

  editor.classList.remove("hidden");
  editorHint.classList.add("hidden");
  setNameError("");

  nameInput.value = sel.name || "";
  angleInput.value = Number.isFinite(sel.angle) ? sel.angle : 0;
  noteInput.value = sel.note || "";
  ipInput.value = sel.ip || "";
}

function renderLayout() {
  const layout = getActiveLayout();
  if (!layout.layoutDataUrl) {
    layoutImage.style.display = "none";
    emptyState.classList.remove("hidden");
    return;
  }
  layoutImage.src = layout.layoutDataUrl;
  layoutImage.style.display = "block";
  emptyState.classList.add("hidden");
}

function render() {
  const layout = getActiveLayout();
  cameraSearchInput.value = layout.cameraSearch || "";
  renderLayoutControls();
  renderLayout();
  renderMarkers();
  renderCameraList();
  renderEditor();
  const displayBtn = document.getElementById("displayBtn");
  if (displayBtn) displayBtn.href = `/display?layoutId=${layout.id}`;
}

layoutInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const layout = getActiveLayout();

  try {
    const uploadedPath = await uploadImageFile(file);
    layout.layoutDataUrl = uploadedPath;
    render();
    scheduleSave();
  } catch (err) {
    try {
      const localDataUrl = await readFileAsDataUrl(file);
      layout.layoutDataUrl = localDataUrl;
      render();
      scheduleSave();
      alert("Server upload is not reachable. Image is stored in local browser mode.");
    } catch {
      alert(err.message || "Failed to upload layout image.");
    }
  } finally {
    layoutInput.value = "";
  }
});

stage.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (e.target instanceof HTMLElement && e.target.classList.contains("marker")) return;
  hideCtxMenu();

  const startX = e.clientX - panX;
  const startY = e.clientY - panY;
  let moved = false;

  function onPanMove(ev) {
    panX = ev.clientX - startX;
    panY = ev.clientY - startY;
    applyPan();
    if (!moved) {
      moved = true;
      stage.classList.add("is-panning");
    }
  }

  function onPanUp() {
    stage.classList.remove("is-panning");
    window.removeEventListener("mousemove", onPanMove);
    window.removeEventListener("mouseup", onPanUp);
  }

  window.addEventListener("mousemove", onPanMove);
  window.addEventListener("mouseup", onPanUp);
});

stage.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (e.target instanceof HTMLElement && e.target.classList.contains("marker")) return;
  showCtxMenu(e);
});

ctxAddBtn.addEventListener("click", () => {
  if (_ctxMenuPos) addCamera(_ctxMenuPos.x, _ctxMenuPos.y);
  hideCtxMenu();
});

ctxCancelBtn.addEventListener("click", hideCtxMenu);

document.addEventListener("click", (e) => {
  if (!ctxMenu.classList.contains("hidden") && !ctxMenu.contains(e.target)) {
    hideCtxMenu();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideCtxMenu();
});

stage.addEventListener("dblclick", (e) => {
  if (e.target instanceof HTMLElement && e.target.classList.contains("marker")) return;
  resetPan();
});

nameInput.addEventListener("input", () => {
  const selected = getSelectedCamera();
  const layout = getActiveLayout();
  if (!selected) return;

  const nextLabel = nameInput.value.trim();
  if (!nextLabel) {
    setNameError("Label is required.");
    return;
  }

  if (hasDuplicateLabel(nextLabel, selected.id, layout)) {
    setNameError("Label must be unique. This label already exists.");
    return;
  }

  setNameError("");
  updateSelectedCamera({ name: nextLabel });
});

angleInput.addEventListener("input", () => {
  let a = Number(angleInput.value);
  if (!Number.isFinite(a)) a = 0;
  a = ((a % 360) + 360) % 360;
  updateSelectedCamera({ angle: a });
});

noteInput.addEventListener("input", () => {
  updateSelectedCamera({ note: noteInput.value });
});

ipInput.addEventListener("input", () => {
  updateSelectedCamera({ ip: ipInput.value });
});

previewInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const uploadedPath = await uploadImageFile(file);
    updateSelectedCamera({ preview: uploadedPath });
  } catch (err) {
    try {
      const localDataUrl = await readFileAsDataUrl(file);
      updateSelectedCamera({ preview: localDataUrl });
      alert("Server upload is not reachable. Preview is stored in local browser mode.");
    } catch {
      alert(err.message || "Failed to upload camera preview.");
    }
  } finally {
    previewInput.value = "";
  }
});

cameraSearchInput.addEventListener("input", (e) => {
  const layout = getActiveLayout();
  layout.cameraSearch = e.target.value || "";
  renderCameraList();
  renderMarkers();
  scheduleSave();
});

layoutSelect.addEventListener("change", (e) => {
  setActiveLayout(Number(e.target.value));
});

layoutNameInput.addEventListener("input", (e) => {
  setLayoutName(e.target.value);
});

addLayoutBtn.addEventListener("click", addLayout);
removeLayoutBtn.addEventListener("click", removeLayout);

deleteBtn.addEventListener("click", removeSelectedCamera);
pingToggleBtn.addEventListener("click", togglePingMonitoring);
clearBtn.addEventListener("click", clearAll);
exportBtn.addEventListener("click", exportJson);
exportPngBtn.addEventListener("click", exportPng);

importBtn.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  importJson(file);
  importBtn.value = "";
});

window.addEventListener("resize", () => {
  hideHoverCard();
});

window.addEventListener("beforeunload", () => {
  if (_pingEventSource) _pingEventSource.close();
});

hoverCard.addEventListener("mouseenter", () => {
  clearTimeout(_hoverHideTimer);
});

hoverCard.addEventListener("mouseleave", () => {
  scheduleHideHoverCard();
});

(async function init() {
  try {
    const serverPlan = await apiGetPlan();
    normalizePlan(serverPlan);
  } catch {
    loadFallbackLocal();
  }
  updatePingToggleBtn();
  render();
})();
