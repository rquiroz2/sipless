import express from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "sipless-data.json");

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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3003, "0.0.0.0", () => console.log("Sipless data server on http://localhost:3003"));
