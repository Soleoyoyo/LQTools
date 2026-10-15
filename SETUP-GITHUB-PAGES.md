# LQ Hub — GitHub Pages & shared Pixel Floor setup

## Why the previous server didn't work

GitHub Pages serves **static files only** (HTML/CSS/JavaScript). It cannot run `server/server.js`, Node.js, or SQLite. Merely uploading those files to a GitHub repository cannot activate an API or a shared database.

This version uses **Supabase**, a hosted PostgreSQL database accessed directly from the website over HTTPS. All 270 floor tiles and the timestamped history are stored centrally. There is no Node server to deploy.

## Set up the shared floor (required, approximately 10 minutes)

1. Create a Supabase project at https://supabase.com/ and keep its database password private.
2. Open **SQL Editor** in the project dashboard. Copy all of `supabase-setup.sql`, run it once, and check that it succeeds. This creates `floor_state`, `floor_updates`, and the `publish_floor_update` function.
3. Go to **Project Settings → API Keys** (the dashboard wording may vary) and find the **Project URL** and your **publishable / anon key**. Do **not** use a `service_role` or secret key.
4. Edit `assets/js/floor-config.js`:

   ```js
   window.LQ_FLOOR_CONFIG = {
       supabaseUrl: "https://YOURPROJECT.supabase.co",
       supabaseAnonKey: "sb_publishable_YOUR_PUBLIC_KEY"
   };
   ```

   Legacy Supabase `anon` keys also work. Both the project URL and the *publishable/anon key* are intentionally visible to site visitors; security is enforced by database permissions. **Never publish a service_role/secret key**.
5. Upload the entire site's files and folders to your GitHub repository (including `assets/`, `index.html`, etc.). The `supabase-setup.sql` file may stay in the repository since it has no secrets.
6. In GitHub repository **Settings → Pages**, choose **Deploy from a branch**, select your default branch and `/ (root)`, then save. Open the published HTTPS Pages URL, navigate to LQ Tools → Pixel Floor Chart, and click **Refresh**.
7. Publish one small change with your name, then open the page on a second device. The other device should show the new status, and the history should list the submitted change.

The floor auto-refreshes around every 10 seconds. People may draft local changes without publishing them. If someone edits the same tile before you publish, the save is rejected rather than silently overwriting their update; refresh and review the draft.

## Important security limitations

**By design, this version permits anyone who can access the website to submit a floor update by entering a name.** A typed name is not proof of identity. GitHub Pages sites are generally public, and the Supabase *publishable* key is public as well. If staff-only access or reliable attribution is important, implement Supabase Auth for employee sign-in and change the SQL permissions / function accordingly before distributing the site. Do not treat an access-code field on a public static site as a secret.

The database retains every update history entry, though the website fetches the latest 60. Back up the Supabase database and review your project usage limits.

## PDF export on mobile

The Average Ticket Payout page now generates a **real multipage PDF file in JavaScript** without calling `window.print()`, using the included `assets/js/pdf-download.js` file. After entering a game name, play price and all ticket results, tap **Export Findings as PDF**. On most mobile browsers the file appears in Downloads; on iPhone/Safari it may open a preview or be available through the browser's Downloads menu / Share → Save to Files.

Because the generator is bundled, it works with or without internet access once the site loads. There is no external PDF service and no player data is uploaded.

## File structure

- `index.html` — homepage
- `lq-tools.html` — navigation to all four tools
- `average-ticket-payout.html` — ticket tester and mobile PDF export
- `pixel-floor.html` — shared status grid and named update history
- `assets/js/pdf-download.js` — dependency-free multipage PDF builder
- `assets/js/floor-config.js` — **configure Supabase URL and public key**
- `assets/js/pixel-floor.js` — loads/saves floor state through Supabase REST
- `supabase-setup.sql` — initialise database and atomic publishing RPC

All other calculators and styles are preserved.
