/* PM Knowledge Graph reader — client behaviour.
   Progressive enhancement: every page is complete without this file; this adds the learning loop
   (path, lesson steps, segmented reading, predict/recall, spaced review), progress and search. */
(() => {
  'use strict';
  const KEY = 'pmkg:v1', KINDS = ['exp20', 'exp40', 'case20', 'case40'];
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const blank = () => ({ read: {}, done: {}, marks: {}, notes: {}, hist: [], prefs: {}, recall: {}, pred: {}, cards: {}, known: {}, sec: {}, act: {}, ans: {} });
  const load = () => { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return blank(); } };
  let S = load();
  // legacy "Mark as understood" → known
  for (const id of Object.keys(S.done || {})) if (!S.known[id]) S.known[id] = S.done[id];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save: browser storage is full or blocked.'); } };
  addEventListener('storage', e => { if (e.key === KEY) { S = load(); paint(); } });
  const toast = msg => { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DAY = 864e5;
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const ago = ts => { const m = Math.round((Date.now() - ts) / 6e4); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; return Math.round(h / 24) + ' d ago'; };
  const fmtH = min => min < 90 ? `${Math.round(min)} min` : `${(min / 60).toFixed(min < 600 ? 1 : 0)} h`;

  /* ───────── spaced repetition (SM-2 style, intervals in days) ───────── */
  const MASTER_DAYS = 21;
  function schedule(cid, rating, first = false) {
    const c = S.cards[cid] || { iv: 0, reps: 0, lapses: 0 };
    if (first) { c.iv = [1, 1, 3, 5][rating - 1]; c.reps = rating > 1 ? 1 : 0; }
    else if (rating === 1) { c.iv = 1; c.reps = 0; c.lapses++; }
    else { c.iv = c.reps === 0 ? [0, 2, 4, 7][rating - 1] : Math.round(c.iv * [0, 1.3, 2.5, 3.5][rating - 1]); c.reps++; }
    c.iv = Math.min(365, Math.max(1, c.iv)); c.last = rating; c.ts = Date.now(); c.due = startOfDay() + c.iv * DAY;
    S.cards[cid] = c; save(); return c;
  }
  const dueCount = () => { const end = startOfDay() + DAY; return Object.values(S.cards).filter(c => c.due < end).length; };
  const mastered = id => { const c = S.cards['t:' + id]; return !!(c && c.iv >= MASTER_DAYS && c.last >= 3); };
  const learned = id => !!(S.recall[id] || S.known[id]);
  function topicState(id) {
    if (mastered(id)) return 'mastered';
    if (learned(id)) return 'learned';
    return KINDS.some(k => S.read[k + ':' + id]) || S.sec['exp20:' + id] ? 'started' : '';
  }

  /* ───────── path engine (mirrors scripts/lib/path.mjs) ───────── */
  let PATH = null;
  const getPath = async () => PATH || (PATH = await (await fetch('/data/path.json')).json());
  const track = () => S.prefs.track || 'complete';
  const hasK = id => k => !!(PATH.T[id] && PATH.T[id][3 + KINDS.indexOf(k)]);
  function stepsFor(id, stage, tk = track()) {
    const has = hasK(id), lvl = PATH.T[id][2]; const f = [];
    if (has('exp20')) f.push('exp20'); else if (has('exp40') && stage === 'found') f.push('exp40');
    if (f.length) f.push('recall');
    if (has('case20')) f.push('case20');
    const d = ['exp40', 'case40'].filter(k => has(k) && !(k === 'exp40' && f.includes('exp40')));
    if (stage === 'found') return f;
    return lvl === 2 && tk === 'complete' ? [...f, ...d] : d;
  }
  const recallKind = id => hasK(id)('exp20') ? 'exp20' : 'exp40';
  function stepDone(id, k, stage) {
    if (k === 'recall') return learned(id);
    if (S.read[k + ':' + id]) return true;
    return !!S.known[id] && stage === 'found';
  }
  const stepUrl = (id, k) => k === 'recall' ? `/t/${id}/${recallKind(id)}/#recall` : `/t/${id}/${k}/`;
  const stepLabel = k => k === 'recall' ? 'Recall from memory' : (k.startsWith('case') ? `Work ${k === 'case20' ? 'Case20' : 'Case40'}` : `Read ${k === 'exp20' ? 'Exp20' : 'Exp40'}`);
  const stepMin = (id, k) => k === 'recall' ? 3 : (PATH.T[id][3 + KINDS.indexOf(k)] || 0) / 220;
  function items(tk = track()) {
    const out = []; let u = 0;
    for (const st of PATH.tracks[tk].stages) for (const un of st.units) { u++; un.items.forEach((id, i) => out.push({ id, stage: st.key, stageLabel: st.label, unit: u, unitTitle: un.title, pos: i + 1, of: un.items.length, steps: stepsFor(id, st.key, tk) })); }
    return out;
  }
  const itemDone = it => it.steps.every(k => stepDone(it.id, k, it.stage));
  const nextItem = (tk = track()) => items(tk).find(it => !itemDone(it)) || null;
  const curStep = it => it.steps.find(k => !stepDone(it.id, k, it.stage));
  function itemFor(id, tk = track()) { const all = items(tk).filter(it => it.id === id); return all.find(it => !itemDone(it)) || all.at(-1) || null; }
  function afterItem(it, tk = track()) { const all = items(tk); const i = all.findIndex(x => x.id === it.id && x.stage === it.stage); return all.slice(i + 1).find(x => !itemDone(x)) || null; }
  function nextAction(it) {
    if (!it) return null;
    const k = curStep(it);
    if (k) return { url: stepUrl(it.id, k), label: `${stepLabel(k)}`, sub: PATH.T[it.id][0], min: stepMin(it.id, k), id: it.id, k };
    const n = afterItem(it); if (!n) return { url: '/learn/', label: 'Path complete', sub: 'Every lesson in this path is done', min: 0 };
    const k2 = curStep(n); return { url: stepUrl(n.id, k2), label: `Next lesson: ${stepLabel(k2)}`, sub: PATH.T[n.id][0], min: stepMin(n.id, k2), id: n.id, k: k2 };
  }
  // the step to suggest from a page that is itself a step: the next undone step after this one, else the next lesson
  function upcoming(it, hereK) {
    if (!it) return null; const i = it.steps.indexOf(hereK);
    if (i < 0) return nextAction(it);
    const k = it.steps.slice(i + 1).find(x => !stepDone(it.id, x, it.stage));
    if (k) return { url: stepUrl(it.id, k), label: `Then: ${stepLabel(k)}`, sub: PATH.T[it.id][0], min: stepMin(it.id, k), id: it.id, k };
    const n = afterItem(it); if (!n) return { url: '/learn/', label: 'Path complete', min: 0 };
    const k2 = curStep(n); return { url: stepUrl(n.id, k2), label: `Next lesson: ${stepLabel(k2)}`, sub: PATH.T[n.id][0], min: stepMin(n.id, k2), id: n.id, k: k2 };
  }
  const hereKind = () => RC ? (location.hash === '#recall' && RC.recall ? 'recall' : RC.kind) : null;
  function remainingMin(tk = track(), stage = null) { return items(tk).filter(it => !stage || it.stage === stage).reduce((a, it) => a + it.steps.filter(k => !stepDone(it.id, k, it.stage)).reduce((b, k) => b + stepMin(it.id, k), 0), 0); }

  /* ───────── theme, edition, menu ───────── */
  $('#themeToggle')?.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark'; S.prefs.theme = root.dataset.theme; save();
  });
  $('#edToggle')?.addEventListener('click', () => {
    const b = !root.classList.contains('ed-b'); root.classList.toggle('ed-b', b); S.prefs.edition = b ? 'beginner' : 'all'; save();
    toast(b ? 'Beginner edition: Practitioner-only topics are hidden in lists' : 'Showing all topics'); paint();
  });
  $('#menuToggle')?.addEventListener('click', e => { const n = $('.nav'); const o = n.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); });

  /* ───────── painting progress everywhere ───────── */
  function paint() {
    $$('[data-topic]').forEach(el => { const st = topicState(el.dataset.topic); el.classList.toggle('done', st === 'learned' || st === 'mastered'); el.classList.toggle('mastered', st === 'mastered'); el.classList.toggle('some', st === 'started'); });
    $$('[data-read-key]').forEach(el => el.classList.toggle('read', !!S.read[el.dataset.readKey]));
    $$('.prog').forEach(p => {
      const ids = p.dataset.topics.split(' ').filter(Boolean);
      const n = ids.filter(learned).length, m = ids.filter(mastered).length; const pct = ids.length ? Math.round(100 * n / ids.length) : 0;
      p.querySelector('i').style.width = pct + '%'; p.querySelector('.ptxt').textContent = `${n} of ${ids.length} lessons learned${m ? ` · ${m} mastered` : ''}`;
    });
    $$('[data-bookmark]').forEach(b => { const on = !!S.marks[b.dataset.bookmark]; b.classList.toggle('on', on); b.textContent = on ? '★ Bookmarked' : '☆ Bookmark'; });
    $$('[data-mark]').forEach(b => { const on = !!S.read[b.dataset.mark]; b.classList.toggle('on', on); b.textContent = on ? '✓ Read' : 'Mark as read'; });
    const n = dueCount(); const db = $('#dueBadge'); if (db) { db.hidden = !n; db.textContent = n; }
  }
  document.addEventListener('click', e => {
    const m = e.target.closest('[data-bookmark]'), r = e.target.closest('[data-mark]'), kn = e.target.closest('[data-known]');
    if (m) { const id = m.dataset.bookmark; S.marks[id] ? delete S.marks[id] : S.marks[id] = Date.now(); save(); paint(); }
    if (r) { const k = r.dataset.mark; if (S.read[k]) delete S.read[k]; else markRead(k); save(); paint(); refreshLesson(); }
    if (kn) { const id = kn.dataset.known; if (!S.known[id]) { S.known[id] = Date.now(); if (!S.cards['t:' + id]) { S.cards['t:' + id] = { iv: 2, reps: 0, lapses: 0, last: 0, ts: Date.now(), due: startOfDay() + 2 * DAY }; } save(); toast('Marked as known. It will come up in Review in two days to check.'); } paint(); refreshLesson(); }
    const c = e.target.closest('.clamp'); if (c) c.classList.toggle('open');
  });
  function markRead(k) { if (!S.read[k]) { S.read[k] = Date.now(); save(); } }
  $$('textarea[data-note]').forEach(t => {
    t.value = S.notes[t.dataset.note]?.text || '';
    let tm; t.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { const v = t.value.trim(); if (v) S.notes[t.dataset.note] = { text: t.value, ts: Date.now() }; else delete S.notes[t.dataset.note]; save(); $$(`textarea[data-note="${t.dataset.note}"]`).forEach(o => { if (o !== t) o.value = t.value; }); }, 400); });
  });

  /* ───────── history + active time ───────── */
  if (/^\/t\//.test(location.pathname) && $('h1')) {
    S.hist = [{ u: location.pathname, t: document.title.replace(/ · PM Knowledge Graph$/, ''), ts: Date.now() }, ...S.hist.filter(x => x.u !== location.pathname)].slice(0, 40); save();
  }
  if (document.body.classList.contains('reading') || document.body.classList.contains('reviewpage')) {
    let last = Date.now(), acc = 0;
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => addEventListener(ev, () => { last = Date.now(); }, { passive: true }));
    setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - last < 90000) { acc += 5; if (acc >= 30) { S.act[dayKey()] = (S.act[dayKey()] || 0) + acc; acc = 0; save(); } } }, 5000);
    addEventListener('pagehide', () => { if (acc) { S.act[dayKey()] = (S.act[dayKey()] || 0) + acc; save(); } });
  }

  const RC = $('#rctx') ? JSON.parse($('#rctx').textContent) : null;
  /* ───────── path bar on topic and reading pages ───────── */
  const tid = $('#lesson')?.dataset.id || $('article.rd[data-topic-id]')?.dataset.topicId || null;
  async function pathBar() {
    if (!tid) return; await getPath(); if (!PATH.T[tid]) return;
    const it = itemFor(tid); if (!it) return;
    let bar = $('#pbar'); if (!bar) { bar = document.createElement('div'); bar.id = 'pbar'; bar.className = 'pbar'; const c = $('.crumbs'); c ? c.after(bar) : $('main').before(bar); }
    const na = RC ? upcoming(it, hereKind()) : nextAction(it);
    const here = location.pathname;
    const stepChips = it.steps.map(k => `<a href="${stepUrl(it.id, k)}" class="pch${stepDone(it.id, k, it.stage) ? ' ok' : ''}${here === stepUrl(it.id, k).split('#')[0] && (k !== 'recall' || location.hash === '#recall') ? ' cur' : ''}">${k === 'recall' ? 'Recall' : stepLabel(k).replace(/^(Read|Work) /, '')}</a>`).join('<span class="psep">›</span>');
    bar.innerHTML = `<div class="pbin"><a class="pctx" href="/learn/#u${it.unit}"><small>${esc(it.stageLabel)} · Unit ${it.unit} · lesson ${it.pos} of ${it.of}</small><b>${esc(it.unitTitle)}</b></a><div class="psteps">${stepChips}</div>${na ? `<a class="btn pnext" href="${na.url}">${esc(na.label)} →</a>` : ''}</div>`;
  }
  /* topic page lesson panel */
  async function refreshLesson() {
    pathBar(); const L = $('#lesson'); if (!L) { railRender(); return; }
    await getPath(); const id = L.dataset.id; if (!PATH.T[id]) return;
    const it = itemFor(id);
    $$('li[data-step]', L).forEach(li => { const k = li.dataset.step; const st = li.closest('ol').previousElementSibling?.textContent.startsWith('Depth') ? 'depth' : 'found'; li.classList.toggle('done', stepDone(id, k, st)); });
    if (it) $('#lctx').textContent = `${it.stageLabel} · lesson ${it.pos} of ${it.of} in this unit`;
    const na = nextAction(it || { id, stage: 'found', steps: stepsFor(id, 'found') });
    const started = KINDS.some(k => S.read[k + ':' + id]) || learned(id);
    $('#lcta').innerHTML = na ? `<a class="btn big" href="${na.url}">${na.id === id ? (started ? 'Continue: ' : 'Start: ') + esc(na.label) : esc(na.label)} →</a><span class="small muted">${na.id === id ? '' : esc(na.sub) + ' · '}${na.min ? '~' + fmtH(na.min) : ''}</span>` : '';
    const kb = $('[data-known]', L); if (kb) kb.parentElement.hidden = learned(id);
    // readiness
    const pre = $$('.ready li[data-topic]'); if (pre.length) {
      const inPath = pre.filter(li => PATH.T[li.dataset.topic]); const notYet = inPath.filter(li => !learned(li.dataset.topic));
      const note = $('#readyNote'); if (note) note.innerHTML = !inPath.length ? 'What this topic builds on, and why.' : notYet.length ? `<b>${notYet.length} of ${inPath.length} prerequisite lessons not learned yet.</b> The topic will make more sense after them.` : `All ${inPath.length} prerequisite lessons learned.`;
    }
  }
  function placeLesson() { const L = $('#lesson'), d = $('.lesson-d'), m = $('.lesson-m'); if (!L || !d || !m) return; const wide = matchMedia('(min-width: 1100px)').matches; (wide ? d : m).appendChild(L); }
  if ($('#lesson')) { placeLesson(); matchMedia('(min-width: 1100px)').addEventListener('change', placeLesson); }

  /* ───────── reading page: segments, predict, recall, cases ───────── */
  const art = $('article.rd[data-reading]');
  let seg = null, curSec = 1;
  function segment(a) {
    const hs = [...a.querySelectorAll('h2[id]')]; if (hs.length < 3) return null;
    let C = hs[0].parentElement; while (C && !hs.every(h => C.contains(h))) C = C.parentElement;
    if (!C) return null; const map = []; let idx = 0;
    for (const el of C.children) {
      const inside = hs.filter(h => el === h || el.contains(h)); if (inside.length > 1) return null;
      if (inside.length === 1) idx = hs.indexOf(inside[0]) + 1; map.push([el, idx]);
    }
    return { hs, map, n: hs.length };
  }
  const secMode = () => !!seg && (S.prefs.readMode || 'sections') === 'sections';
  function showSec(i, scroll = true) {
    if (!seg) return; curSec = Math.max(1, Math.min(seg.n, i));
    seg.map.forEach(([el, idx]) => el.classList.toggle('seg-hide', secMode() && !(idx === curSec || (idx === 0 && curSec === 1))));
    const key = art.dataset.reading; const st = S.sec[key] || { cur: 1, max: 1 }; st.cur = curSec; st.max = Math.max(st.max || 1, curSec); S.sec[key] = st; save();
    $$('.toc a').forEach((a, j) => { a.classList.toggle('on', secMode() && j + 1 === curSec); a.classList.toggle('seen', j + 1 <= st.max); });
    renderSecnav();
    if (secMode() && curSec === seg.n && !S.read[key] && Date.now() - openedAt > 60000) { markRead(key); paint(); refreshLesson(); }
    const rb = $('#recall'); if (rb) rb.hidden = secMode() && curSec !== seg.n;
    if (scroll && secMode()) art.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  function renderSecnav() {
    const nav = $('#secnav'); if (!nav) return;
    if (!secMode()) { nav.innerHTML = ''; return; }
    const prev = curSec > 1 ? seg.hs[curSec - 2] : null, next = curSec < seg.n ? seg.hs[curSec] : null;
    const dots = seg.hs.map((h, j) => `<button type="button" class="sdot${j + 1 === curSec ? ' on' : ''}${j + 1 <= (S.sec[art.dataset.reading]?.max || 1) ? ' seen' : ''}" data-sec="${j + 1}" aria-label="Section ${j + 1}: ${esc(h.textContent)}"></button>`).join('');
    nav.innerHTML = `<div class="snav">${prev ? `<button type="button" class="btn ghost" data-sec="${curSec - 1}">← ${esc(trim(prev.textContent))}</button>` : '<span></span>'}<div class="sdots" aria-label="Sections">${dots}<span class="small muted">Section ${curSec} of ${seg.n}</span></div>${next ? `<button type="button" class="btn" data-sec="${curSec + 1}">Next: ${esc(trim(next.textContent))} →</button>` : (RC?.recall ? `<a class="btn" href="#recall" data-go-recall>Check yourself →</a>` : `<button type="button" class="btn" data-mark-finish>Finish reading ✓</button>`)}</div>`;
  }
  const trim = s => { s = s.replace(/\s+/g, ' ').trim(); return s.length > 42 ? s.slice(0, 40) + '…' : s; };
  const openedAt = Date.now();
  if (art) {
    const key = art.dataset.reading, kind = art.dataset.kind;
    // reading progress bar, scroll-spy (page mode), text size
    const bar = $('.rprog i'); const links = $$('.toc a');
    let autoMarked = false;
    const onScroll = () => {
      const r = art.getBoundingClientRect(); const total = r.height - innerHeight; const p = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
      if (seg && secMode()) { bar.style.width = ((curSec - 1 + p) / seg.n * 100).toFixed(1) + '%'; return; }
      bar.style.width = (p * 100).toFixed(1) + '%';
      let cur = null; for (const a of links) { const h = document.getElementById(a.getAttribute('href').slice(1)); if (h && h.getBoundingClientRect().top < 140) cur = a; }
      links.forEach(a => a.classList.toggle('on', a === cur));
      if (!autoMarked && p > .92 && Date.now() - openedAt > 60000 && !S.read[key]) { autoMarked = true; markRead(key); paint(); refreshLesson(); toast('Reached the end — marked as read'); }
    };
    addEventListener('scroll', onScroll, { passive: true });
    $('.toc > p')?.addEventListener('click', e => e.currentTarget.parentElement.classList.toggle('open'));
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-rz]'); if (b) { const cur = Number(S.prefs.rz || 1); const d = Number(b.dataset.rz); const v = d === 0 ? 1 : Math.min(1.4, Math.max(.8, +(cur + d * .1).toFixed(2))); S.prefs.rz = v; save(); root.style.setProperty('--rz', v); }
      const s = e.target.closest('[data-sec]'); if (s) { e.preventDefault(); showSec(Number(s.dataset.sec)); }
      const tl = e.target.closest('.toc a'); if (tl && secMode()) { e.preventDefault(); showSec(links.indexOf(tl) + 1); history.replaceState(null, '', tl.getAttribute('href')); }
      if (e.target.closest('[data-go-recall]')) { e.preventDefault(); history.replaceState(null, '', '#recall'); refreshLesson(); $('#recall')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#recallAns')?.focus({ preventScroll: true }); }
      if (e.target.closest('[data-mark-finish]')) { markRead(key); paint(); refreshLesson(); toast('Marked as read'); }
    });
    // segmented reading for explainers (cases stay whole: their exhibits are referred to across sections)
    if (kind.startsWith('exp')) {
      seg = segment(art);
      if (seg) {
        const mt = $('#modeToggle'); mt.hidden = false;
        const setLabel = () => { mt.textContent = secMode() ? 'Show whole page' : 'One section at a time'; };
        mt.addEventListener('click', () => { S.prefs.readMode = secMode() ? 'page' : 'sections'; save(); setLabel(); showSec(curSec, false); onScroll(); });
        setLabel();
        const h = location.hash.slice(1); const fromHash = h && /^s\d+$/.test(h) ? Number(h.slice(1)) : null;
        showSec(location.hash === '#recall' ? seg.n : fromHash || S.sec[key]?.cur || 1, false);
        addEventListener('keydown', e => { if (!secMode() || /INPUT|TEXTAREA/.test(document.activeElement.tagName) || !$('#palette').hidden) return; if (e.key === 'ArrowRight') showSec(curSec + 1); if (e.key === 'ArrowLeft') showSec(curSec - 1); });
      }
    }
    if (RC) { predictBlock(); recallBlock(); }
    if (kind.startsWith('case')) caseBlock(kind);
    onScroll();
    if (location.hash === '#recall') setTimeout(() => $('#recall')?.scrollIntoView({ block: 'start' }), 60);
    addEventListener('hashchange', () => { if (location.hash === '#recall' && seg) showSec(seg.n, false); refreshLesson(); });
  }
  function predictBlock() {
    const box = $('#predict'); if (!box || !RC.recall) return;
    const id = RC.id; if (S.read[RC.kind + ':' + id] && !S.pred[id]) return;
    const render = () => {
      if (S.pred[id]?.text) { box.innerHTML = `<details class="predict done"><summary>Your answer before reading <span class="muted small">(compare as you go)</span></summary><p>${esc(S.pred[id].text)}</p></details>`; return; }
      if (S.pred[id]?.skip) { box.innerHTML = ''; return; }
      box.innerHTML = `<section class="predict"><p class="kicker">Before you read · about a minute</p><h2>${esc(RC.q)}</h2><p class="small muted">Write what you think the answer is, even a guess. Trying first, even wrongly, makes the reading stick.</p><textarea id="predAns" rows="3" placeholder="Your best answer so far…"></textarea><div class="sbtns"><button type="button" class="btn" id="predSave">Save and start reading</button><button type="button" class="linkbtn" id="predSkip">Skip</button></div></section>`;
      $('#predSave').onclick = () => { const v = $('#predAns').value.trim(); S.pred[id] = v ? { text: v, ts: Date.now() } : { skip: 1 }; save(); render(); art.scrollIntoView({ block: 'start' }); };
      $('#predSkip').onclick = () => { S.pred[id] = { skip: 1 }; save(); render(); };
    };
    render();
  }
  function recallBlock() {
    const box = $('#recall'); if (!box || !RC.recall) return; const id = RC.id;
    const render = () => {
      const done = S.recall[id];
      box.innerHTML = `<section class="recallcard" id="recallCard"><p class="kicker">Check yourself · from memory</p><h2>${esc(RC.q)}</h2>
${done ? `<p class="small">Done ${ago(done.ts)} — you rated it <b>${['', 'couldn’t recall', 'partly', 'mostly', 'fully'][done.r]}</b>. It is scheduled in Review. You can redo it any time.</p>` : '<p class="small muted">Without scrolling back, write the answer in your own words: the main idea, how it works, and one thing that commonly goes wrong.</p>'}
<textarea id="recallAns" rows="5" placeholder="Answer from memory…"></textarea>
<div class="sbtns"><button type="button" class="btn" id="recallShow">Check against the page</button></div>
<div id="recallBack" hidden><div class="rback"><p><b>Learning objective</b><br>${esc(RC.obj)}</p><p><b>What the page covered</b></p><ul class="rtoc">${RC.toc.map((h, i) => `<li><a href="#s${i + 1}" data-sec="${i + 1}">${esc(h)}</a></li>`).join('')}</ul>${S.pred[id]?.text ? `<p><b>Your answer before reading</b><br>${esc(S.pred[id].text)}</p>` : ''}</div>
<p class="small"><b>How much of that could you produce from memory?</b> Be strict: recognising it is not the same as recalling it.</p>
<div class="rate">${['Couldn’t recall', 'Partly', 'Mostly', 'Fully'].map((l, i) => `<button type="button" class="btn ghost" data-recall-rate="${i + 1}">${l}</button>`).join('')}</div></div></section>`;
      $('#recallShow').onclick = () => { $('#recallBack').hidden = false; $('#recallShow').hidden = true; };
      $$('[data-recall-rate]', box).forEach(b => b.onclick = async () => {
        const r = Number(b.dataset.recallRate); S.recall[id] = { ts: Date.now(), r }; schedule('t:' + id, r, true); markRead(RC.kind + ':' + id); paint();
        await getPath(); refreshLesson(); render();
        const it = itemFor(id); const na = nextAction(it);
        const after = document.createElement('div'); after.className = 'after';
        after.innerHTML = `<p>${r <= 2 ? 'Worth a second look before moving on: re-read the sections you could not reproduce (click them above), then continue.' : 'Good. It will come back for review in a few days.'}</p>${na ? `<a class="btn big" href="${na.url}">${esc(na.label)} →</a>` : ''}`;
        $('#recallCard').appendChild(after);
      });
    };
    render();
  }
  function caseBlock(kind) {
    const hs = [...art.querySelectorAll('h2')]; const norm = h => h.textContent.toLowerCase();
    const qh = hs.find(h => /questions/.test(norm(h))); const nh = [...art.querySelectorAll('h2,h3,h4')].find(h => /note for the learner|teaching note/.test(norm(h)));
    const id = art.dataset.topicId;
    let noteStart = null, noteParent = null;
    if (nh) { noteParent = nh.parentElement; noteStart = nh; if (noteParent !== art && noteParent.querySelectorAll('h2,h3,h4').length === 1 && noteParent.firstElementChild === nh) { noteStart = noteParent; noteParent = noteParent.parentElement; } }
    if (qh) {
      const tip = document.createElement('div'); tip.className = 'casetip';
      tip.innerHTML = kind === 'case20' ? '<b>Work these before reading on.</b> Write your answers below the questions; the teaching note after them is folded away until you are ready.' : '<b>There is no teaching note in this case.</b> Work the questions and write your recommendation below them; the case is meant to leave you with several defensible answers.';
      qh.before(tip);
      // where the question section ends: before the note heading, or at the end of the article
      const box = document.createElement('div'); box.className = 'caseans';
      box.innerHTML = `<label for="caseAns">${kind === 'case20' ? 'Your answers' : 'Your recommendation and reasoning'}</label><textarea id="caseAns" rows="6" placeholder="Saved in this browser as you type."></textarea>`;
      if (noteStart) noteStart.before(box); else art.appendChild(box);
      const ta = $('#caseAns'); const ak = kind + ':' + id; ta.value = S.ans[ak]?.text || '';
      let tm; ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { S.ans[ak] = { text: ta.value, ts: Date.now() }; save(); }, 400); });
    }
    if (nh) {
      // fold the teaching note: the heading and everything after it in its container
      const start = noteStart;
      const det = document.createElement('details'); det.className = 'tnote';
      det.innerHTML = `<summary>${esc(nh.textContent.trim())} — open once you have worked the questions</summary>`;
      const move = []; let el = start; while (el) { move.push(el); el = el.nextElementSibling; }
      start.before(det); move.forEach(n => det.appendChild(n));
      det.addEventListener('toggle', () => { if (det.open && !S.read[kind + ':' + id]) { /* opening the note is the end of the case */ } });
    }
  }
  /* right rail on reading pages: lesson steps, next step, notes */
  async function railRender() {
    const rail = $('#rail'); if (!rail || !RC) return;
    await getPath(); if (!PATH.T[RC.id]) { rail.innerHTML = notesBox(RC.id); bindNotes(rail); return; }
    const it = itemFor(RC.id); const na = upcoming(it, hereKind());
    rail.innerHTML = `<div class="box"><p class="kicker">This lesson</p><ol class="rsteps">${it.steps.map(k => `<li class="${stepDone(it.id, k, it.stage) ? 'ok' : ''}${(k === RC.kind || (k === 'recall' && location.hash === '#recall')) ? ' cur' : ''}"><a href="${stepUrl(it.id, k)}">${stepLabel(k)}</a></li>`).join('')}</ol>${na ? `<a class="btn" href="${na.url}">${esc(na.label)} →</a>` : ''}</div>${notesBox(RC.id)}`;
    bindNotes(rail);
  }
  const notesBox = id => `<div class="box notes"><p class="kicker">Notes</p><textarea data-note="${esc(id)}" rows="7" placeholder="Private to this browser."></textarea></div>`;
  function bindNotes(r) { $$('textarea[data-note]', r).forEach(t => { t.value = S.notes[t.dataset.note]?.text || ''; let tm; t.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { if (t.value.trim()) S.notes[t.dataset.note] = { text: t.value, ts: Date.now() }; else delete S.notes[t.dataset.note]; save(); }, 400); }); }); }

  /* ───────── prompt studio for readings the source has not written ───────── */
  const studio = $('#studio');
  if (studio) (async () => {
    const ctx = JSON.parse($('#tctx').textContent); const acts = await (await fetch('/data/actions.json')).json(); const a = acts.find(x => x.key === studio.dataset.act);
    const kind = a.kind === 'case' ? `Topic (the lens for this case): ${ctx.title}` : `Topic: ${ctx.title}`;
    const visuals = a.kind === 'case'
      ? 'Present exhibits as clean HTML tables or inline SVG charts with captions and footnotes, numbered and referenced from the text; include one or two illustrations (a timeline, an org sketch, a market map) as inline SVG.'
      : 'Draw every diagram as inline SVG with generous size and clear labels, placed beside or between the paragraphs that discuss it.';
    const parts = [
      ['Role', 'Who Claude should be, and who it is writing for. Change this to move the reading level.', `"${a.persona}"`],
      ['Topic context', 'Where this topic sits in the graph, and what it builds on. Facts, not instructions — edit only to narrow the scope.', `${kind}\nTopic context (from a product-management knowledge graph):\n- Domain › module: ${ctx.domain} › ${ctx.module}\n- Learning objective: ${ctx.obj}\n- The question this topic answers: ${ctx.q}\n- It builds on:\n${ctx.pre}\n- It unlocks: ${ctx.un}\n- How the best programmes teach this module: ${ctx.pedagogy}`],
      ['What to write', 'The shape of the page, section by section. This is the part most worth tweaking.', a.brief.replace('{RAB}', ctx.rab)],
      ['Output format', `A self-contained HTML page of about ${a.words} words. Change the word count here, or ask for markdown instead of HTML.`, `Output contract: respond with ONLY a complete, self-contained HTML document starting with <!doctype html>. Inline CSS only, no <script>, no external images, fonts or links. ${visuals} Light background, a readable serif for body text, comfortable line length (about 70 characters), readable at 900px wide and on a phone. Around ${a.words} words of prose — this is a reading page, not a poster. No preamble, no markdown fences.`]
    ];
    studio.innerHTML = parts.map(([l, h, t], i) => `<label for="pp${i}">${esc(l)}</label><p class="hint">${esc(h)}</p><textarea id="pp${i}" rows="${Math.min(14, Math.ceil(t.length / 90) + 1)}">${esc(t)}</textarea>`).join('');
    const compose = () => `${a.cmd} ${ctx.title}\n\n` + $$('textarea', studio).map(t => t.value).join('\n\n');
    $('#copyPrompt').addEventListener('click', async () => { try { await navigator.clipboard.writeText(compose()); $('#copied').textContent = 'Copied. Paste it into a new Claude chat.'; } catch { $('#copied').textContent = 'Copy failed — select the text and copy manually.'; } });
  })();

  /* ───────── Today dashboard ───────── */
  const dash = $('#dash');
  if (S.prefs.track) root.classList.add('setup');
  if (dash) (async () => {
    await getPath();
    const render = () => {
      if (!S.prefs.track) {
        const hrs = JSON.parse(dash.dataset.hours || '{}');
        dash.innerHTML = `<section class="dcard-main onboard"><p class="kicker">Set up · 10 seconds</p><h2>How do you want to work through the map?</h2>
<div class="tswitch big">${Object.entries(PATH.tracks).map(([k, t]) => `<button type="button" data-pick-track="${k}"><b>${esc(t.label)}</b><span>${k === 'complete' ? 'All ' + (hrs[k]?.lessons ?? '') + ' lessons: Beginner foundations first, then a second pass at depth' : 'The ' + (hrs[k]?.lessons ?? '') + ' topics of the ISB course, session by session, then at depth'} · ~${hrs[k]?.hours ?? '?'} h of reading</span></button>`).join('')}</div>
<p class="goal">Daily goal <select id="goalSel">${[15, 30, 45, 60, 90].map(m => `<option value="${m}"${m === 45 ? ' selected' : ''}>${m} minutes</option>`).join('')}</select> <span class="small muted">You can change both later.</span></p></section>`;
        $$('[data-pick-track]').forEach(b => b.onclick = () => { S.prefs.track = b.dataset.pickTrack; S.prefs.goal = Number($('#goalSel').value); save(); root.classList.add('setup'); render(); paint(); });
        return;
      }
      const it = nextItem(); const na = it ? nextAction(it) : null; const due = dueCount();
      const all = items(); const stages = PATH.tracks[track()].stages.map(st => { const its = all.filter(x => x.stage === st.key); return { label: st.label, n: its.length, d: its.filter(itemDone).length }; });
      const learnedN = Object.keys(PATH.T).filter(learned).length, masteredN = Object.keys(PATH.T).filter(mastered).length;
      const goal = S.prefs.goal || 45; const week = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * DAY); return { k: dayKey(d), lab: d.toLocaleDateString(undefined, { weekday: 'narrow' }), m: Math.round((S.act[dayKey(d)] || 0) / 60) }; });
      const activeDays = week.filter(w => w.m >= 5).length; const today = week[6].m;
      const nextDue = Object.values(S.cards).map(c => c.due).filter(d => d >= startOfDay() + DAY).sort((a, b) => a - b)[0];
      dash.innerHTML = `<section class="dcard-main"><p class="kicker">Up next · ${esc(PATH.tracks[track()].label)}</p>${it ? `<h2><a href="/t/${it.id}/">${esc(PATH.T[it.id][0])}</a></h2><p class="muted">${esc(it.stageLabel)} · Unit ${it.unit}: ${esc(it.unitTitle)} · lesson ${it.pos} of ${it.of}</p>
