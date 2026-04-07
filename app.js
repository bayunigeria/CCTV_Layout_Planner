const STORAGE_KEY = "cams-layout-planner-fallback-v2";
const PREVIEW_CONTEXT_KEY = "cams-preview-context-v1";

const state = {
  layoutDataUrl: "",
  cameras: [],
  selectedId: null,
  nextId: 1,
  cameraSearch: "",
};

const layoutInput = document.getElementById("layoutInput");
const importBtn = document.getElementById("importBtn");
const exportBtn = document.getElementById("exportBtn");
const exportPngBtn = document.getElementById("exportPngBtn");
const clearBtn = document.getElementById("clearBtn");
const stage = document.getElementById("stage");
const layoutImage = document.getElementById("layoutImage");
const markerLayer = document.getElementById("markerLayer");
const emptyState = document.getElementById("emptyState");
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

let _drag = null;
let _saveTimer = null;
let _saving = false;
let _saveAgain = false;
let _hoverHideTimer = null;
let pingActive = false;
let _pingEventSource = null;
const pingStatus = {};

function normalizeLabel(label) {
  return String(label || "").trim().toLowerCase();
}

function isValidIpv4(ip) {
  const parts = String(ip || "").trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function hasDuplicateLabel(label, excludeId = null) {
  const normalized = normalizeLabel(label);
  if (!normalized) return false;
  return state.cameras.some((camera) => {
    if (excludeId !== null && camera.id === excludeId) return false;
    return normalizeLabel(camera.name) === normalized;
  });
}

function makeUniqueLabel(baseLabel, excludeId = null) {
  const base = String(baseLabel || "").trim() || "Unnamed";
  if (!hasDuplicateLabel(base, excludeId)) return base;

  let index = 2;
  let candidate = `${base} (${index})`;
  while (hasDuplicateLabel(candidate, excludeId)) {
    index += 1;
    candidate = `${base} (${index})`;
  }
  return candidate;
}

function enforceUniqueLabels() {
  state.cameras.forEach((camera, i) => {
    const fallback = `CAM-${String(i + 1).padStart(2, "0")}`;
    const current = String(camera.name || "").trim() || fallback;
    camera.name = makeUniqueLabel(current, camera.id);
  });
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
  return state.cameras.find((c) => c.id === state.selectedId) || null;
}

function normalizePlan(input) {
  const cameras = Array.isArray(input?.cameras) ? input.cameras : [];
  const normalized = {
    layoutDataUrl: String(input?.layoutDataUrl || ""),
    cameras: cameras.map((c) => ({
      id: Number(c.id) || 0,
      name: String(c.name || ""),
      x: Number(c.x) || 0,
      y: Number(c.y) || 0,
      angle: Number(c.angle) || 0,
      note: String(c.note || ""),
      preview: String(c.preview || ""),
      ip: String(c.ip || ""),
    })),
    selectedId: input?.selectedId == null ? null : Number(input.selectedId),
    nextId: Number(input?.nextId) || Math.max(0, ...cameras.map((c) => Number(c.id) || 0)) + 1,
    cameraSearch: String(input?.cameraSearch || ""),
  };

  state.layoutDataUrl = normalized.layoutDataUrl;
  state.cameras = normalized.cameras;
  state.selectedId = normalized.selectedId;
  state.nextId = normalized.nextId;
  state.cameraSearch = normalized.cameraSearch;
  enforceUniqueLabels();
}

function toPlanPayload() {
  return {
    layoutDataUrl: state.layoutDataUrl,
    cameras: state.cameras.map((c) => ({
      id: c.id,
      name: c.name,
      x: c.x,
      y: c.y,
      angle: c.angle,
      note: c.note,
      preview: c.preview,
      ip: c.ip || "",
    })),
    selectedId: state.selectedId,
    nextId: state.nextId,
    cameraSearch: state.cameraSearch,
  };
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
  state.selectedId = id;
  render();
  scheduleSave();
}

function addCamera(xPercent, yPercent) {
  const defaultName = makeUniqueLabel(`CAM-${String(state.nextId).padStart(2, "0")}`);
  const cam = {
    id: state.nextId++,
    name: defaultName,
    x: xPercent,
    y: yPercent,
    angle: 0,
    note: "",
    preview: "",
    ip: "",
  };
  state.cameras.push(cam);
  state.selectedId = cam.id;
  render();
  scheduleSave();
}

function removeSelectedCamera() {
  if (!state.selectedId) return;
  delete pingStatus[state.selectedId];
  state.cameras = state.cameras.filter((c) => c.id !== state.selectedId);
  state.selectedId = state.cameras[0]?.id || null;
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
      normalizePlan(JSON.parse(String(reader.result || "")));
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
  state.layoutDataUrl = "";
  state.cameras = [];
  state.selectedId = null;
  state.nextId = 1;
  state.cameraSearch = "";
  render();
  scheduleSave();
}

async function exportPng() {
  if (!state.layoutDataUrl) {
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
      img.src = state.layoutDataUrl;
    });

    const W = img.naturalWidth;
    const H = img.naturalHeight;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(img, 0, 0, W, H);

    state.cameras.forEach((cam) => {
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
    a.download = `cctv-plan-${new Date().toISOString().slice(0, 10)}.png`;
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
      <p class="hover-angle">Direction: ${camera.angle}°</p>
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
  const previewItems = state.cameras
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

  const targets = state.cameras.filter((c) => isValidIpv4(c.ip));
  if (!targets.length) {
    alert("Masukkan minimal 1 IP camera yang valid (format: 192.168.1.10) sebelum Start Monitoring.");
    return;
  }

  Object.keys(pingStatus).forEach((k) => delete pingStatus[k]);
  targets.forEach((c) => {
    pingStatus[c.id] = "pending";
  });
  pingActive = true;
  updatePingToggleBtn();
  renderMarkers();
  renderCameraList();

  _pingEventSource = new EventSource("/api/ping-live");

  _pingEventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (typeof data.id !== "undefined") {
        pingStatus[data.id] = data.alive ? "alive" : "dead";
        renderMarkers();
        renderCameraList();
      }
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
  _drag = {
    cameraId: camera.id,
    stageRect: rect,
    moved: false,
  };

  function onMove(e) {
    if (!_drag) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = ((clientX - _drag.stageRect.left) / _drag.stageRect.width) * 100;
    const y = ((clientY - _drag.stageRect.top) / _drag.stageRect.height) * 100;

    if (x < 0 || y < 0 || x > 100 || y > 100) return;

    const cam = state.cameras.find((c) => c.id === _drag.cameraId);
    if (!cam) return;
    cam.x = Number(x.toFixed(2));
    cam.y = Number(y.toFixed(2));
    _drag.moved = true;
    renderMarkers();
  }

  function onUp() {
    if (_drag?.moved) {
      state.selectedId = _drag.cameraId;
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

function renderMarkers() {
  markerLayer.innerHTML = "";

  state.cameras.forEach((cam) => {
    const marker = document.createElement("button");
    marker.type = "button";
    const ps = pingStatus[cam.id];
    const pingClass = ps === "alive" ? " ping-alive" : ps === "dead" ? " ping-dead" : ps === "pending" ? " ping-pending" : "";
    marker.className = `marker${cam.id === state.selectedId ? " selected" : ""}${pingClass}`;
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
  if (!state.cameras.length) {
    cameraList.innerHTML = `<p class="muted">No camera points yet.</p>`;
    return;
  }

  const sortedCameras = [...state.cameras].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base", numeric: true })
  );
  const searchQuery = normalizeLabel(state.cameraSearch);
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
    item.className = `camera-item${cam.id === state.selectedId ? " active" : ""}`;
    const ps = pingStatus[cam.id];
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
  if (!state.layoutDataUrl) {
    layoutImage.style.display = "none";
    emptyState.classList.remove("hidden");
    return;
  }
  layoutImage.src = state.layoutDataUrl;
  layoutImage.style.display = "block";
  emptyState.classList.add("hidden");
}

function render() {
  cameraSearchInput.value = state.cameraSearch;
  renderLayout();
  renderMarkers();
  renderCameraList();
  renderEditor();
}

layoutInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const uploadedPath = await uploadImageFile(file);
    state.layoutDataUrl = uploadedPath;
    render();
    scheduleSave();
  } catch (err) {
    try {
      const localDataUrl = await readFileAsDataUrl(file);
      state.layoutDataUrl = localDataUrl;
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

stage.addEventListener("click", (e) => {
  if (!state.layoutDataUrl) return;
  if (e.target instanceof HTMLElement && e.target.classList.contains("marker")) return;
  if (_drag?.moved) return;

  const rect = stage.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  if (x < 0 || y < 0 || x > 100 || y > 100) return;

  addCamera(Number(x.toFixed(2)), Number(y.toFixed(2)));
});

nameInput.addEventListener("input", () => {
  const selected = getSelectedCamera();
  if (!selected) return;

  const nextLabel = nameInput.value.trim();
  if (!nextLabel) {
    setNameError("Label is required.");
    return;
  }

  if (hasDuplicateLabel(nextLabel, selected.id)) {
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
  state.cameraSearch = e.target.value || "";
  renderCameraList();
  scheduleSave();
});

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
