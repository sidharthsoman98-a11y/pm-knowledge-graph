#!/usr/bin/env node
// Automated pull for the scheduled GitHub Action.
//
// The source artifact (claude.ai/artifact/…) cannot be downloaded by a server: claude.ai's
// frame API sits behind a Cloudflare browser challenge and the files are only served to a
// signed browser session. So this script only runs when SOURCE_ZIP_URL points at a plain,
// publicly downloadable zip of the artifact folder (for example a GitHub release, a Google
// Drive direct link or a Dropbox ?dl=1 link the owner or you maintain). Without it the script
// exits cleanly and the workflow does nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const url = process.env.SOURCE_ZIP_URL;
if (!url) { console.log('SOURCE_ZIP_URL is not set — nothing to fetch. Use `npm run sync -- <folder-or-zip>` after downloading a new copy.'); process.exit(0); }
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) { console.error(`Download failed: HTTP ${res.status}`); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
if (buf.subarray(0, 2).toString() !== 'PK') { console.error('SOURCE_ZIP_URL did not return a zip file.'); process.exit(1); }
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pmkg-dl-')), 'source.zip');
fs.writeFileSync(file, buf);
const r = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), 'sync.mjs'), file, '--no-build'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
