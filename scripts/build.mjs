#!/usr/bin/env node
// Builds the reorganised reader from the original artifact in ./source.
// Rule: the reader reorganises; it never rewrites. Every sentence a learner reads
// comes from the source files. Labels and navigation are the only new words.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import postcss from 'postcss';
import { loadSource, pageHash } from './lib/source.mjs';
import { setGraphSvg, localGraphSvg, esc } from './lib/graph.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.SOURCE_DIR ? path.resolve(process.env.SOURCE_DIR) : path.join(ROOT, 'source');
const OUT = path.join(ROOT, 'dist');
const INCLUDE_ORIGINAL = process.env.INCLUDE_ORIGINAL !== '0';
const SOURCE_URL = process.env.SOURCE_URL || 'https://claude.ai/artifact/MKCRzLnNkdx1whXTsydcBx';
const t0 = Date.now();

const src = loadSource(SRC);
const D = src.data;
const changelog = fs.existsSync(path.join(ROOT, 'data/changelog.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data/changelog.json'), 'utf8')) : [];
const builtAt = new Date().toISOString();

// ───────────────────────── data model ─────────────────────────
const KINDS = ['exp20', 'exp40', 'case20', 'case40'];
const ACT = Object.fromEntries(D.actions.map(a => [a.key, a]));
const DOM = Object.fromEntries(D.domains.map(d => [d.key, d]));
const MOD = Object.fromEntries(D.modules.map(m => [m.key, m]));
const T = Object.fromEntries(D.topics.map((t, i) => [t.id, { ...t, _i: i }]));
const dependents = {}; D.topics.forEach(t => t.prereqs.forEach(p => (dependents[p] = dependents[p] || []).push(t.id)));
const unlocks = id => (dependents[id] || []).filter(x => T[x].depth !== 'art');
const feedsDeliverables = id => (dependents[id] || []).filter(x => T[x].depth === 'art');
const beginnerIds = new Set(src.bdata.topics.map(t => t.id));
const bTopic = Object.fromEntries(src.bdata.topics.map(t => [t.id, t]));
const ownerName = { S: 'Sessions 1–5', R: 'Sessions 6–10', both: 'Both halves', none: 'Beyond the ISB course' };
const depthName = { core: 'Taught and practised in class', touch: 'Touched briefly in class', none: '', art: 'Graded deliverable — an encompassing node' };
const BASE_HUE = { core: 210, disc: 20, deliv: 265, data: 180, strat: 230, gtm: 340, people: 120, resp: 290, ai: 150, spec: 40, life: 95, course: 40 };
const HUE = {}; { const byDom = {}; D.modules.forEach(m => (byDom[m.domain] = byDom[m.domain] || []).push(m)); for (const [d, ms] of Object.entries(byDom)) ms.forEach((m, i) => (HUE[m.key] = (BASE_HUE[d] + i * 23) % 360)); }
const modTopics = {}; D.topics.forEach(t => (modTopics[t.module] = modTopics[t.module] || []).push(t.id));
const domMods = {}; D.modules.forEach(m => (domMods[m.domain] = domMods[m.domain] || []).push(m.key));

const pageKey = (kind, id) => { const k = D.bundleMap[`${kind}-${id}`]; return k && src.pages.has(k) ? k : null; };
const written = {}; for (const t of D.topics) written[t.id] = Object.fromEntries(KINDS.map(k => [k, pageKey(k, t.id)]));
const writtenCount = id => KINDS.filter(k => written[id][k]).length;
const isArt = id => T[id].depth === 'art';

function topo(ids) {
  const set = new Set(ids); const indeg = {}; const out = {};
  ids.forEach(id => { indeg[id] = 0; out[id] = []; });
  ids.forEach(id => T[id].prereqs.forEach(p => { if (set.has(p)) { indeg[id]++; out[p].push(id); } }));
  const ready = ids.filter(id => !indeg[id]).sort((a, b) => T[a]._i - T[b]._i); const res = [];
  while (ready.length) {
    const id = ready.shift(); res.push(id);
    for (const n of out[id]) if (--indeg[n] === 0) { ready.push(n); ready.sort((a, b) => T[a]._i - T[b]._i); }
  }
  ids.forEach(id => { if (!res.includes(id)) res.push(id); }); // cycles, if any, keep source order
  return res;
}
for (const k of Object.keys(modTopics)) modTopics[k] = topo(modTopics[k]);
const readingOrder = D.modules.flatMap(m => modTopics[m.key] || []);

