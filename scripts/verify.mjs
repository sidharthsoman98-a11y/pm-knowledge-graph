#!/usr/bin/env node
// Checks the built site against the source: nothing dropped, nothing altered, no broken links.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { loadSource } from './lib/source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const src = loadSource(path.join(ROOT, 'source'));
const D = src.data; const fails = []; const ok = {};
const bump = k => ok[k] = (ok[k] || 0) + 1;
const norm = s => s.replace(/\s+/g, ' ').trim();
const read = rel => { const p = path.join(OUT, rel); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };

// 1. every topic has a hub showing its title, question, objective and every prerequisite
for (const t of D.topics) {
  const h = read(`t/${t.id}/index.html`);
  if (!h) { fails.push(`missing hub ${t.id}`); continue; }
  const $ = cheerio.load(h); const txt = norm($('main').text());
  for (const [f, v] of [['title', t.title], ['q', t.q], ['obj', t.obj]]) if (!txt.includes(norm(v))) fails.push(`hub ${t.id} lacks ${f}`);
  for (const r of t.rel) if (!$(`main a[href="/t/${r.p}/"]`).length || !txt.includes(norm(r.why))) fails.push(`hub ${t.id} lacks prereq ${r.p}`);
  bump('topic hubs');
}
// 2. every bundled page is published with its full text unchanged
const KINDS = ['exp20', 'exp40', 'case20', 'case40'];
const seen = new Set();
for (const t of D.topics) for (const k of KINDS) {
  const key = D.bundleMap[`${k}-${t.id}`]; if (!key || !src.pages.has(key)) continue; seen.add(key);
  const h = read(`t/${t.id}/${k}/index.html`); if (!h) { fails.push(`missing reading ${key}`); continue; }
  const a = cheerio.load(src.pages.get(key)); a('script,style').remove();
  const b = cheerio.load(h);
  if (norm(a('body').text()) !== norm(b('article.rd').text())) fails.push(`text differs ${key}`); else bump('reading pages, text identical to source');
}
for (const k of src.pages.keys()) if (!seen.has(k)) fails.push(`bundled page not reachable from the graph: ${k}`);
// 3. sessions list every session topic
for (const [n, ids] of Object.entries(D.sessionTopics)) {
  const $ = cheerio.load(read(`course/s${n}/index.html`) || '');
  for (const id of ids) if (!$(`.tlist a[href="/t/${id}/"]`).length) fails.push(`session ${n} lacks ${id}`);
  bump('session pages');
}
// 4. modules list every module topic
for (const m of D.modules) {
  const $ = cheerio.load(read(`m/${m.key}/index.html`) || '');
  const ids = D.topics.filter(t => t.module === m.key).map(t => t.id);
  for (const id of ids) if (!$(`.tlist a[href="/t/${id}/"]`).length) fails.push(`module ${m.key} lacks ${id}`);
  bump('module pages');
}
// 5. internal links resolve
const exists = href => {
  const p = decodeURI(href.split('#')[0].split('?')[0]); if (!p) return true;
  const f = path.join(OUT, p); return fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html')));
};
let links = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['original', 'pagefind'].includes(e.name)) walk(p); continue; }
    if (!e.name.endsWith('.html')) continue;
    const h = fs.readFileSync(p, 'utf8');
    for (const m of h.matchAll(/(?:href|src)="(\/[^"]*)"/g)) { links++; if (!exists(m[1]) && !m[1].startsWith('/pagefind/')) fails.push(`broken link ${m[1]} in ${path.relative(OUT, p)}`); }
  }
})(OUT);
ok['internal links checked'] = links;

for (const [k, v] of Object.entries(ok)) console.log(`✓ ${v.toLocaleString()} ${k}`);
if (fails.length) { console.error(`\n✗ ${fails.length} problems:`); fails.slice(0, 40).forEach(f => console.error('  - ' + f)); process.exit(1); }
console.log('\nAll checks passed.');
