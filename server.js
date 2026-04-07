const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOADS_DIR = path.join(ROOT_DIR, "uploads");
const PLAN_FILE = path.join(DATA_DIR, "plan.json");

const DEFAULT_PLAN = {
  layoutDataUrl: "",
  cameras: [],
  selectedId: null,
  nextId: 1,
  cameraSearch: "",
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

function sanitizePlan(input) {
  const cameras = Array.isArray(input?.cameras)
    ? input.cameras
        .filter((c) => c && typeof c === "object")
        .map((c) => ({
          id: Number(c.id) || 0,
          name: String(c.name || "").trim(),
          x: Number(c.x) || 0,
          y: Number(c.y) || 0,
          angle: Number(c.angle) || 0,
          note: String(c.note || ""),
          preview: String(c.preview || ""),
        }))
    : [];

  return {
    layoutDataUrl: String(input?.layoutDataUrl || ""),
    cameras,
    selectedId: input?.selectedId == null ? null : Number(input.selectedId),
    nextId: Number(input?.nextId) || Math.max(0, ...cameras.map((c) => c.id)) + 1,
    cameraSearch: String(input?.cameraSearch || ""),
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

app.use("/uploads", express.static(UPLOADS_DIR, { index: false }));
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