<ol class="dsteps">${it.steps.map(k => `<li class="${stepDone(it.id, k, it.stage) ? 'ok' : ''}${k === curStep(it) ? ' cur' : ''}">${stepLabel(k)}<small>${k === 'recall' ? '~3 min' : '~' + fmtH(stepMin(it.id, k))}</small></li>`).join('')}</ol>
<p><a class="btn big" href="${na.url}">${esc(na.label)} →</a> <a class="linkbtn" href="/learn/">See the whole path</a></p>` : '<h2>Path complete</h2><p>Every lesson in this path is done. Keep reviewing to hold on to it.</p>'}</section>
<section class="dcard ${due ? 'hot' : ''}"><p class="kicker">Review</p><p class="big">${due}</p><p>${due ? `topic${due === 1 ? '' : 's'} due for recall` : 'nothing due today'}</p>${due ? '<a class="btn" href="/review/">Start review →</a>' : (nextDue ? `<p class="small muted">Next due ${new Date(nextDue).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</p>` : '<p class="small muted">Topics enter review when you finish their recall step.</p>')}</section>
<section class="dcard"><p class="kicker">Progress</p>${stages.map(s => `<p class="small"><b>${esc(s.label)}</b> · ${s.d} of ${s.n}</p><div class="ptrack"><i style="width:${s.n ? (100 * s.d / s.n).toFixed(1) : 0}%"></i></div>`).join('')}<p class="small muted">${learnedN} lesson${learnedN === 1 ? '' : 's'} learned · ${masteredN} mastered</p><p class="small">${PATH.tracks[track()].stages.map(st => { const m = remainingMin(track(), st.key); return `${esc(st.label.split('·')[0].trim())}: ~${fmtH(m)} left (≈${Math.ceil(m / goal)} days at ${goal} min)`; }).join('<br>')}</p></section>
<section class="dcard"><p class="kicker">This week</p><div class="week">${week.map(w => `<span title="${w.k}: ${w.m} min"><i style="height:${Math.min(100, w.m / goal * 100)}%"></i><small>${w.lab}</small></span>`).join('')}</div><p class="small">${today} of ${goal} min today · active ${activeDays} of 7 days</p><p class="small muted"><button type="button" class="linkbtn" id="changeSetup">Change path or goal</button></p></section>`;
      $('#changeSetup').onclick = () => { delete S.prefs.track; save(); root.classList.remove('setup'); render(); };
      const how = $('#howsec'); if (how && learnedN >= 3) how.open = false;
    };
    render();
    // continue list from history (below the dashboard)
  })();

  /* ───────── Learn page ───────── */
  if (document.body.classList.contains('learnpage')) (async () => {
    await getPath();
    const render = () => {
      const tk = track();
      $$('[data-set-track]').forEach(b => b.setAttribute('aria-checked', b.dataset.setTrack === tk));
      $$('.track').forEach(t => t.hidden = t.dataset.track !== tk);
      const T = $(`.track[data-track="${tk}"]`);
      const nx = nextItem(tk);
      $$('.lrow', T).forEach(row => {
        const id = row.dataset.topic, stage = row.dataset.stage; const it = { id, stage, steps: stepsFor(id, stage, tk) };
        row.classList.toggle('ok', itemDone(it)); row.classList.toggle('next', !!nx && nx.id === id && nx.stage === stage);
        $$('.lsteps i', row).forEach(i => i.classList.toggle('ok', stepDone(id, i.dataset.k, stage)));
      });
      $$('details.unit', T).forEach((d, i) => {
        d.id = 'u' + (i + 1);
        const rows = $$('.lrow', d); const n = rows.filter(r => r.classList.contains('ok')).length;
        $('.uprog', d).textContent = `${n}/${rows.length}`; d.classList.toggle('complete', n === rows.length);
        if (rows.some(r => r.classList.contains('next'))) d.open = true;
      });
      const na = nx ? nextAction(nx) : null;
      $('#pathNow').innerHTML = na ? `<div class="nowbar"><span><small>Next</small><b>${esc(PATH.T[nx.id][0])}</b> · ${esc(na.label)}</span><a class="btn" href="${na.url}">Go →</a><a class="linkbtn" href="#" id="jumpNext">Show in path</a></div>` : '<p>Path complete.</p>';
      $('#jumpNext')?.addEventListener('click', e => { e.preventDefault(); $('.lrow.next')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
    };
    $$('[data-set-track]').forEach(b => b.onclick = () => { S.prefs.track = b.dataset.setTrack; save(); render(); });
    render();
    const h = location.hash; if (h && /^#u\d+$/.test(h)) { const el = document.getElementById(h.slice(1)); if (el) { el.open = true; el.scrollIntoView({ block: 'start' }); } }
    else setTimeout(() => $('.lrow.next')?.scrollIntoView({ block: 'center' }), 50);
  })();

  /* ───────── Review ───────── */
  const rv = $('#review');
  if (rv) (async () => {
    const C = await (await fetch('/data/cards.json')).json(); await getPath();
    // introduce connection cards for prerequisite links whose two ends are both learned (at most 8 new a day)
    const todayKey = dayKey(); S.prefs.newEdges = S.prefs.newEdges?.d === todayKey ? S.prefs.newEdges : { d: todayKey, n: 0 };
    for (const [a, b, t, why] of C.e) { const cid = `e:${a}>${b}`; if (S.cards[cid] || S.prefs.newEdges.n >= 8) continue; if (learned(a) && learned(b) && S.recall[b]) { S.cards[cid] = { iv: 0, reps: 0, lapses: 0, last: 0, ts: Date.now(), due: startOfDay() }; S.prefs.newEdges.n++; } }
    save();
    const edge = Object.fromEntries(C.e.map(([a, b, t, why]) => [`e:${a}>${b}`, { a, b, t, why }]));
    const end = startOfDay() + DAY;
    const due = Object.entries(S.cards).filter(([cid, c]) => c.due < end && (cid.startsWith('t:') ? C.t[cid.slice(2)] : edge[cid]));
    // interleave across modules: round-robin by module, most overdue first within each
    const mod = cid => cid.startsWith('t:') ? C.t[cid.slice(2)][5] : C.t[edge[cid].b]?.[5] || 'x';
    const groups = {}; due.sort((a, b) => a[1].due - b[1].due).forEach(([cid]) => (groups[mod(cid)] = groups[mod(cid)] || []).push(cid));
    const queue = []; while (Object.values(groups).some(g => g.length)) for (const g of Object.values(groups)) if (g.length) queue.push(g.shift());
    let i = 0; const results = [];
    const show = () => {
      if (i >= queue.length) {
        const nextDue = Object.values(S.cards).map(c => c.due).filter(d => d >= end).sort((a, b) => a - b)[0];
        rv.innerHTML = `<div class="rvdone"><h2>${queue.length ? 'Review done for today' : 'Nothing to review right now'}</h2>${queue.length ? `<p>${results.filter(r => r >= 3).length} of ${results.length} recalled well. Missed items come back tomorrow.</p>` : `<p>${Object.keys(S.cards).length ? '' : 'A topic enters review when you finish its recall step at the end of the explainer.'}</p>`}${nextDue ? `<p class="muted">Next review: ${new Date(nextDue).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}.</p>` : ''}<p><a class="btn big" href="/learn/">Back to your path →</a></p></div>`;
        paint(); return;
      }
      const cid = queue[i]; const isT = cid.startsWith('t:');
      let front, back, link;
      if (isT) {
        const [title, q, obj, toc, rk] = C.t[cid.slice(2)]; const id = cid.slice(2);
        front = `<p class="kicker">Topic · ${esc(PATH.M[C.t[id][5]] || '')}</p><h2>${esc(title)}</h2><p class="rq">${esc(q)}</p><p class="small muted">Answer from memory: the main idea, how it works, and when it does not apply.</p>`;
        back = `<p><b>Learning objective</b><br>${esc(obj)}</p>${toc.length ? `<p><b>The explainer covers</b></p><ul class="rtoc">${toc.map((h, j) => `<li><a href="/t/${id}/${rk}/#s${j + 1}" target="_blank" rel="noopener">${esc(h)}</a></li>`).join('')}</ul>` : ''}${S.notes[id]?.text ? `<p><b>Your notes</b><br><span style="white-space:pre-wrap">${esc(S.notes[id].text)}</span></p>` : ''}`;
        link = `/t/${id}/`;
      } else {
        const e = edge[cid]; const A = C.t[e.a][0], B = C.t[e.b][0];
        front = `<p class="kicker">Connection</p><h2>Why does “${esc(B)}” ${esc(C.rel[e.t])} “${esc(A)}”?</h2><p class="small muted">Explain the link in a sentence or two before checking.</p>`;
        back = `<p><b>${esc(B)}</b> <span class="rtype t${e.t}">${esc(C.rel[e.t])}</span> <b>${esc(A)}</b></p><p>${esc(e.why)}</p>`;
        link = `/t/${e.b}/`;
      }
      rv.innerHTML = `<div class="rvbar"><span>${i + 1} of ${queue.length}</span><div class="ptrack"><i style="width:${(i / queue.length * 100).toFixed(1)}%"></i></div></div>
<section class="rvcard">${front}<textarea id="rvAns" rows="4" placeholder="Type, or answer out loud (optional)"></textarea>
<div id="rvBack" hidden><div class="rback">${back}</div><p class="small"><b>How well did you recall it?</b></p><div class="rate">${['Missed it', 'Hard', 'Good', 'Easy'].map((l, j) => `<button type="button" class="btn ghost" data-rv="${j + 1}"><b>${j + 1}</b> ${l}</button>`).join('')}</div><p class="small muted"><a href="${link}" target="_blank" rel="noopener">Open the topic in a new tab</a></p></div>
<div class="sbtns" id="rvShowWrap"><button type="button" class="btn" id="rvShow">Show answer <kbd>Space</kbd></button></div></section>`;
      $('#rvShow').onclick = reveal;
      $$('[data-rv]').forEach(b => b.onclick = () => rate(Number(b.dataset.rv)));
    };
    const reveal = () => { $('#rvBack').hidden = false; $('#rvShowWrap').hidden = true; };
    const rate = r => { schedule(queue[i], r); results.push(r); if (r === 1) queue.push(queue[i]); i++; show(); };
    addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) && e.key !== 'Escape') return;
      if (e.key === ' ' && $('#rvShow') && !$('#rvShowWrap').hidden) { e.preventDefault(); reveal(); }
      else if (/^[1-4]$/.test(e.key) && $('#rvBack') && !$('#rvBack').hidden) rate(Number(e.key));
      else if (e.key === 'Escape') document.activeElement.blur();
    });
    show();
  })();

  /* ───────── quick-find palette ───────── */
  const pal = $('#palette'), inp = $('#palInput'), list = $('#palList'); let IDX = null, sel = 0, hits = [];
  async function openPal() {
    pal.hidden = false; inp.value = ''; inp.focus(); renderPal('');
    if (!IDX) { try { IDX = (await (await fetch('/data/search.json')).json()).map(r => ({ id: r[0], t: r[1], q: r[2], m: r[3], l: r[4], f: r[5], o: r[6], hay: (r[1] + ' ' + r[2] + ' ' + r[3] + ' ' + r[6]).toLowerCase(), tl: r[1].toLowerCase() })); renderPal(inp.value); } catch { list.innerHTML = '<li class="muted" style="padding:12px">Could not load the topic index.</li>'; } }
  }
  const closePal = () => { pal.hidden = true; };
  function score(x, terms) {
    let s = 0; for (const w of terms) { const i = x.tl.indexOf(w); if (i === 0) s += 12; else if (i > 0) s += x.tl[i - 1] === ' ' ? 8 : 5; else if (x.hay.includes(w)) s += 2; else return -1; }
    return s + (x.f.includes('1') ? 3 : 0) - x.tl.length / 400;
  }
  const hl = (s, terms) => { let r = esc(s); for (const w of terms) if (w.length > 1) r = r.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); return r; };
  function renderPal(q) {
    if (!IDX) { list.innerHTML = '<li class="muted" style="padding:12px">Loading…</li>'; return; }
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean); const beg = root.classList.contains('ed-b');
    const pool = IDX.filter(x => !beg || x.l === 1);
    if (!terms.length) { const recent = S.hist.slice(0, 8).map(h => IDX.find(x => h.u.startsWith('/t/' + x.id + '/'))).filter(Boolean); hits = recent.length ? [...new Set(recent)] : pool.filter(x => x.f.includes('1')).slice(0, 8); }
    else hits = pool.map(x => [score(x, terms), x]).filter(a => a[0] >= 0).sort((a, b) => b[0] - a[0]).slice(0, 40).map(a => a[1]);
    sel = 0;
    list.innerHTML = hits.length ? hits.map((x, i) => `<li role="option" aria-selected="${i === sel}"><a href="/t/${x.id}/"><b>${hl(x.t, terms)}</b><span>${hl(x.q, terms)}</span><i>${esc(x.m)}<br>${x.f.includes('1') ? `${x.f.split('').filter(c => c === '1').length}/4 readings · ${{ learned: 'learned', mastered: 'mastered', started: 'started' }[topicState(x.id)] || 'lesson'}` : 'outline only'}</i></a></li>`).join('') : `<li class="muted" style="padding:12px">No topic titles match. <a href="/search/?q=${encodeURIComponent(q)}">Search the full text instead →</a></li>`;
  }
  function move(d) { const lis = $$('li[role=option]', list); if (!lis.length) return; sel = (sel + d + lis.length) % lis.length; lis.forEach((l, i) => l.setAttribute('aria-selected', i === sel)); lis[sel].scrollIntoView({ block: 'nearest' }); }
  inp?.addEventListener('input', () => renderPal(inp.value));
  inp?.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { const a = $$('li[role=option] a', list)[sel]; if (a) location.href = a.href; else if (inp.value) location.href = '/search/?q=' + encodeURIComponent(inp.value); }
    else if (e.key === 'Escape') closePal();
  });
  pal?.addEventListener('click', e => { if (e.target === pal) closePal(); });
  $('#openPalette')?.addEventListener('click', openPal); $$('[data-open-palette]').forEach(b => b.addEventListener('click', openPal));
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? openPal() : closePal(); }
    else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && pal.hidden) { e.preventDefault(); openPal(); }
  });

  /* ───────── full-text search page ───────── */
  if ($('#pfsearch') && window.PagefindUI) {
    const ui = new PagefindUI({ element: '#pfsearch', showSubResults: true, showImages: false, resetStyles: false, excerptLength: 26, translations: { placeholder: 'Search 1,700+ reading pages and 1,046 topics' } });
    const q = new URLSearchParams(location.search).get('q'); if (q) ui.triggerSearch(q);
  }

  /* ───────── Me ───────── */
  const me = $('#me');
  if (me) (async () => {
    let IDXm = {}; try { (await (await fetch('/data/search.json')).json()).forEach(r => IDXm[r[0]] = r); } catch {}
    await getPath().catch(() => {});
    const title = id => IDXm[id]?.[1] || id;
    const ids = PATH ? Object.keys(PATH.T) : [];
    const nL = ids.filter(learned).length, nM = ids.filter(mastered).length, nRead = Object.keys(S.read).length;
    const mins = Math.round(Object.values(S.act).reduce((a, b) => a + b, 0) / 60);
    const marks = Object.entries(S.marks).sort((a, b) => b[1] - a[1]), notes = Object.entries(S.notes).sort((a, b) => b[1].ts - a[1].ts);
    const weak = Object.entries(S.cards).filter(([c, v]) => c.startsWith('t:') && v.lapses >= 2).map(([c]) => c.slice(2));
    me.innerHTML = `<div class="mestats"><div class="box"><b>${nL}</b>lessons learned</div><div class="box"><b>${nM}</b>mastered (recalled after 3+ weeks)</div><div class="box"><b>${nRead}</b>readings finished</div><div class="box"><b>${fmtH(mins)}</b>active study time</div></div>
${weak.length ? `<section class="sec"><h2>Topics you keep forgetting</h2><p class="muted small">Missed in review two or more times. Re-reading the explainer's sections you could not recall usually fixes this.</p><div class="chips">${weak.map(id => `<a class="chip" href="/t/${id}/">${esc(title(id))}</a>`).join('')}</div></section>` : ''}
<section class="sec"><h2>Bookmarks</h2>${marks.length ? `<div class="chips">${marks.map(([id]) => `<a class="chip" href="/t/${id}/">${esc(title(id))}</a>`).join('')}</div>` : '<p class="muted">Use ☆ Bookmark on any topic to keep it here.</p>'}</section>
<section class="sec"><h2>Notes</h2>${notes.length ? notes.map(([id, n]) => `<div class="box"><h3><a href="/t/${id}/">${esc(title(id))}</a></h3><p style="white-space:pre-wrap">${esc(n.text)}</p><p class="muted small">${new Date(n.ts).toLocaleString()}</p></div>`).join('') : '<p class="muted">Notes you write on topic and reading pages appear here.</p>'}</section>
<section class="sec"><h2>Recently opened</h2>${S.hist.length ? `<ul class="rlist">${S.hist.map(h => `<li><a href="${h.u}">${esc(h.t)}</a><span class="why">${ago(h.ts)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}</section>`;
  })();
  $('#exportP')?.addEventListener('click', () => { const b = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `pmkg-progress-${dayKey()}.json`; a.click(); });
  $('#importP')?.addEventListener('change', async e => {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      for (const k of ['read', 'done', 'marks', 'notes', 'recall', 'pred', 'known', 'sec', 'ans']) S[k] = Object.assign({}, S[k], d[k] || {});
      for (const [cid, c] of Object.entries(d.cards || {})) if (!S.cards[cid] || (c.ts || 0) > (S.cards[cid].ts || 0)) S.cards[cid] = c;
      for (const [day, v] of Object.entries(d.act || {})) S.act[day] = Math.max(S.act[day] || 0, v);
      S.hist = [...(d.hist || []), ...S.hist].slice(0, 40); S.prefs = Object.assign({}, d.prefs || {}, S.prefs);
      save(); toast('Progress imported and merged'); setTimeout(() => location.reload(), 600);
    } catch { toast('That file is not a progress export'); }
  });
  $('#resetP')?.addEventListener('click', () => { if (confirm('Delete all progress, reviews, bookmarks and notes stored in this browser?')) { localStorage.removeItem(KEY); location.reload(); } });

  /* ───────── misc ───────── */
  $$('.gscroll').forEach(el => { let x0, y0, sx, sy, down = false; el.addEventListener('pointerdown', e => { if (e.target.closest('a')) return; down = true; x0 = e.clientX; y0 = e.clientY; sx = el.scrollLeft; sy = el.scrollTop; el.setPointerCapture(e.pointerId); }); el.addEventListener('pointermove', e => { if (!down) return; el.scrollLeft = sx - (e.clientX - x0); el.scrollTop = sy - (e.clientY - y0); }); el.addEventListener('pointerup', () => down = false); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
  document.addEventListener('click', async e => {
    const b = e.target.closest('.offline'); if (!b) return;
    if (!('caches' in window)) return toast('This browser cannot store pages offline');
    const urls = b.dataset.urls.split(' '); b.disabled = true; let n = 0; const c = await caches.open('pmkg-pages');
    for (let i = 0; i < urls.length; i += 6) { await Promise.all(urls.slice(i, i + 6).map(u => c.add(u).then(() => n++).catch(() => {}))); b.textContent = `Saving… ${n}/${urls.length}`; }
    b.textContent = `✓ ${n} pages saved for offline`;
  });
  $$('a[data-orig]').forEach(a => a.target = '_blank');

  paint();
  if (tid) refreshLesson();
})();
