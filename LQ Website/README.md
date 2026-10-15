# LQ Hub — shared Pixel Floor Chart

This version adds a **shared database-backed floor chart** and update history. Other LQ tools remain included.

## Requirements
- Node.js **22.13+** (the server uses the built-in `node:sqlite` module)
- A computer/server that stays online and has **persistent storage** for the SQLite database.

## Run locally

From the project folder:

```bash
node server/server.js
```

Visit `http://localhost:3000/index.html` and select **LQ Tools → Pixel Floor Chart**.

**Do not double-click the HTML file** for the live chart: it needs an HTTP server.

## Host online

Run the Node server on a host that supports persistent disk storage and exposes a public HTTPS URL. Point the domain to the server using the hosting provider's instructions. The database is written to `server/floor.sqlite` by default. Mount a persistent volume and set `DB_PATH` to a path on that volume to avoid losing the floor and audit log during redeploys. Set `PORT` if your host requires a specific port.

Optionally (recommended), set the environment variable `FLOOR_EDIT_CODE` to a private shared editor code. Visitors can still read the chart and audit history without the code, but publishing changes requires the code. This is shared-secret protection, not individual user authentication. The entered name is self-reported and **not verified**; for reliable attribution and access control, a proper employee login is the next step.

For example:

```bash
FLOOR_EDIT_CODE='your-private-code' PORT=3000 node server/server.js
```

The browser offers a code field if a publish attempt is rejected. Avoid using an easy-to-guess code; deploy behind HTTPS. Do not commit any access code into frontend files.

## Workflow
1. Anyone loads the webpage and sees the server's saved floor (15×18, 270 tiles).
2. Clicking a tile changes a **local draft** (dashed outline), not the published chart.
3. Enter a name, then click **Publish floor update**.
4. The server checks for conflicting edits, applies the changes transactionally and records each previous/new tile condition, author name and timestamp.
5. Other open browsers refresh their view within approximately 10 seconds. The **Refresh** button loads changes immediately.
6. The update history shows the most recent 60 submissions, including per-tile details. Older entries remain in the SQLite database.

**Conflict behaviour:** If another person changes the same tile before you publish, your entire submission is rejected. The draft stays on screen so you can review and refresh without losing what you typed.

**Important:** Publishing is not secure by employee name alone. Set an editor code or add authenticated accounts before making the site publicly editable. Also back up the SQLite database regularly and restrict who can access the database file.

## Files
- `pixel-floor.html` — floor chart, submit controls and history list
- `assets/css/pixel-floor.css` — tile styling, draft indicators and publishing UI
- `assets/js/pixel-floor.js` — draft editing, refresh, publishing and history
- `server/server.js` — HTTP server, SQLite persistence and update API

Other calculators work unchanged.