// ───────────────────────── output helpers ─────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
let fileCount = 0;
function write(rel, content) {
  const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); fileCount++;
}
const U = {
  topic: id => `/t/${id}/`, read: (id, k) => `/t/${id}/${k}/`, mod: k => `/m/${k}/`, dom: k => `/d/${k}/`,
  session: n => `/course/s${n}/`,
};
const levelLabel = l => l === 1 ? 'Beginner' : 'Practitioner';
const plural = (n, w) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`;
const md = s => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

// ───────────────────────── layout ─────────────────────────
const NAV = [['/', 'Home', 'home'], ['/course/', 'ISB course', 'course'], ['/domains/', 'Domains', 'domains'], ['/paths/', 'Paths', 'paths'], ['/search/', 'Search', 'search'], ['/me/', 'My learning', 'me']];
function layout({ title, desc = '', body, crumbs = [], active = '', bodyClass = '', head = '' }) {
  const fullTitle = title ? `${title} · PM Knowledge Graph` : 'The Product Management Knowledge Graph — Reader';
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title><meta name="description" content="${esc(desc || D.domains[0].narrative.slice(0, 150))}">
<meta name="theme-color" content="#F5F6F3" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#12171C" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/app.css?v=${src.contentHash}">
<script>try{var p=JSON.parse(localStorage.getItem('pmkg:v1')||'{}').prefs||{};if(p.theme)document.documentElement.dataset.theme=p.theme;if(p.edition==='beginner')document.documentElement.classList.add('ed-b');if(p.rz)document.documentElement.style.setProperty('--rz',p.rz);}catch(e){}</script>
${head}</head><body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="bar">
<a class="brand" href="/"><span class="logo" aria-hidden="true"></span><span><b>PM Knowledge Graph</b><small>Reader · v${src.version.number ?? '?'}</small></span></a>
<nav class="nav" aria-label="Primary">${NAV.map(([h, l, k]) => `<a href="${h}"${active === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
<div class="tools">
<button class="kbtn" id="openPalette" type="button" aria-label="Quick find (Ctrl or Cmd + K)"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4.5 4.5"/></svg><span>Find a topic</span><kbd>⌘K</kbd></button>
<button class="ibtn" id="edToggle" type="button" title="Switch between all topics and the Beginner edition"><span class="ed-all">All<span class="hs"> 1,046</span></span><span class="ed-beg">Beginner</span></button>
<button class="ibtn" id="themeToggle" type="button" aria-label="Switch colour theme"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3a7 7 0 1 0 7 7 5.5 5.5 0 0 1-7-7z"/></svg></button>
<button class="ibtn menu" id="menuToggle" type="button" aria-label="Menu" aria-expanded="false"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14"/></svg></button>
</div></div></header>
${crumbs.length ? `<nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs.map(([h, l], i) => i === crumbs.length - 1 && !h ? `<li aria-current="page">${esc(l)}</li>` : `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ol></nav>` : ''}
<main id="main">${body}</main>
<footer class="foot"><div class="fwrap">
<p><b>${esc(D.author_note.by)}</b> — <i>The Product Management Knowledge Graph</i>, Version ${src.version.number ?? '?'} (last updated ${esc(src.version.updated || D.edition.updated)}). Licensed <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" rel="license">CC BY-NC-SA 4.0</a>. This reader reorganises the original for navigation and study; the content is the author's, unchanged.</p>
<p class="fl"><a href="/about/">About the map</a><a href="/changes/">What changed</a><a href="/original/" data-orig>Original interactive map</a><a href="${esc(SOURCE_URL)}" rel="noopener" target="_blank">Source artifact ↗</a><span>Built ${builtAt.slice(0, 10)} · content ${src.contentHash}</span></p>
</div></footer>
<div id="palette" class="pal" hidden><div class="pal-box" role="dialog" aria-modal="true" aria-label="Quick find"><input id="palInput" type="search" placeholder="Type a topic, question or module…" autocomplete="off" spellcheck="false"><ul id="palList" role="listbox"></ul><p class="pal-foot"><span>↑↓ to move · Enter to open · Esc to close</span><a href="/search/">Full-text search across every page →</a></p></div></div>
<script src="/assets/app.js?v=${src.contentHash}" defer></script>
</body></html>`;
}

// ───────────────────────── shared components ─────────────────────────
function fmtChips(id) {
  if (isArt(id)) return '<span class="fchips"><span class="fc art">Deliverable</span></span>';
  return `<span class="fchips">${KINDS.map(k => written[id][k]
    ? `<a class="fc w ${k}" href="${U.read(id, k)}" data-read-key="${k}:${id}" title="${esc(ACT[k].name)}">${ACT[k].label}</a>`
    : `<span class="fc" title="${esc(ACT[k].label)} not written yet in the source">${ACT[k].label}</span>`).join('')}</span>`;
}
function topicItem(id, { showModule = false, num = null, note = '' } = {}) {
  const t = T[id]; const m = MOD[t.module];
  return `<li class="ti" data-topic="${esc(id)}" data-level="${t.level}" style="--h:${HUE[t.module]}">
<span class="tstat" aria-hidden="true"></span>${num !== null ? `<span class="tnum">${num}</span>` : ''}
<div class="tmain"><a class="tt" href="${U.topic(id)}">${esc(t.title)}</a>
<span class="tq">${esc(t.q)}</span>${note ? `<span class="tnote">${note}</span>` : ''}
<span class="tmeta">${showModule ? `<a class="tmod" href="${U.mod(m.key)}">${esc(m.name)}</a>` : ''}<span class="lvl l${t.level}">${levelLabel(t.level)}</span>${t.sessions.length ? `<span class="ses">${t.sessions.map(s => 'S' + s).join(' · ')}</span>` : ''}</span></div>
${fmtChips(id)}</li>`;
}
const topicList = (ids, opts = {}) => `<ol class="tlist">${ids.map((id, i) => topicItem(id, { ...opts, num: opts.numbered ? i + 1 : null })).join('')}</ol>`;
const progressBar = (ids, label = 'understood') => `<div class="prog" data-topics="${ids.join(' ')}" data-label="${label}"><div class="ptrack"><i></i></div><span class="ptxt">0 of ${ids.length} ${label}</span></div>`;
const offlineBtn = (ids) => {
  const urls = ids.flatMap(id => [U.topic(id), ...KINDS.filter(k => written[id][k]).map(k => U.read(id, k))]);
  return `<button class="btn ghost offline" type="button" data-urls="${urls.join(' ')}">Save ${urls.length} pages for offline</button>`;
};
function graphFor(ids, label) {
  const set = new Set(ids);
  const nodes = ids.map(id => ({ id, title: T[id].title, href: U.topic(id), level: T[id].level, written: writtenCount(id) > 0, hue: HUE[T[id].module] }));
  const edges = []; ids.forEach(id => T[id].prereqs.forEach(p => set.has(p) && edges.push([p, id])));
  return `<div class="gwrap"><div class="gscroll">${setGraphSvg(nodes, edges, { label })}</div><p class="ghint">Arrows run from a prerequisite to the topic it unlocks. Filled boxes have written readings. Drag sideways to see the rest.</p></div>`;
}
const card = (h, title, sub, extra = '', cls = '') => `<a class="card ${cls}" href="${h}"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}${extra}</a>`;

// ───────────────────────── CSS scoping for reading pages ─────────────────────────
function scopeCss(css, scope = '.rd') {
  let root; try { root = postcss.parse(css); } catch { return ''; }
  root.walkRules(rule => {
    let p = rule.parent; while (p) { if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return; p = p.parent; }
    rule.selectors = rule.selectors.map(s => {
      s = s.trim();
      const m = s.match(/^((?:html|body|:root)(?:\s*[ >]\s*(?:html|body))*)(.*)$/i);
      if (m && /^(html|body|:root)\b|^:root/i.test(s)) return (scope + m[2]).trim();
      return `${scope} ${s}`;
    });
  });
  root.walkAtRules('import', a => a.remove());
  root.walkAtRules('font-face', a => a.remove());
  return root.toString();
}

// ───────────────────────── reading pages ─────────────────────────
const readingMeta = {}; // key -> {words, title, toc}
function renderReading(id, kind) {
  const key = written[id][kind]; const html = src.pages.get(key);
  const $ = cheerio.load(html);
  const css = $('style').map((i, el) => $(el).html()).get().join('\n');
  $('script, link, meta, style').remove();
  const docTitle = $('head > title').first().text().trim() || $('h1').first().text().trim();
  const toc = [];
  $('body h2').each((i, el) => { const tx = $(el).text().replace(/\s+/g, ' ').trim(); const hid = `s${i + 1}`; $(el).attr('id', hid); toc.push([hid, tx]); });
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  readingMeta[`${kind}:${id}`] = { words, title: docTitle, toc, hash: pageHash(html) };
  return { css: scopeCss(css), body: $('body').html(), docTitle, toc, words };
}
const mins = w => Math.max(1, Math.round(w / 220));

function formatTabs(id, cur) {
  return `<nav class="ftabs" aria-label="Formats">${KINDS.map(k => `<a href="${U.read(id, k)}" class="${k}${written[id][k] ? ' w' : ' nw'}"${k === cur ? ' aria-current="page"' : ''} data-read-key="${k}:${id}"><b>${ACT[k].label}</b><span>${esc(ACT[k].name.split('·')[1]?.trim() || ACT[k].name)}</span></a>`).join('')}</nav>`;
}
function neighbours(id) {
  const ids = modTopics[T[id].module]; const i = ids.indexOf(id);
  return { prev: i > 0 ? ids[i - 1] : null, next: i < ids.length - 1 ? ids[i + 1] : null };
}
function crumbsFor(id, extra) {
  const t = T[id], m = MOD[t.module], d = DOM[m.domain];
  const c = [['/domains/', 'Domains'], [U.dom(d.key), d.name], [U.mod(m.key), m.name]];
  if (extra) c.push([U.topic(id), t.title], [null, extra]); else c.push([null, t.title]);
  return c;
}
function pfFilters(id, fmt) {
  const t = T[id], m = MOD[t.module], d = DOM[m.domain];
  return `<div hidden><span data-pagefind-filter="Format">${esc(fmt)}</span><span data-pagefind-filter="Domain">${esc(d.name)}</span><span data-pagefind-filter="Module">${esc(m.name)}</span><span data-pagefind-filter="Edition">${levelLabel(t.level)}</span></div>`;
}

for (const t of D.topics) {
  for (const k of KINDS) {
    const id = t.id; const a = ACT[k]; const { prev, next } = neighbours(id);
    const navBottom = `<nav class="pn">${prev ? `<a class="pv" href="${U.topic(prev)}"><small>Previous in module</small>${esc(T[prev].title)}</a>` : '<span></span>'}${next ? `<a class="nx" href="${U.topic(next)}"><small>Next in module</small>${esc(T[next].title)}</a>` : '<span></span>'}</nav>`;
    if (written[id][k]) {
      const r = renderReading(id, k);
      const body = `<div class="rhead"><p class="kicker">${esc(a.name)} · ${mins(r.words)} min read · ${r.words.toLocaleString('en-IN')} words</p>
<h1 class="rtitle" data-pagefind-meta="title">${esc(t.title)} — ${a.label}</h1>
${formatTabs(id, k)}</div>
${pfFilters(id, a.label)}
<div class="rlayout"><aside class="toc" aria-label="On this page"><p>On this page</p><ol>${r.toc.map(([h, tx]) => `<li><a href="#${h}">${esc(tx)}</a></li>`).join('')}</ol>
<div class="rtools"><button class="btn mark" type="button" data-mark="${k}:${id}">Mark as read</button><div class="rz"><button type="button" data-rz="-1" aria-label="Smaller text">A−</button><button type="button" data-rz="0" aria-label="Reset text size">A</button><button type="button" data-rz="1" aria-label="Larger text">A+</button></div></div></aside>
<article class="rd" data-pagefind-body data-reading="${k}:${id}">${r.body}</article></div>
<div class="rfoot"><button class="btn mark big" type="button" data-mark="${k}:${id}">Mark as read</button><a class="btn ghost" href="${U.topic(id)}">Back to topic overview</a></div>
${navBottom}<div class="rprog" aria-hidden="true"><i></i></div>`;
      write(`t/${id}/${k}/index.html`, layout({ title: `${t.title} — ${a.label}`, desc: t.q, crumbs: crumbsFor(id, a.label), body, bodyClass: 'reading', head: `<style>${r.css}</style>` }));
    } else if (!isArt(id)) {
      // Not written in the source: offer the original's editable prompt, exactly as the source composes it.
      const m = MOD[t.module], d = DOM[m.domain];
      const pre = t.rel.map(r => `- ${T[r.p].title} — ${D.rel_names[r.t]}: ${r.why}`).join('\n') || '- none (a starting point)';
      const un = unlocks(id).map(x => T[x].title).join('; ') || 'none yet';
      const rel = [...t.prereqs, ...unlocks(id), ...D.topics.filter(x => x.module === t.module && x.id !== id && !t.prereqs.includes(x.id) && !(dependents[id] || []).includes(x.id)).slice(0, 6).map(x => x.id)].map(x => T[x].title).join('; ');
      const ctx = { title: t.title, kind: a.kind, domain: d.name, module: m.name, obj: t.obj, q: t.q, pre, un, rab: rel, pedagogy: m.pedagogy };
      const body = `<div class="rhead"><p class="kicker">${esc(a.name)}</p><h1 class="rtitle">${esc(t.title)} — ${a.label}</h1>${formatTabs(id, k)}</div>
<section class="studio narrow"><div class="callout"><b>This reading has not been written in the source map yet.</b> The original map offers the prompt that would write it instead. It is reproduced below exactly as the source assembles it, split into four editable parts. Edit any part, then copy it into your own Claude account.</div>
<div id="studio" data-act="${k}"></div>
<div class="sbtns"><button class="btn" type="button" id="copyPrompt">Copy prompt</button><a class="btn ghost" id="openClaude" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude ↗</a><span id="copied" role="status"></span></div>
<script type="application/json" id="tctx">${JSON.stringify(ctx).replace(/</g, '\\u003c')}</script></section>${navBottom}`;
      write(`t/${id}/${k}/index.html`, layout({ title: `${t.title} — ${a.label} (prompt)`, desc: t.q, crumbs: crumbsFor(id, a.label), body, bodyClass: 'reading prompt' }));
    }
  }
}

// ───────────────────────── topic hubs ─────────────────────────
for (const t of D.topics) {
  const id = t.id, m = MOD[t.module], d = DOM[m.domain];
  const rels = t.rel.map(r => ({ id: r.p, title: T[r.p].title, href: U.topic(r.p), level: T[r.p].level, rel: `${D.rel_names[r.t]}: ${r.why}` }));
  const after = unlocks(id).map(x => ({ id: x, title: T[x].title, href: U.topic(x), level: T[x].level }));
  const feeds = feedsDeliverables(id);
  const bt = bTopic[id]; const bDiff = bt && JSON.stringify(bt.prereqs) !== JSON.stringify(t.prereqs);
  const { prev, next } = neighbours(id);
  const formats = isArt(id) ? '' : `<section class="sec"><h2>Read or practise</h2><div class="fgrid">${KINDS.map(k => {
    const a = ACT[k]; const w = written[id][k]; const rm = w ? readingMeta[`${k}:${id}`] : null;
    return `<a class="fcard ${k}${w ? ' w' : ' nw'}" href="${U.read(id, k)}" data-read-key="${k}:${id}"><span class="flbl">${a.label}</span><b>${esc(a.name)}</b><span class="fshort">${esc(a.short)}</span><span class="fmeta">${w ? `${mins(rm.words)} min · ${rm.words.toLocaleString('en-IN')} words${rm.title && rm.title !== t.title ? ` · “${esc(rm.title)}”` : ''}` : 'Not written yet — get the prompt'}</span></a>`;
  }).join('')}</div></section>`;
  const relList = rels.length ? `<ul class="rlist">${t.rel.map(r => `<li data-topic="${esc(r.p)}" data-level="${T[r.p].level}"><span class="rtype t${r.t}">${esc(D.rel_names[r.t])}</span><a href="${U.topic(r.p)}">${esc(T[r.p].title)}</a><span class="why">${esc(r.why)}</span></li>`).join('')}</ul>` : '<p class="muted">A starting point: this topic has no prerequisites.</p>';
  const body = `<article class="topic" style="--h:${HUE[t.module]}"><header class="thead" data-pagefind-body>
<p class="kicker"><a href="${U.mod(m.key)}">${esc(m.name)}</a></p>
<h1 data-pagefind-meta="title" data-pagefind-weight="8">${esc(t.title)}</h1>
<p class="tqbig">${esc(t.q)}</p>
<p class="obj"><span>Learning objective</span>${esc(t.obj)}</p>
<ul class="badges"><li class="lvl l${t.level}">${levelLabel(t.level)} edition${t.level === 2 ? ' only' : ''}</li>${t.sessions.length ? `<li>ISB course: ${t.sessions.map(s => `<a href="${U.session(s)}">S${s}</a>`).join(', ')}</li>` : ''}${depthName[t.depth] ? `<li>${esc(depthName[t.depth])}</li>` : ''}<li>${esc(ownerName[t.owner])}</li><li class="ai ai-${m.ai_level}">AI impact on this module: ${esc(m.ai_level)}</li></ul>
</header>${pfFilters(id, 'Topic overview')}
<div class="tactions"><button class="btn" type="button" data-done="${esc(id)}">Mark as understood</button><button class="btn ghost" type="button" data-bookmark="${esc(id)}">Bookmark</button></div>
${formats}
${isArt(id) ? `<section class="sec"><h2>What this deliverable encompasses</h2><p class="muted">Each of these topics is practised implicitly inside the deliverable.</p>${topicList(t.prereqs, { showModule: true })}</section>` : ''}
<section class="sec"><h2>Where it sits</h2><div class="lwrap">${localGraphSvg({ title: t.title }, rels, after)}</div></section>
<div class="two"><section class="sec"><h2>Builds on</h2>${relList}${bDiff ? `<p class="muted small">In the Beginner edition the prerequisites are: ${bt.prereqs.length ? bt.prereqs.map(p => `<a href="${U.topic(p)}">${esc(T[p].title)}</a>`).join(', ') : 'none (a starting point)'}.</p>` : ''}</section>
<section class="sec"><h2>Unlocks</h2>${after.length ? `<ul class="rlist">${after.map(a => `<li data-topic="${esc(a.id)}" data-level="${a.level}"><a href="${a.href}">${esc(a.title)}</a><span class="why">${esc(MOD[T[a.id].module].name)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing in the map depends on this topic yet.</p>'}
${feeds.length ? `<h3>Feeds the graded deliverables</h3><ul class="rlist">${feeds.map(f => `<li><a href="${U.topic(f)}">${esc(T[f].title)}</a></li>`).join('')}</ul>` : ''}</section></div>
<section class="sec notes"><h2>Your notes</h2><textarea data-note="${esc(id)}" rows="4" placeholder="Private to this browser. Saved as you type."></textarea></section>
<nav class="pn">${prev ? `<a class="pv" href="${U.topic(prev)}"><small>Previous in module</small>${esc(T[prev].title)}</a>` : '<span></span>'}${next ? `<a class="nx" href="${U.topic(next)}"><small>Next in module</small>${esc(T[next].title)}</a>` : '<span></span>'}</nav>
</article>`;
  write(`t/${id}/index.html`, layout({ title: t.title, desc: t.q, crumbs: crumbsFor(id), body, bodyClass: 'topicpage' }));
}

// ───────────────────────── modules and domains ─────────────────────────
for (const m of D.modules) {
  const ids = modTopics[m.key] || []; const d = DOM[m.domain];
  const nW = ids.filter(id => writtenCount(id)).length;
  const body = `<div class="page" style="--h:${HUE[m.key]}"><header class="phead"><p class="kicker"><a href="${U.dom(d.key)}">${esc(d.name)}</a></p><h1>${esc(m.name)}</h1><p class="lede">${esc(m.desc)}</p>
<p class="stats"><span><b>${ids.length}</b> topics</span><span><b>${ids.filter(i => T[i].level === 1).length}</b> in Beginner</span><span><b>${nW}</b> with readings</span></p>${progressBar(ids)}</header>
<div class="mgrid"><div><section class="sec"><h2>Topics in learning order</h2><p class="muted small">Ordered so every prerequisite inside this module comes before the topics that need it.</p>${topicList(ids, { numbered: true })}</section>
<section class="sec"><h2>Dependency map</h2>${graphFor(ids, `Dependency map of ${m.name}`)}</section></div>
<aside class="side">
<div class="box"><h3>AI impact: ${esc(m.ai_level)}</h3><p>${esc(m.ai_note)}</p><p class="muted small">${esc(D.ai_lens.levels[m.ai_level] || '')}</p></div>
<div class="box"><h3>How the best programmes teach it</h3><p>${esc(m.pedagogy)}</p>${m.programmes?.length ? `<p class="muted small">${m.programmes.map(esc).join(' · ')}</p>` : ''}</div>
${m.readings?.length ? `<div class="box"><h3>Recommended reading</h3><ul>${m.readings.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
<div class="box"><h3>Lens and spine</h3><p>${esc(D.lenses[m.lens]?.name || '')}</p><p class="muted small">${esc(D.lenses[m.lens]?.desc || '')}</p>${m.spine?.length ? `<p class="small">Curriculum spine: ${m.spine.map(esc).join(', ')}</p>` : ''}${m.pillars?.length ? `<p class="small">Builds: ${m.pillars.map(p => esc(D.pillars.find(x => x.key === p)?.name || p)).join(', ')}</p>` : ''}</div>
<div class="box">${offlineBtn(ids)}</div></aside></div></div>`;
  write(`m/${m.key}/index.html`, layout({ title: m.name, desc: m.desc, crumbs: [['/domains/', 'Domains'], [U.dom(d.key), d.name], [null, m.name]], active: 'domains', body }));
}
function modCard(k) {
  const m = MOD[k]; const ids = modTopics[k] || [];
  return `<a class="mcard" href="${U.mod(k)}" style="--h:${HUE[k]}"><b>${esc(m.name)}</b><span>${esc(m.desc)}</span><span class="mstat">${ids.length} topics · ${ids.filter(i => writtenCount(i)).length} with readings<i class="ai-dot ai-${m.ai_level}" title="AI impact: ${m.ai_level}"></i></span>${progressBar(ids)}</a>`;
}
for (const d of D.domains) {
  const mods = domMods[d.key] || []; const ids = mods.flatMap(k => modTopics[k] || []);
  const body = `<div class="page"><header class="phead"><p class="kicker">Domain</p><h1>${esc(d.name)}</h1><p class="lede narrative">${esc(d.narrative)}</p>${progressBar(ids)}</header><section class="sec"><h2>${plural(mods.length, 'module')} · ${plural(ids.length, 'topic')}</h2><div class="mgrid3">${mods.map(modCard).join('')}</div></section></div>`;
  write(`d/${d.key}/index.html`, layout({ title: d.name, desc: d.narrative.slice(0, 160), crumbs: [['/domains/', 'Domains'], [null, d.name]], active: 'domains', body }));
}
{
  const body = `<div class="page"><header class="phead"><p class="kicker">Learn by domain</p><h1>${D.domains.length} domains, ${D.modules.length} modules</h1><p class="lede">The whole discipline, grouped the way the map groups it. Each domain opens with the author's narrative of how its modules connect.</p></header>
${D.domains.map(d => `<section class="sec dsec"><h2><a href="${U.dom(d.key)}">${esc(d.name)}</a></h2><p class="narrative clamp">${esc(d.narrative)}</p><div class="mgrid3">${(domMods[d.key] || []).map(modCard).join('')}</div></section>`).join('')}
<section class="sec"><h2>The same modules by curriculum spine</h2><p class="muted">The ten strands the benchmark study uses to describe a complete product-management curriculum.</p><div class="spine">${D.spine.map(s => `<div class="box"><h3>${esc(s.name)}</h3><p class="small muted">${esc(s.desc)}</p><p>${s.modules.filter(k => MOD[k]).map(k => `<a href="${U.mod(k)}">${esc(MOD[k].name)}</a>`).join(' · ')}</p></div>`).join('')}</div></section></div>`;
  write('domains/index.html', layout({ title: 'Domains', crumbs: [[null, 'Domains']], active: 'domains', body }));
}

// ───────────────────────── ISB course ─────────────────────────
const arts = D.topics.filter(t => t.depth === 'art').map(t => t.id);
for (const [n, title] of Object.entries(D.sessionTitles)) {
  const ids = topo(D.sessionTopics[n] || []);
  const core = ids.filter(i => T[i].depth === 'core').length, touch = ids.filter(i => T[i].depth === 'touch').length;
  const nN = Number(n);
  const body = `<div class="page"><header class="phead"><p class="kicker">Software Product Management · ISB · Session ${n} of ${Object.keys(D.sessionTitles).length}</p><h1>${esc(title)}</h1>
<p class="stats"><span><b>${ids.length}</b> topics</span><span><b>${core}</b> taught and practised</span><span><b>${touch}</b> touched briefly</span><span><b>${ids.filter(i => writtenCount(i)).length}</b> with readings</span></p>${progressBar(ids)}
<p class="sesnav">${nN > 1 ? `<a href="${U.session(nN - 1)}">← S${nN - 1} ${esc(D.sessionTitles[nN - 1])}</a>` : ''}${D.sessionTitles[nN + 1] ? `<a href="${U.session(nN + 1)}">S${nN + 1} ${esc(D.sessionTitles[nN + 1])} →</a>` : ''}</p></header>
<section class="sec"><h2>Topics in learning order</h2>${topicList(ids, { numbered: true, showModule: true })}</section>
<section class="sec"><h2>How this session's topics depend on one another</h2>${graphFor(ids, `Session ${n} dependency map`)}</section>
<p>${offlineBtn(ids)} <a class="btn ghost" href="/original/beginner.html#session=${n}" data-orig>Open in the original graph</a></p></div>`;
  write(`course/s${n}/index.html`, layout({ title: `S${n} · ${title}`, crumbs: [['/course/', 'ISB course'], [null, `Session ${n}`]], active: 'course', body }));
}
{
  const half = o => D.topics.filter(t => t.depth !== 'art' && (t.owner === o || t.owner === 'both')).length;
  const body = `<div class="page"><header class="phead"><p class="kicker">Follow the course</p><h1>Software Product Management at ISB</h1><p class="lede">The map was built for this course. The course covers a deliberately small part of it; each session below shows only the topics taught in it, in an order where prerequisites come first.</p>
<p class="stats"><span><b>${Object.keys(D.sessionTitles).length}</b> sessions</span><span><b>${half('S')}</b> topics in Sessions 1–5</span><span><b>${half('R')}</b> in Sessions 6–10</span><span><b>${D.topics.filter(t => t.owner === 'none' && t.depth !== 'art').length}</b> beyond the course</span></p></header>
<section class="sec"><h2>Sessions</h2><ol class="sgrid">${Object.entries(D.sessionTitles).map(([n, ti]) => { const ids = D.sessionTopics[n] || []; return `<li><a class="scard" href="${U.session(n)}"><span class="snum">S${n}</span><b>${esc(ti)}</b><span>${ids.length} topics · ${ids.filter(i => writtenCount(i) === 4).length} with all four readings</span>${progressBar(ids)}</a></li>`; }).join('')}</ol></section>
<section class="sec"><h2>Graded deliverables</h2><p class="muted">Encompassing nodes: each one draws on the topics listed on its page.</p>${topicList(arts)}</section></div>`;
  write('course/index.html', layout({ title: 'ISB course', crumbs: [[null, 'ISB course']], active: 'course', body }));
}

// ───────────────────────── guided paths ─────────────────────────
const paths = [];
const addPath = (slug, title, kicker, desc, bodyHtml, count) => { paths.push({ slug, title, kicker, desc, count }); write(`paths/${slug}/index.html`, layout({ title, desc, crumbs: [['/paths/', 'Paths'], [null, title]], active: 'paths', body: `<div class="page"><header class="phead"><p class="kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><p class="lede">${esc(desc)}</p></header>${bodyHtml}</div>` })); };
addPath('primer', 'Eleven starting points', 'Primer', 'The topics the map treats as the primer: where a newcomer to each part of the discipline begins.', `${progressBar(D.primer)}${topicList(D.primer, { numbered: true, showModule: true })}`, D.primer.length);
for (const th of D.ai_threads) addPath(`ai-${th.key}`, th.name.replace(/^Thread \d · /, ''), th.name.split('·')[0].trim(), th.desc, `${progressBar(th.topics)}${topicList(th.topics.filter(x => T[x]), { numbered: true, showModule: true })}`, th.topics.length);
addPath('questions', 'Ten questions every product decision must answer', 'Decision questions', 'Each question, with the topics that teach you how to answer it.', D.questions.map((q, i) => `<section class="sec"><h2><span class="qn">${i + 1}</span>${esc(q.q)}</h2>${topicList(q.topics.filter(x => T[x]), { showModule: true })}</section>`).join(''), D.questions.length);
addPath('ai-competencies', 'Ten AI product competencies', 'AI competencies', 'What a PM working on AI products should be able to do, and where in the map each is taught.', D.ai_competencies.map((c, i) => `<section class="sec"><h2><span class="qn">${i + 1}</span>${esc(c.c)}</h2>${topicList(c.topics.filter(x => T[x]), { showModule: true })}</section>`).join(''), D.ai_competencies.length);
D.pathways.forEach((p, i) => addPath(`pathway-${i + 1}`, p.name, 'Sequencing pathway', p.desc, `<ol class="mseq">${p.modules.filter(k => MOD[k]).map((k, j) => `<li><span class="qn">${j + 1}</span>${modCard(k)}</li>`).join('')}</ol>`, p.modules.length));
addPath('pillars', 'Three traits', D.author_note.by + ' · a signed personal view', D.author_note.title, `<section class="sec author">${D.author_note.body.map(p => `<p>${md(p)}</p>`).join('')}</section>${D.pillars.map(p => { const mods = D.modules.filter(m => (m.pillars || []).includes(p.key)); return `<section class="sec"><h2>${esc(p.name)}</h2><p class="tqbig">${esc(p.short)}</p><p>${esc(p.note)}</p><p class="muted">${esc(p.gloss)}</p><div class="mgrid3">${mods.map(m => modCard(m.key)).join('')}</div></section>`; }).join('')}`, D.pillars.length);
addPath('ai-lens', D.ai_lens.name + ': how much has AI changed each module', 'AI lens', D.ai_lens.desc, ['high', 'medium', 'low'].map(l => `<section class="sec"><h2>${l[0].toUpperCase() + l.slice(1)}</h2><p class="muted">${esc(D.ai_lens.levels[l])}</p><div class="mgrid3">${D.modules.filter(m => m.ai_level === l).map(m => `<div class="box"><h3><a href="${U.mod(m.key)}">${esc(m.name)}</a></h3><p class="small">${esc(m.ai_note)}</p></div>`).join('')}</div></section>`).join(''), 3);
{
  const body = `<div class="page"><header class="phead"><p class="kicker">Guided paths</p><h1>Ways through the map</h1><p class="lede">Every curated sequence in the source: the primer, the two AI threads, the decision questions, the AI competencies, the four sequencing pathways, the author's three traits and the AI lens.</p></header><div class="mgrid3">${paths.map(p => card(`/paths/${p.slug}/`, esc(p.title), esc(p.kicker), `<span class="small muted">${esc(p.desc.slice(0, 180))}${p.desc.length > 180 ? '…' : ''}</span>`, 'pcard')).join('')}</div></div>`;
  write('paths/index.html', layout({ title: 'Paths', crumbs: [[null, 'Paths']], active: 'paths', body }));
}

// ───────────────────────── home ─────────────────────────
{
  const nPages = Object.values(written).reduce((a, w) => a + KINDS.filter(k => w[k]).length, 0);
  const nEdges = D.topics.reduce((a, t) => a + t.prereqs.length, 0);
  const body = `<section class="hero"><div class="hwrap"><p class="kicker">${esc(D.author_note.by)} · Version ${src.version.number ?? '?'} · updated ${esc(src.version.updated || '')}</p>
<h1>The Product Management Knowledge Graph</h1><p class="lede">A prerequisite map of the whole discipline, reorganised for reading: find any topic in two keystrokes, follow the ISB course session by session, or work through a domain in dependency order. Every topic has up to two explainers and two Indian-context cases.</p>
<p class="stats big"><span><b>${D.topics.length.toLocaleString('en-IN')}</b> topics</span><span><b>${D.modules.length}</b> modules</span><span><b>${nEdges.toLocaleString('en-IN')}</b> prerequisite edges</span><span><b>${nPages.toLocaleString('en-IN')}</b> reading pages</span></p>
<button class="bigsearch" type="button" data-open-palette><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4.5 4.5"/></svg>Find a topic, question or module…<kbd>⌘K</kbd></button></div></section>
<section class="sec cont" id="continue" hidden><h2>Pick up where you left off</h2><div class="mgrid3" id="contList"></div></section>
<section class="sec"><h2>Choose how to learn</h2><div class="entry">
${card('/course/', 'Follow the ISB course', `${Object.keys(D.sessionTitles).length} sessions, each showing only the topics it teaches, prerequisites first.`, '<span class="go">Open the course →</span>', 'big e1')}
${card('/domains/', 'Learn by domain', `${D.domains.length} domains and ${D.modules.length} modules, each in learning order with a dependency map.`, '<span class="go">Browse domains →</span>', 'big e2')}
${card('/paths/', 'Take a guided path', 'The primer, the two AI threads, ten decision questions, AI competencies and four sequencing pathways.', '<span class="go">See paths →</span>', 'big e3')}
</div></section>
<section class="sec"><h2>Four ways into any topic</h2><div class="fgrid">${KINDS.map(k => `<div class="fcard ${k} w static"><span class="flbl">${ACT[k].label}</span><b>${esc(ACT[k].name)}</b><span class="fshort">${esc(ACT[k].short)}</span><span class="fmeta">~${ACT[k].words.toLocaleString('en-IN')} words</span></div>`).join('')}</div></section>
<section class="sec"><h2>Start with the primer</h2><div class="chips">${D.primer.map(id => `<a class="chip" href="${U.topic(id)}" data-topic="${id}">${esc(T[id].title)}</a>`).join('')}</div></section>
<section class="sec"><h2>The map at a glance</h2><div class="dgrid">${D.domains.map(d => { const ids = (domMods[d.key] || []).flatMap(k => modTopics[k] || []); return `<div class="dcard" style="--h:${BASE_HUE[d.key]}"><h3><a href="${U.dom(d.key)}">${esc(d.name)}</a></h3><ul>${(domMods[d.key] || []).map(k => `<li><a href="${U.mod(k)}">${esc(MOD[k].name)}</a><span>${(modTopics[k] || []).length}</span></li>`).join('')}</ul>${progressBar(ids)}</div>`; }).join('')}</div></section>
<section class="sec orig"><p>Prefer the original force-directed graph with its AI and pillar lenses? <a href="/original/" data-orig>Open the original interactive map</a> — it is included unchanged.</p></section>`;
  write('index.html', layout({ title: '', body, active: 'home', bodyClass: 'home' }));
}

// ───────────────────────── about (original front page, verbatim) ─────────────────────────
{
  const $ = cheerio.load(src.indexHtml);
  const css = $('style').map((i, el) => $(el).html()).get().join('\n');
  $('script, link, meta, style, #pmgStats').remove();
  $('a[href]').each((i, el) => { const h = $(el).attr('href'); if (/^(beginner|practitioner)\.html/.test(h)) { const s = h.match(/session=(\d+)/); $(el).attr('href', s ? U.session(s[1]) : '/original/' + h); } });
  $('img[src^="img/"]').each((i, el) => $(el).attr('src', '/original/' + $(el).attr('src')));
  const progs = D.programmes.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.region)}</td><td>${esc(p.spine)}</td><td>${p.modules.filter(k => MOD[k]).map(k => `<a href="${U.mod(k)}">${esc(MOD[k].name)}</a>`).join(', ')}</td></tr>`).join('');
  const body = `<div class="page"><header class="phead"><p class="kicker">About</p><h1>About this map</h1><p class="lede">The original front page, reproduced unchanged, followed by the reference material the graph carries.</p></header>
<article class="rd about">${$('body').html()}</article>
<section class="sec"><h2>Teaching lenses</h2><div class="mgrid3">${Object.values(D.lenses).map(l => `<div class="box"><h3>${esc(l.name)}</h3><p class="small">${esc(l.desc)}</p></div>`).join('')}</div></section>
<section class="sec"><h2>How prerequisite edges are typed</h2><ul class="rlist">${Object.entries(D.rel_names).map(([k, v]) => `<li><span class="rtype t${k}">${esc(v)}</span><span class="why">${D.topics.reduce((a, t) => a + t.rel.filter(r => r.t === k).length, 0)} edges</span></li>`).join('')}</ul></section>
<section class="sec"><h2>The ${D.programmes.length} programmes benchmarked</h2><div class="tscroll"><table class="dtable"><thead><tr><th>Programme</th><th>Region</th><th>Spine</th><th>Modules it maps to</th></tr></thead><tbody>${progs}</tbody></table></div></section>
<section class="sec"><h2>How this reader was made</h2><p>This site is generated automatically from the original artifact's files. It splits the bundled reading pages into one page each, orders every module and session so prerequisites come first, adds search, progress tracking and offline reading, and keeps the original interactive map at <a href="/original/" data-orig>/original/</a>. It adds no content of its own.</p></section></div>`;
  write('about/index.html', layout({ title: 'About', crumbs: [[null, 'About']], body, head: `<style>${scopeCss(css)}</style>` }));
}

// ───────────────────────── search, me, changes, 404 ─────────────────────────
write('search/index.html', layout({ title: 'Search', crumbs: [[null, 'Search']], active: 'search', head: '<link rel="stylesheet" href="/pagefind/pagefind-ui.css">', body: `<div class="page"><header class="phead"><p class="kicker">Full-text search</p><h1>Search every page</h1><p class="lede">Searches the full text of all ${Object.keys(readingMeta).length.toLocaleString('en-IN')} reading pages and ${D.topics.length.toLocaleString('en-IN')} topic overviews. Filter by format, domain, module or edition.</p></header><div id="pfsearch"></div><noscript>Search needs JavaScript. Use the <a href="/domains/">domain index</a> instead.</noscript></div><script src="/pagefind/pagefind-ui.js"></script>` }));
write('me/index.html', layout({ title: 'My learning', crumbs: [[null, 'My learning']], active: 'me', body: `<div class="page"><header class="phead"><p class="kicker">Private to this browser</p><h1>My learning</h1><p class="lede">Progress, bookmarks and notes are stored on this device only. Export them to move to another browser.</p></header><div id="me"></div>
<section class="sec"><h2>Back up or move your progress</h2><p><button class="btn" type="button" id="exportP">Export progress (.json)</button> <label class="btn ghost">Import<input type="file" id="importP" accept="application/json" hidden></label> <button class="btn ghost danger" type="button" id="resetP">Reset everything</button></p></section></div>` }));
{
  const rows = changelog.length ? changelog.slice().reverse().map(c => `<section class="sec change"><h2>${esc(c.date)} — ${esc(c.title)}</h2><p class="muted">${esc(c.summary)}</p>${c.sections?.map(s => `<details${s.items.length <= 12 ? ' open' : ''}><summary>${esc(s.label)} (${s.items.length})</summary><ul>${s.items.map(i => `<li>${i.id && T[i.id] ? `<a href="${U.topic(i.id)}">${esc(i.text)}</a>` : esc(i.text)}</li>`).join('')}</ul></details>`).join('') || ''}</section>`).join('') : '<p>No changes recorded yet.</p>';
  write('changes/index.html', layout({ title: 'What changed', crumbs: [[null, 'What changed']], body: `<div class="page narrow"><header class="phead"><p class="kicker">Change log</p><h1>What changed in the source</h1><p class="lede">Each time the reader is synced with a new version of the original artifact, the differences are listed here.</p></header>${rows}</div>` }));
}
write('404.html', layout({ title: 'Not found', body: `<div class="page narrow"><h1>That page is not in the map</h1><p>It may have been renamed in a newer version of the source. Try <a href="/search/">search</a> or the <a href="/domains/">domain index</a>.</p></div>` }));

// ───────────────────────── data files ─────────────────────────
const searchIdx = D.topics.map(t => [t.id, t.title, t.q, MOD[t.module].name, t.level, KINDS.map(k => written[t.id][k] ? 1 : 0).join(''), t.obj]);
write('data/search.json', JSON.stringify(searchIdx));
write('data/actions.json', JSON.stringify(D.actions));
write('data/graph.json', JSON.stringify({ ...D, bundleMap: undefined, bundled: undefined, packMap: undefined }));
const version = { source: { url: SOURCE_URL, version: src.version.number, updated: src.version.updated, contentHash: src.contentHash, topics: D.topics.length, pages: Object.keys(readingMeta).length }, builtAt };
write('version.json', JSON.stringify(version, null, 2));

// ───────────────────────── static assets, original, host config ─────────────────────────
function copyDir(from, to) { fs.cpSync(from, path.join(OUT, to), { recursive: true }); }
copyDir(path.join(ROOT, 'site'), '.');
if (INCLUDE_ORIGINAL) {
  for (const f of ['index.html', 'beginner.html', 'practitioner.html']) write(`original/${f}`, fs.readFileSync(path.join(SRC, f)));
  for (const d of ['b', 'img', 'vendor']) if (fs.existsSync(path.join(SRC, d))) copyDir(path.join(SRC, d), `original/${d}`);
}
// precache list for the service worker
write('precache.json', JSON.stringify(['/', '/course/', '/domains/', '/paths/', '/me/', '/search/', '/about/', '/data/search.json', '/data/actions.json', `/assets/app.css?v=${src.contentHash}`, `/assets/app.js?v=${src.contentHash}`, '/assets/icon.svg']));
const sw = fs.readFileSync(path.join(ROOT, 'site/sw.js'), 'utf8').replace('__VERSION__', src.contentHash + '-' + builtAt.slice(0, 19));
write('sw.js', sw);

console.log(`Built ${fileCount.toLocaleString()} files from source v${src.version.number} (${src.version.updated}), ${D.topics.length} topics, ${Object.keys(readingMeta).length} reading pages, in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
