# PM Knowledge Graph — Reader

A reorganised, searchable, offline-capable reader for **The Product Management Knowledge Graph** by Chandrashekhar V (Version 20, 26 October 2026), built automatically from the original artifact's files.

Content © Chandrashekhar V, licensed **CC BY-NC-SA 4.0**. This reader is an adaptation under the same licence: non-commercial use, with credit, shared alike. It adds navigation, search and progress tracking. It does not add, remove or rewrite any content. `npm run verify` checks that claim on every build.

## What is in the folder

| Path | What it is |
|---|---|
| `dist/` | **The finished website.** Deploy this folder. |
| `source/` | The original artifact folder, unchanged (index.html, beginner.html, practitioner.html, `b/` bundles, `img/`, `vendor/`). |
| `scripts/build.mjs` | Turns `source/` into `dist/`. |
| `scripts/sync.mjs` | Pulls in a new copy of the artifact, records what changed, rebuilds. |
| `scripts/verify.mjs` | Checks that every topic, prerequisite and reading page in the source made it into the site, word for word, and that no internal link is broken. |
| `scripts/fetch-source.mjs` | Optional automated pull from a direct zip URL (see "Updates"). |
| `site/` | Stylesheet, client script, service worker, icons. |
| `data/changelog.json` | History of syncs, shown on the site at `/changes/`. |
| `.github/workflows/sync.yml` | Rebuild-and-verify job for GitHub. |
| `netlify.toml`, `vercel.json` | Host configuration. |

## Deploy

### Fastest: Netlify Drop (2 minutes, no account setup beyond sign-in)
1. Go to <https://app.netlify.com/drop>.
2. Drag the **`dist`** folder onto the page.
3. Netlify gives you a URL. Rename the site under *Site configuration → Change site name*.

### Recommended for updates: Git + Netlify (or Vercel)
1. Create a private GitHub repository and push this folder (`dist/` and `node_modules/` are git-ignored).
   ```bash
   git init && git add . && git commit -m "PM Knowledge Graph reader"
   git branch -M main && git remote add origin https://github.com/<you>/pm-knowledge-graph.git && git push -u origin main
   ```
2. **Netlify**: *Add new site → Import an existing project → GitHub →* pick the repo. Build settings are read from `netlify.toml` (`npm run build`, publish `dist`).
   **Vercel**: *Add New → Project →* import the repo. Settings are read from `vercel.json`. Use the Git import, not the CLI: Hobby plans cap CLI uploads at 100 MB, and the built site is about 170 MB with the original map included. To slim it, set the environment variable `INCLUDE_ORIGINAL=0` (drops the 53 MB copy of the original interactive map).
3. Every push to `main` now rebuilds and redeploys.

### Preview locally
```bash
npm install
npm run build      # about 30 seconds
npm run serve      # http://localhost:4321
```

## Updates from the source artifact

**What cannot be automated, and why.** The source lives at `https://claude.ai/artifact/MKCRzLnNkdx1whXTsydcBx`. A server cannot read it: claude.ai answers non-browser requests to its artifact API with a Cloudflare "verify you are human" challenge, and the artifact's files are only served inside a signed browser session. A cron job on Netlify, Vercel or GitHub would fail silently every night, so none is pretended here.

**What is automated.**
1. *Detection*: a weekly Claude scheduled task can open the artifact in a real browser on your Mac, read its "Version N · Last updated" line and tell you when it is newer than the version on your site (`/version.json`).
2. *Everything after the download*: one command imports the new copy, works out exactly what changed, records it on `/changes/`, rebuilds and verifies.

**The update routine (about 3 minutes).**
1. Open the artifact on claude.ai while signed in and download a fresh copy (the same way you got the "(Copy)" folder). Unzip it if it arrives as a zip.
2. In this folder:
   ```bash
   npm run sync -- "~/Downloads/The Product Management Knowledge Graph"
   npm run verify
   git add . && git commit -m "Sync to new source version" && git push
   ```
   If you deploy with Netlify Drop instead of Git, drag the new `dist` folder onto your site's *Deploys* page.
3. `sync` prints a summary such as *"Version 20 → 21. 3 topics added, 0 removed, 5 edited; 12 reading pages added, 4 rewritten, 0 removed."* If nothing changed it says so and does nothing.

**Fully hands-off option.** If the owner, or you, ever publish the artifact folder as a plain downloadable zip (a GitHub release, a Dropbox `?dl=1` link, a Google Drive direct link), add that URL as the repository secret `SOURCE_ZIP_URL`. The GitHub workflow then checks it every day at 07:47 IST, commits any change, and your host redeploys on its own. You can also paste a zip URL into *Actions → Sync source and rebuild → Run workflow* for a one-off import.

## What the reader does

- **Four ways in**: the ISB course (10 sessions plus the 7 graded deliverables), 12 domains and 49 modules, guided paths (the primer, both AI threads, ten decision questions, ten AI competencies, four sequencing pathways, the author's three traits, the AI lens), and search.
- **Learning order everywhere**: every module, session and path lists topics so prerequisites come first, with a dependency map drawn at build time.
- **Topic pages**: the topic's question and learning objective, its edition and course coverage, every prerequisite with the typed reason for the edge, what it unlocks, which graded deliverables it feeds, and the four formats.
- **Reading pages**: each of the 1,715 bundled pages on its own URL, rendered with its original styling, with a table of contents, reading-progress bar, adjustable text size, format tabs and previous/next navigation. Print-friendly.
- **Unwritten formats** show the original map's editable four-part prompt, composed exactly as the source composes it.
- **Find anything**: ⌘K / Ctrl+K quick-find over all 1,046 topics; full-text search over every page with filters for format, domain, module and edition (Pagefind, runs entirely in the browser, no server).
- **Beginner switch**: hides the 575 Practitioner-only topics everywhere.
- **Your progress, stored in your browser**: mark topics understood, mark readings read (automatic when you reach the end), bookmarks, private notes, recent history, progress bars on every module and session, export/import as JSON.
- **Offline**: installable as an app; pages you open are cached; "Save for offline" on any module or session downloads all its pages.
- **The original interactive map** is included unchanged at `/original/`.
- **Light and dark themes**, keyboard navigation, skip link, responsive down to phone width.

## Licence

Content: CC BY-NC-SA 4.0, © Chandrashekhar V. Bundled libraries in `source/vendor`: D3 (ISC) and Dagre (MIT). Reader code: released under the same CC BY-NC-SA 4.0 terms for simplicity.
