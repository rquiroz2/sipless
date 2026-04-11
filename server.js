import express from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { copyFile, readdir, unlink, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "sipless-data.json");

const BACKUP_DIR = "C:\\Users\\rquir\\OneDrive\\Documents\\GithubData\\sipless";
const MAX_BACKUPS = 5;

async function backupData() {
  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await copyFile(DATA_FILE, join(BACKUP_DIR, `sipless-data.${timestamp}.json`));
    const files = (await readdir(BACKUP_DIR))
      .filter(f => f.startsWith("sipless-data.") && f.endsWith(".json"))
      .sort();
    while (files.length > MAX_BACKUPS) {
      await unlink(join(BACKUP_DIR, files.shift()));
    }
  } catch (e) {
    console.error("[backup] silent failure:", e.message);
  }
}

const app = express();
app.use(express.json());

app.get("/api/data", (_req, res) => {
  if (!existsSync(DATA_FILE)) return res.json({});
  try {
    res.json(JSON.parse(readFileSync(DATA_FILE, "utf8")));
  } catch {
    res.json({});
  }
});

app.post("/api/data", (req, res) => {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
    backupData(); // fire-and-forget: response already sent, runs in background
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3003, "0.0.0.0", () => console.log("Sipless data server on http://localhost:3003"));
