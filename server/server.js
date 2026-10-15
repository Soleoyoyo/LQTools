"use strict";

// LQ Hub live Pixel Floor: built-in Node modules only (Node 22+).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const root = path.resolve(__dirname, "..");
const dbPath = process.env.DB_PATH || path.join(__dirname, "floor.sqlite");
const port = Number(process.env.PORT || 3000);
const editorCode = process.env.FLOOR_EDIT_CODE || "";
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS floor_tiles (tile_id TEXT PRIMARY KEY, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS floor_meta (id INTEGER PRIMARY KEY CHECK(id = 1), version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS floor_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  change_count INTEGER NOT NULL,
  details TEXT NOT NULL,
  version INTEGER NOT NULL
);
INSERT OR IGNORE INTO floor_meta (id, version) VALUES (1,0);`);

const tileIds = Array.from({length:18}, (_,r) => Array.from({length:15}, (_,c) => String.fromCharCode(65+c)+(r+1))).flat();
const tileSet = new Set(tileIds);
const statusSet = new Set(["healthy", "poor", "replace", "replaced", "multiple", "replaced-poor", "replaced-replace"]);
const getTile = db.prepare("SELECT status FROM floor_tiles WHERE tile_id=?");
const upsertTile = db.prepare("INSERT INTO floor_tiles(tile_id,status) VALUES(?,?) ON CONFLICT(tile_id) DO UPDATE SET status=excluded.status");
const insertHistory = db.prepare("INSERT INTO floor_updates (author,timestamp,change_count,details,version) VALUES (?,?,?,?,?)");
const incrementVersion = db.prepare("UPDATE floor_meta SET version=version+1 WHERE id=1");
const getVersion = db.prepare("SELECT version FROM floor_meta WHERE id=1");
const getHistory = db.prepare("SELECT id,author,timestamp,change_count,details,version FROM floor_updates ORDER BY id DESC LIMIT ?");
const getTiles = db.prepare("SELECT tile_id,status FROM floor_tiles");

function send(res, status, obj) {
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"});
  res.end(JSON.stringify(obj));
}
function snapshot() {
  const tiles = Object.fromEntries(tileIds.map(id => [id,"healthy"]));
  for (const row of getTiles.all()) tiles[row.tile_id] = row.status;
  return { version: getVersion.get().version, tiles };
}
function history() {
  return getHistory.all(60).map(row => ({...row, changes: JSON.parse(row.details), details: undefined}));
}
function readBody(req) {
  return new Promise((resolve,reject) => {
    let s = "";
    req.on("data", chunk => {
      s += chunk;
      if (s.length > 100000) {reject(new Error("Payload too large")); req.destroy();}
    });
    req.on("end", () => {try {resolve(JSON.parse(s));} catch {reject(new Error("Invalid JSON"));}});
    req.on("error",reject);
  });
}
function safeEqual(a,b) {
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
function saveUpdate(input) {
  const changes = input.changes;
  const name = input.name.trim();
  db.exec("BEGIN IMMEDIATE");
  try {
    const conflicts = [];
    const effective = [];
    for (const change of changes) {
      const actual = getTile.get(change.tile)?.status || "healthy";
      if (actual !== change.from && actual !== change.status) {
        conflicts.push({tile:change.tile, actual, expected:change.from});
      } else if (actual !== change.status) {
        effective.push({tile:change.tile, from:actual, status:change.status});
      }
    }
    if (conflicts.length) {db.exec("ROLLBACK"); return {conflicts};}
    if (effective.length) {
      for (const c of effective) upsertTile.run(c.tile,c.status);
      incrementVersion.run();
      insertHistory.run(name,new Date().toISOString(),effective.length,JSON.stringify(effective),getVersion.get().version);
    }
    db.exec("COMMIT");
    return {effective};
  } catch (e) {db.exec("ROLLBACK"); throw e;}
}
const types = {".html":"text/html", ".css":"text/css", ".js":"application/javascript", ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon", ".woff2":"font/woff2"};

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/api/floor") return send(res,200,snapshot());
  if (req.method === "GET" && url.pathname === "/api/floor/history") return send(res,200,{updates:history()});
  if (req.method === "POST" && url.pathname === "/api/floor/updates") {
    if (editorCode && !safeEqual(String(req.headers["x-floor-edit-code"]||""),editorCode)) return send(res,403,{error:"Incorrect editor access code."});
    let input;
    try {input = await readBody(req);} catch(e) {return send(res,400,{error:e.message});}
    if (!input || typeof input.name !== "string" || input.name.trim().length < 2 || input.name.trim().length > 70)
      return send(res,400,{error:"Enter your name (2–70 characters)."});
    if (!Array.isArray(input.changes) || input.changes.length < 1 || input.changes.length > 270)
      return send(res,400,{error:"Provide 1–270 tile changes."});
    const visited = new Set();
    for (const c of input.changes) {
      if (!c || !tileSet.has(c.tile) || !statusSet.has(c.status) || !statusSet.has(c.from) || visited.has(c.tile))
        return send(res,400,{error:"Invalid or repeated tile change."});
      visited.add(c.tile);
    }
    try {
      const result = saveUpdate(input);
      if (result.conflicts) return send(res,409,{error:"Some tiles were changed by another person.", conflicts:result.conflicts, ...snapshot()});
      return send(res,200,{saved:result.effective.length, ...snapshot()});
    } catch(e) {console.error(e); return send(res,500,{error:"Unable to save floor update."});}
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(res,405,{error:"Method not allowed"});
  const route = url.pathname === "/" ? "/index.html" : url.pathname;
  let decoded;
  try {decoded = decodeURIComponent(route);} catch {return send(res,400,{error:"Invalid path"});}
  const absolute = path.resolve(root,"."+decoded);
  if (!(absolute.startsWith(root+path.sep)) || absolute.includes(`${path.sep}server${path.sep}`)) return send(res,403,{error:"Forbidden"});
  const ext=path.extname(absolute).toLowerCase();
  if (!types[ext]) return send(res,404,{error:"Not found"});
  fs.stat(absolute,(err,stat) => {
    if (err || !stat.isFile()) return send(res,404,{error:"Not found"});
    res.writeHead(200,{"Content-Type":types[ext]+(ext===".html"||ext===".css"||ext===".js"?"; charset=utf-8":""),"X-Content-Type-Options":"nosniff"});
    fs.createReadStream(absolute).pipe(res);
  });
});
server.listen(port, "0.0.0.0", () => console.log(`LQ Hub on http://localhost:${port}`));
