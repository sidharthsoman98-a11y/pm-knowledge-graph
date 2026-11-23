# The build prompt

This is the prompt that produced this project. Use it to rebuild from scratch in Claude Code, or to brief a later session that extends the site. It fits in one session; a second session is only needed for extensions.

**How to run it**: open Claude Code in an empty folder, copy the original artifact folder into `./source/`, then paste everything below the line.

---

You are building a static website that reorganises an existing teaching resource. The source is in `./source/`: a downloaded copy of the claude.ai artifact "The Product Management Knowledge Graph" by Chandrashekhar V (CC BY-NC-SA 4.0).

## Hard rule

Reorganise, never rewrite. Every sentence a learner reads must come from the source files. You may add only navigation labels, headings for groupings that already exist in the data, and interface text. Do not summarise, paraphrase, expand or "improve" any content. Do not add topics, links or claims that are not in the source. If something in the source looks wrong, leave it and mention it in your final report.

## Source anatomy (verify each point before relying on it)

- `practitioner.html` contains `const DATA = {...}`: the master graph. Keys: `domains` (12, each with a `narrative`), `modules` (49: desc, pedagogy, programmes, readings, lens, spine, ai_level, ai_note, pillars), `topics` (1,046: id, module, title, q, obj, prereqs, rel[{p,t,why}], sessions, depth, owner, level), `rel_names`, `lenses`, `spine`, `programmes` (50), `pathways` (4), `sessionTopics` and `sessionTitles` (10 ISB sessions), `questions`, `ai_competencies`, `primer`, `ai_lens`, `pillars`, `author_note`, `ai_threads` (2), `actions` (the four formats with persona, brief and word count), `bundleMap` (`exp20-<id>` → page key).
- `beginner.html` has the same blob for the 471-topic Beginner edition. A few topics have simpler prerequisites there.
- `b/*.json` are bundles: objects mapping page keys such as `exp20v2-val.kill` to complete, self-contained HTML pages (inline CSS, inline SVG, tables, no scripts). 1,715 pages across 472 topics. Files with `~2` in the name are just extra bundles, not duplicates.
- `index.html` is the front page: version line ("Version 20 · Last updated 26 October 2026"), about text, licence. It also contains telemetry that calls `window.claude`; drop that.
- Meanings from the original code: owner S = "Sessions 1–5", R = "Sessions 6–10", both = "Both halves", none = "Beyond the ISB course"; depth core = "Taught and practised in class", touch = "Touched briefly in class", art = graded deliverable (an encompassing node). "Unlocks" lists exclude `art` topics.

## Architecture

- Node 20, ES modules. Dependencies: cheerio, postcss, dagre, pagefind, adm-zip. No front-end framework: plain HTML pages, one CSS file, one JS file. Every page must work without JavaScript; JS only enhances.
- `scripts/lib/source.mjs` loads and validates the source (extract `DATA` with a brace-depth parser, merge bundles, parse the version line, compute a content hash).
- `scripts/build.mjs` writes `dist/`. Directory-style URLs:
  `/` · `/course/` and `/course/s1/`…`/s10/` · `/domains/` · `/d/<domain>/` · `/m/<module>/` · `/t/<topic>/` · `/t/<topic>/<exp20|exp40|case20|case40>/` · `/paths/<slug>/` · `/about/` · `/search/` · `/me/` · `/changes/` · `/original/` (the source copied verbatim) · `/version.json` · `/data/search.json` · `/data/actions.json` · `/data/graph.json` · `sw.js` · `manifest.webmanifest` · `404.html`.
- Reading pages: parse each bundled page with cheerio, keep its body unchanged, give each `h2` an id for the table of contents, and scope its CSS with postcss by prefixing every selector with `.rd` (rewrite `html`, `body` and `:root` to `.rd`; leave keyframes alone; drop `@import` and `@font-face`). Render inside `<article class="rd" data-pagefind-body>` so it keeps its original look without leaking into the site.
- Formats with no page: show the original's four-part editable prompt (Role, Topic context, What to write, Output format), composed exactly like the source's `promptParts()`: the persona in quotes, the context block, the brief with `{RAB}` replaced by related topic titles, the output contract. Compose it client-side from `/data/actions.json` plus a small JSON block of topic context, so 2,400 prompt pages stay small.
- Order topics everywhere with a stable topological sort (prerequisites within the set first, ties by source order).
- Dependency maps: draw them at build time as SVG with dagre (modules and sessions), plus a three-column "builds on → topic → unlocks" SVG on each topic page. No client-side graph library.
- Search: a ⌘K quick-find palette over a compact topic index (title, question, module, objective, formats), and Pagefind full-text search with filters (Format, Domain, Module, Edition) declared in hidden spans outside the indexed body.

## Information architecture and UX

Follow Nielsen's heuristics and progressive disclosure: recognition over recall, visible system status, consistency, user control.

