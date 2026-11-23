#!/usr/bin/env node
// Pull a new copy of the original artifact into ./source, record what changed, rebuild.
//
//   npm run sync -- "/path/to/The Product Management Knowledge Graph"      (a folder)
//   npm run sync -- ~/Downloads/pm-knowledge-graph.zip                      (a zip)
//   npm run sync -- --baseline        record the current ./source as the first change-log entry
//
// Flags: --no-build (skip the rebuild), --force (record and rebuild even if nothing changed)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { loadSource, pageHash } from './lib/source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'source');
const LOG = path.join(ROOT, 'data/changelog.json');
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const input = args.find(a => !a.startsWith('--'));
const today = new Date().toISOString().slice(0, 10);
const readLog = () => fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, 'utf8')) : [];
const writeLog = l => { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, JSON.stringify(l, null, 2) + '\n'); };

function findRoot(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, 'practitioner.html')) && fs.existsSync(path.join(dir, 'b'))) return dir;
  if (depth > 3) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('__MACOSX') && !e.name.startsWith('.')) { const r = findRoot(path.join(dir, e.name), depth + 1); if (r) return r; }
  return null;
}

function summarise(oldS, newS) {
  const sections = [];
  const add = (label, items) => items.length && sections.push({ label, items });
  const oT = Object.fromEntries(oldS.data.topics.map(t => [t.id, t])), nT = Object.fromEntries(newS.data.topics.map(t => [t.id, t]));
  add('Topics added', Object.keys(nT).filter(id => !oT[id]).map(id => ({ id, text: nT[id].title })));
  add('Topics removed', Object.keys(oT).filter(id => !nT[id]).map(id => ({ text: `${oT[id].title} (${id})` })));
  const fields = { title: 'title', obj: 'objective', q: 'question', prereqs: 'prerequisites', module: 'module', level: 'edition', sessions: 'sessions', depth: 'course depth' };
  const changed = [];
  for (const id of Object.keys(nT)) if (oT[id]) {
    const diffs = Object.keys(fields).filter(f => JSON.stringify(oT[id][f]) !== JSON.stringify(nT[id][f]));
    if (diffs.length) changed.push({ id, text: `${nT[id].title} — ${diffs.map(f => fields[f]).join(', ')}` });
  }
  add('Topics edited', changed);
  const oM = Object.fromEntries(oldS.data.modules.map(m => [m.key, m])), nM = Object.fromEntries(newS.data.modules.map(m => [m.key, m]));
  add('Modules added', Object.keys(nM).filter(k => !oM[k]).map(k => ({ text: nM[k].name })));
  add('Modules removed', Object.keys(oM).filter(k => !nM[k]).map(k => ({ text: oM[k].name })));
  add('Modules edited', Object.keys(nM).filter(k => oM[k] && JSON.stringify(oM[k]) !== JSON.stringify(nM[k])).map(k => ({ text: nM[k].name })));
  const label = k => { const [kind, ...rest] = k.split('-'); const id = rest.join('-'); return { id, text: `${(nT[id] || oT[id])?.title || id} · ${kind.replace(/v\d+$/, '').replace(/^./, c => c.toUpperCase())}` }; };
  add('Reading pages added', [...newS.pages.keys()].filter(k => !oldS.pages.has(k)).map(label));
  add('Reading pages removed', [...oldS.pages.keys()].filter(k => !newS.pages.has(k)).map(label));
  add('Reading pages rewritten', [...newS.pages.keys()].filter(k => oldS.pages.has(k) && pageHash(oldS.pages.get(k)) !== pageHash(newS.pages.get(k))).map(label));
  for (const key of ['domains', 'sessionTitles', 'sessionTopics', 'pathways', 'ai_threads', 'questions', 'ai_competencies', 'primer', 'author_note', 'pillars', 'programmes']) {
    if (JSON.stringify(oldS.data[key]) !== JSON.stringify(newS.data[key])) add('Other sections edited', [{ text: key }]);
  }
  // merge duplicate "Other sections edited"
  const other = sections.filter(s => s.label === 'Other sections edited');
  if (other.length > 1) { const merged = { label: 'Other sections edited', items: other.flatMap(s => s.items) }; return [...sections.filter(s => s.label !== 'Other sections edited'), merged]; }
  return sections;
}

function copySource(from) {
  const tmp = SOURCE + '.next';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(from, tmp, { recursive: true, filter: s => !/(^|\/)(\.DS_Store|__MACOSX|_bundle_for_claude\.tgz)$/.test(s) });
  fs.rmSync(SOURCE, { recursive: true, force: true });
  fs.renameSync(tmp, SOURCE);
}

function build() {
  if (flag('--no-build')) return;
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('Build failed.'); process.exit(r.status || 1); }
}

// ── baseline mode ──
if (flag('--baseline')) {
  const s = loadSource(SOURCE); const log = readLog();
  if (!log.some(e => e.contentHash === s.contentHash)) {
    log.push({ date: today, title: `Baseline: Version ${s.version.number} (${s.version.updated})`, version: s.version, contentHash: s.contentHash, summary: `First build of the reader from the source artifact: ${s.data.topics.length} topics, ${s.data.modules.length} modules, ${s.pages.size} reading pages in ${s.bundleFiles.length} bundle files.`, sections: [] });
    writeLog(log); console.log('Baseline recorded.');
  } else console.log('Baseline already recorded.');
  build(); process.exit(0);
}

if (!input) { console.error('Usage: npm run sync -- <folder-or-zip>   (or --baseline)'); process.exit(2); }
let dir = path.resolve(input.replace(/^~(?=$|\/)/, os.homedir()));
if (!fs.existsSync(dir)) { console.error('Not found: ' + dir); process.exit(2); }
if (dir.toLowerCase().endsWith('.zip')) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pmkg-'));
  new AdmZip(dir).extractAllTo(out, true); dir = out;
}
const root = findRoot(dir);
if (!root) { console.error('Could not find practitioner.html and b/ inside ' + dir); process.exit(2); }

const next = loadSource(root);
const prev = fs.existsSync(path.join(SOURCE, 'practitioner.html')) ? loadSource(SOURCE) : null;
if (prev && prev.contentHash === next.contentHash && !flag('--force')) {
  console.log(`No changes: source is already Version ${next.version.number} (${next.version.updated}), content ${next.contentHash}.`);
  process.exit(0);
}
const sections = prev ? summarise(prev, next) : [];
const count = n => sections.find(s => s.label === n)?.items.length || 0;
const summary = prev ? [
  prev.version.number !== next.version.number ? `Version ${prev.version.number} → ${next.version.number}.` : `Same version number (${next.version.number}); content changed.`,
  `${count('Topics added')} topics added, ${count('Topics removed')} removed, ${count('Topics edited')} edited;`,
  `${count('Reading pages added')} reading pages added, ${count('Reading pages rewritten')} rewritten, ${count('Reading pages removed')} removed.`
].join(' ') : 'Initial import.';
copySource(root);
const log = readLog();
log.push({ date: today, title: `Synced to Version ${next.version.number} (${next.version.updated})`, version: next.version, contentHash: next.contentHash, summary, sections });
writeLog(log);
console.log(summary);
build();
