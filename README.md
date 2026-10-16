# LQ Hub — Pixel Floor connection fix and prize quantities

Open `index.html` after deploying on GitHub Pages.

## IMPORTANT: Keep your working Supabase configuration

**This ZIP intentionally does not contain `assets/js/floor-config.js`.**
It contains `assets/js/floor-config.example.js` as a reference only.

If your GitHub repo already has a working `assets/js/floor-config.js`, **do not delete or replace it**.
Upload the updated pages and assets without deleting the existing file. GitHub Pages will use that existing configuration.

If your site still shows “Server unreachable”, open `https://YOUR_GITHUB_PAGES_SITE/assets/js/floor-config.js` (adjust for your repository path) and check that it serves your configured file, not placeholder values. Check the browser Console for `Pixel Floor connection failed:` messages. Do not share passwords or secret/service-role keys.

If you replaced your working configuration in a previous upload, restore it from your GitHub commit history, or recreate it using your existing Supabase project URL and *publishable* key. Both values must be quoted strings.

## Game Settings Calculator: multiple identical prizes

Each prize now has a **Quantity Loaded** field. Leaving it blank means 1. The combined vending price is `sum(vending price × quantity)` for each entry. The existing VIP play price, payout multiplier and 0.30 rounding policy are unchanged.

Examples:
- 3 items at $9.00 and 2 items at $4.00 = $35.00 combined vending price.
- Price of play $3.00 and desired payout 30% -> raw setting 43.2099... -> final setting 43.

## Files changed

- `game-settings.html`
- `assets/js/calculator.js`
- `assets/css/calculator.css`
- `assets/js/pixel-floor.js`
- `README.md`

Everything else remains part of the website, including PDF export and all four tools.

The Pixel Floor still needs an existing, correctly configured Supabase project and a working `assets/js/floor-config.js` in the deployed repository. Local standalone HTML files do not provide a shared database.
