# LQ Hub

Static website for GitHub Pages, with four tools and an Instructions section.

Start with `index.html`. See **SETUP-GITHUB-PAGES.md** to activate the shared Pixel Floor Chart using Supabase.

The Pixel Floor Chart cannot become shared/live until you create the Supabase project, run `supabase-setup.sql`, and fill in `assets/js/floor-config.js`. No Node server is needed on GitHub Pages.

The Average Ticket Payout Calculator exports an actual downloadable PDF on desktop and mobile, containing every recorded play.

## Connection warning update

Pixel Floor Chart now shows **Server unreachable — changes will not be saved.** when Supabase cannot be contacted or its connection details are missing. The old setup-specific warning has been removed. The warning disappears when a refresh succeeds; the page retries every 10 seconds and offers a Retry connection button. Previously loaded floor tiles can still be edited offline as local **unpublished drafts**, but Publish stays disabled until reconnection. Reloading the page while offline will discard those drafts.

**Deployment:** If your GitHub Pages version already has working Supabase values in `assets/js/floor-config.js`, keep that existing configured file when uploading this update. The packaged configuration contains placeholders only; do not replace your working settings with it.