- Global header: brand, primary nav (Home, ISB course, Domains, Paths, Search, My learning), quick-find button, Beginner/All toggle, theme toggle; breadcrumbs on every inner page (Domains › Domain › Module › Topic › Format).
- Home: what this is and who made it (version and date), a large search box, "pick up where you left off", three entry cards (ISB course, domains, guided paths), the four formats explained with `actions[].name` and `.short`, the primer topics, a compact map of every domain and module.
- Course: sessions with topic counts and coverage, plus the seven graded deliverables. Session page: topics in learning order with module labels, a dependency map, previous/next session.
- Domain page: the author's narrative, then module cards. Module page: topics in learning order, dependency map, and a sidebar with AI impact and note, pedagogy and programmes, recommended reading, lens, spine and pillars.
- Topic page: title, question (large), learning objective, badges (edition, sessions, course depth, owner, AI impact), Mark as understood, Bookmark, four format cards (with minutes, word count and, for cases, the case's own title), the neighbourhood SVG, Builds on (with typed relation and the "why" text), Unlocks, Feeds graded deliverables, private notes, previous/next in module.
- Reading page: format tabs, sticky table of contents with scroll-spy, a top progress bar, text-size control, Mark as read (set automatically after 45 seconds and 92% scroll), previous/next topic, print stylesheet.
- Paths: primer; both AI threads; ten decision questions; ten AI competencies; four sequencing pathways (as module sequences); the author's three traits with his note; the AI lens (modules grouped high, medium, low with notes).
- About: the original front page rendered verbatim (scoped CSS, telemetry removed, links rewired), then lenses, edge types with counts, the 50-programme benchmark table, licence.
- My learning: counts, bookmarks, notes, history, export/import/reset.

Visual design: the original palette (paper #F5F6F3, ink #1B222B, green #2F8C6A, blue #4A5BB8, ochre #B7862A) with a dark theme; system fonts only, so it works offline; per-module hues as in the original (`base[domain] + index × 23`); explainers in greens, cases in blues; generous whitespace; 44 px touch targets on mobile.

## Storage and offline

- Progress in `localStorage` under one versioned key: read, done, bookmarks, notes, history, preferences. Sync across tabs with the `storage` event. Show a toast if storage is full.
- Service worker: precache the shell; stale-while-revalidate for pages, data and the search index; an offline fallback page; never cache `/original/` or `/version.json`. "Save for offline" buttons on modules and sessions add every page of that set to the cache.
- Host headers: immutable caching for versioned assets, `no-cache` for `sw.js` and `version.json`, basic security headers. Ship `netlify.toml`, `vercel.json` and a `_headers` file.

## Updating from the source

- `scripts/sync.mjs <folder-or-zip>`: find the folder containing `practitioner.html` and `b/`, compare its content hash with `./source`, and if it differs, compute a structured diff (topics added, removed and edited by field; modules added, removed and edited; reading pages added, removed and rewritten, by hash; other sections edited). Append it to `data/changelog.json`, replace `./source` atomically, rebuild. `--baseline` records the first entry. Do nothing when there is no change.
- `scripts/fetch-source.mjs`: when `SOURCE_ZIP_URL` is set, download the zip and run sync; otherwise exit 0 with an explanation.
- `.github/workflows/sync.yml`: on push, on a daily schedule and on manual dispatch with an optional zip URL, build, verify, and commit `source/` and `data/` if they changed.
- Be honest about the limit: claude.ai artifacts sit behind a Cloudflare browser challenge, so no server-side cron can read them. Before claiming otherwise, check with `curl` against `https://claude.ai/api/frame/<uuid>`. Detection works through a real browser, for example a scheduled Claude task that reads the version line.

## Verification (must pass before you report done)

`scripts/verify.mjs` must confirm:
1. every topic has a page showing its title, question, objective and every prerequisite with its reason;
2. every bundled page is published and its normalised text equals the source page's text;
3. every bundled page is reachable from the graph;
4. every session and module page lists all of its topics;
5. every internal `href` and `src` resolves.

Then screenshot the home page, a topic page, a reading page, a prompt page, the quick-find palette, search results, dark mode and a 390 px phone view with Playwright, and fix anything broken.

## Report

Finish with: what was built, the verification counts, the deploy steps (Netlify Drop of `dist/`, or Git with Netlify or Vercel; note Vercel Hobby's 100 MB CLI upload cap and `INCLUDE_ORIGINAL=0`), the update routine, and anything in the source that looked inconsistent.


---

## Version 2: the learning layer

A second session added the learning loop on top of the reader: a single ordered path, lessons (predict → read in sections → recall → case with the note folded → depth pass), spaced review, a dashboard and readiness cues. The reasoning, the evidence and the rules for future changes are in `DESIGN.md`. A session extending the platform should read `DESIGN.md` first, keep its integrity rules, and extend `scripts/verify.mjs` for anything new.
