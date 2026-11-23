# PM Knowledge Graph — Reader

A learning platform built on **The Product Management Knowledge Graph** by Chandrashekhar V (Version 20, 26 October 2026), built automatically from the original artifact's files.

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

See `DESIGN.md` for the reasoning and the research behind each choice.

- **Today**: your next lesson and its steps, reviews due, progress per stage with time left at your daily goal, and minutes studied this week.
- **Learn**: one ordered path through all 472 topics that have readings, prerequisites first.
  - *Complete mastery*: Foundations (376 Beginner lessons), then Depth (Exp40 and Case40 for each, plus the Practitioner-only topics).
  - *ISB course order*: Sessions 1–10, then a depth pass.
  - The next lesson is always marked.
- **A lesson**: predict → read Exp20 one section at a time → recall from memory and self-check → work Case20, with its teaching note folded until you have answered → on the second pass, Exp40 and Case40. A path bar and side rail on every step say where you are and what comes next.
- **Review**: spaced retrieval practice.
  - Topic cards (the question, checked against the objective and the explainer's outline) and connection cards (why one topic builds on another, checked against the source's own reason).
  - Mixed across modules. Mastered means recalled after at least three weeks.
- **Browse**: the ISB course (sessions plus graded deliverables), 12 domains and 49 modules with dependency maps, the curated sequences, the about page and the original interactive graph.
- **Search**: ⌘K / Ctrl+K quick-find over all topics, plus full-text search over every page (Pagefind, runs in the browser).
- **Me**: lessons learned and mastered, topics you keep forgetting, bookmarks, notes, history, and export/import/reset of progress.
- **Also**: offline reading and an installable app, light and dark themes, a Beginner-only filter, a print stylesheet, and layouts down to phone width.
- **Content**: the 574 topics without readings stay visible as outline-only entries. Every reading page is the author's text unchanged; `npm run verify` checks this.

## Updating GitHub from this folder (no git needed)

Your local folder is not a git repository, because the first version was uploaded through the browser. To publish changes:
1. Open the repository on github.com and choose **Add file → Upload files**.
2. Drag in the changed files or folders from Finder. Folders keep their structure, and files with the same path are replaced.
3. Commit to `main`. Vercel rebuilds and redeploys automatically.

The browser upload skips files whose names start with a dot (`.gitignore`, `.github/`), so the GitHub Actions workflow is not in the repository. It is optional. To have git handle this instead, install GitHub Desktop, clone the repository, copy this folder's contents into the clone, then commit and push.

## Licence

Content: CC BY-NC-SA 4.0, © Chandrashekhar V. Bundled libraries in `source/vendor`: D3 (ISC) and Dagre (MIT). Reader code: released under the same CC BY-NC-SA 4.0 terms for simplicity.
