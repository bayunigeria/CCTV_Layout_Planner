const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");

const app = express();

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOADS_DIR = path.join(ROOT_DIR, "uploads");
const PLAN_FILE = path.join(DATA_DIR, "plan.json");

const DEFAULT_PLAN = {
  layouts: [
    {
      id: 1,
      name: "Floor 1",
      layoutDataUrl: "",
      cameras: [],
      selectedId: null,
      nextId: 1,
      cameraSearch: "",
    },
  ],
  selectedLayoutId: 1,
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PLAN_FILE)) {
  fs.writeFileSync(PLAN_FILE, JSON.stringify(DEFAULT_PLAN, null, 2));
}

app.use(express.json({ limit: "2mb" }));

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Unsupported file type"));
      return;
    }
    cb(null, true);
  },
});

function sanitizeCamera(c) {
  return {
    id: Number(c?.id) || 0,
    name: String(c?.name || "").trim(),
    x: Number(c?.x) || 0,
    y: Number(c?.y) || 0,
    angle: Number(c?.angle) || 0,
    note: String(c?.note || ""),
    preview: String(c?.preview || ""),
    ip: String(c?.ip || "").trim(),
  };
}

function sanitizeLayout(layout, fallbackId = 1) {
  const cameras = Array.isArray(layout?.cameras)
    ? layout.cameras.filter((c) => c && typeof c === "object").map(sanitizeCamera)
    : [];

  return {
    id: Number(layout?.id) || fallbackId,
    name: String(layout?.name || `Floor ${fallbackId}`).trim() || `Floor ${fallbackId}`,
    layoutDataUrl: String(layout?.layoutDataUrl || ""),
    cameras,
    selectedId: layout?.selectedId == null ? null : Number(layout.selectedId),
    nextId: Number(layout?.nextId) || Math.max(0, ...cameras.map((c) => c.id)) + 1,
    cameraSearch: String(layout?.cameraSearch || ""),
  };
}

function sanitizePlan(input) {
  let layouts = [];

  if (Array.isArray(input?.layouts) && input.layouts.length) {
    layouts = input.layouts
      .filter((l) => l && typeof l === "object")
      .map((layout, i) => sanitizeLayout(layout, i + 1));
  } else {
    // Backward compatibility with single-layout payload.
    layouts = [
      sanitizeLayout(
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
      ),
    ];
  }

  if (!layouts.length) {
    layouts = [...DEFAULT_PLAN.layouts];
  }

  const selectedLayoutId = Number(input?.selectedLayoutId);
  const hasSelected = layouts.some((layout) => layout.id === selectedLayoutId);

  return {
    layouts,
    selectedLayoutId: hasSelected ? selectedLayoutId : layouts[0].id,
  };
}

app.get("/api/plan", (_req, res) => {
  try {
    const raw = fs.readFileSync(PLAN_FILE, "utf8");
    const parsed = JSON.parse(raw);
    res.json(sanitizePlan(parsed));
  } catch {
    res.json(DEFAULT_PLAN);
  }
});

app.put("/api/plan", (req, res) => {
  try {
    const sanitized = sanitizePlan(req.body || {});
    fs.writeFileSync(PLAN_FILE, JSON.stringify(sanitized, null, 2));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to save plan" });
  }
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, message: "No file uploaded" });
    return;
  }
  res.json({
    ok: true,
    path: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
  });
});

function isValidIp(ip) {
  if (typeof ip !== "string") return false;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function pingHost(ip) {
  return new Promise((resolve) => {
    const cmd =
      process.platform === "win32"
        ? `ping -n 1 -w 1000 ${ip}`
        : `ping -c 1 -W 1 ${ip}`;
    exec(cmd, { timeout: 3500 }, (error, stdout) => {
      resolve(!error && /ttl=/i.test(stdout));
    });
  });
}

app.get("/api/ping-live", (req, res) => {
  const requestedLayoutId = Number(req.query.layoutId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let active = true;

  const pingCycle = async () => {
    if (!active) return;

    let targets = [];
    let activeLayoutId = requestedLayoutId;

    try {
      const raw = fs.readFileSync(PLAN_FILE, "utf8");
      const plan = sanitizePlan(JSON.parse(raw));
      const layout =
        plan.layouts.find((l) => l.id === requestedLayoutId) ||
        plan.layouts.find((l) => l.id === plan.selectedLayoutId) ||
        plan.layouts[0];

      if (layout) {
        activeLayoutId = layout.id;
        targets = (Array.isArray(layout.cameras) ? layout.cameras : []).filter(
          (c) => c.ip && isValidIp(String(c.ip))
        );
      }
    } catch {
      // plan unreadable – try again next cycle
    }

    if (targets.length === 0) {
      if (active) {
        res.write(`data: ${JSON.stringify({ type: "idle", layoutId: activeLayoutId || null })}\n\n`);
      }
    } else {
      await Promise.all(
        targets.map(async (cam) => {
          const alive = await pingHost(String(cam.ip));
          if (active) {
            res.write(`data: ${JSON.stringify({ layoutId: activeLayoutId, id: cam.id, alive })}\n\n`);
          }
        })
      );
    }

    if (active) setTimeout(pingCycle, 1500);
  };

  pingCycle();

  req.on("close", () => {
    active = false;
  });
});

app.use("/uploads", express.static(UPLOADS_DIR, { index: false }));
app.get("/display", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "display.html"));
});

app.use(express.static(ROOT_DIR, { index: ["index.html"] }));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ ok: false, message: err.message });
    return;
  }
  if (err) {
    res.status(400).json({ ok: false, message: err.message || "Upload error" });
    return;
  }
  res.status(500).json({ ok: false, message: "Unexpected error" });
});

app.listen(PORT, HOST, () => {
  console.log(`CAMS server running on http://${HOST}:${PORT}`);
});
