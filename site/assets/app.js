/* PM Knowledge Graph reader — client behaviour. Progressive enhancement: every page works without this file. */
(() => {
  'use strict';
  const KEY = 'pmkg:v1';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const load = () => { try { return Object.assign({ read: {}, done: {}, marks: {}, notes: {}, hist: [], prefs: {} }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return { read: {}, done: {}, marks: {}, notes: {}, hist: [], prefs: {} }; } };
  let S = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save: browser storage is full or blocked.'); } };
  addEventListener('storage', e => { if (e.key === KEY) { S = load(); paint(); } });
  const toast = (msg) => { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };
  const root = document.documentElement;

  /* ── theme, edition, menu ── */
  $('#themeToggle')?.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark'; S.prefs.theme = root.dataset.theme; save();
  });
  $('#edToggle')?.addEventListener('click', () => {
    const b = !root.classList.contains('ed-b'); root.classList.toggle('ed-b', b); S.prefs.edition = b ? 'beginner' : 'all'; save();
    toast(b ? 'Beginner edition: Practitioner-only topics are hidden' : 'Showing all 1,046 topics'); paint();
  });
  $('#menuToggle')?.addEventListener('click', e => { const n = $('.nav'); const o = n.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); });

  /* ── progress painting ── */
  const KINDS = ['exp20', 'exp40', 'case20', 'case40'];
  function topicState(id) {
    if (S.done[id]) return 'done';
    return KINDS.some(k => S.read[k + ':' + id]) ? 'some' : '';
  }
  function paint() {
    $$('[data-topic]').forEach(el => { const st = topicState(el.dataset.topic); el.classList.toggle('done', st === 'done'); el.classList.toggle('some', st === 'some'); });
    $$('[data-read-key]').forEach(el => el.classList.toggle('read', !!S.read[el.dataset.readKey]));
    $$('.prog').forEach(p => {
      let ids = p.dataset.topics.split(' ').filter(Boolean);
      if (root.classList.contains('ed-b')) { /* keep totals honest in Beginner view when the list is on the page */ }
      const n = ids.filter(id => S.done[id]).length; const pct = ids.length ? Math.round(100 * n / ids.length) : 0;
      p.querySelector('i').style.width = pct + '%'; p.querySelector('.ptxt').textContent = `${n} of ${ids.length} ${p.dataset.label}${n ? ` · ${pct}%` : ''}`;
    });
    $$('[data-done]').forEach(b => { const on = !!S.done[b.dataset.done]; b.classList.toggle('on', on); b.textContent = on ? '✓ Understood' : 'Mark as understood'; });
    $$('[data-bookmark]').forEach(b => { const on = !!S.marks[b.dataset.bookmark]; b.classList.toggle('on', on); b.textContent = on ? '★ Bookmarked' : '☆ Bookmark'; });
    $$('[data-mark]').forEach(b => { const on = !!S.read[b.dataset.mark]; b.classList.toggle('on', on); b.textContent = on ? '✓ Read' : 'Mark as read'; });
  }
  document.addEventListener('click', e => {
    const d = e.target.closest('[data-done]'), m = e.target.closest('[data-bookmark]'), r = e.target.closest('[data-mark]');
    if (d) { const id = d.dataset.done; S.done[id] ? delete S.done[id] : S.done[id] = Date.now(); save(); paint(); }
    if (m) { const id = m.dataset.bookmark; S.marks[id] ? delete S.marks[id] : S.marks[id] = Date.now(); save(); paint(); }
    if (r) { const k = r.dataset.mark; S.read[k] ? delete S.read[k] : S.read[k] = Date.now(); save(); paint(); if (S.read[k]) toast('Marked as read'); }
    const c = e.target.closest('.clamp'); if (c) c.classList.toggle('open');
  });
  $$('textarea[data-note]').forEach(t => {
    t.value = S.notes[t.dataset.note]?.text || '';
    let tm; t.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { const v = t.value.trim(); if (v) S.notes[t.dataset.note] = { text: t.value, ts: Date.now() }; else delete S.notes[t.dataset.note]; save(); }, 400); });
  });

  /* ── history (continue where you left off) ── */
  const h1 = $('h1')?.textContent.trim();
  if (h1 && /^\/t\//.test(location.pathname)) {
    S.hist = [{ u: location.pathname, t: document.title.replace(/ · PM Knowledge Graph$/, ''), ts: Date.now() }, ...S.hist.filter(x => x.u !== location.pathname)].slice(0, 30); save();
  }
  const cont = $('#continue');
  if (cont && S.hist.length) {
    cont.hidden = false;
    $('#contList').innerHTML = S.hist.slice(0, 6).map(x => `<a class="card" href="${x.u}"><b>${esc(x.t)}</b><span>${ago(x.ts)}</span></a>`).join('');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function ago(ts) { const m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; return Math.round(h / 24) + ' d ago'; }

  /* ── reading page: progress bar, scroll-spy TOC, auto mark-as-read, text size ── */
  const art = $('article.rd[data-reading]');
  if (art) {
    const bar = $('.rprog i'); const links = $$('.toc a'); const heads = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    const startT = Date.now(); let marked = false;
    const onScroll = () => {
      const r = art.getBoundingClientRect(); const total = r.height - innerHeight; const p = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
      bar.style.width = (p * 100).toFixed(1) + '%';
      let cur = null; for (const h of heads) if (h.getBoundingClientRect().top < 120) cur = h;
      links.forEach(a => a.classList.toggle('on', cur && a.getAttribute('href') === '#' + cur.id));
      if (!marked && p > .92 && Date.now() - startT > 45000 && !S.read[art.dataset.reading]) { marked = true; S.read[art.dataset.reading] = Date.now(); save(); paint(); toast('Reached the end — marked as read'); }
    };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    $('.toc > p')?.addEventListener('click', e => e.currentTarget.parentElement.classList.toggle('open'));
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-rz]'); if (!b) return;
      const cur = Number(S.prefs.rz || 1); const d = Number(b.dataset.rz);
      const v = d === 0 ? 1 : Math.min(1.4, Math.max(.8, +(cur + d * .1).toFixed(2))); S.prefs.rz = v; save(); root.style.setProperty('--rz', v);
    });
  }

  /* ── prompt studio for readings the source has not written ── */
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

  /* ── quick-find palette ── */
  const pal = $('#palette'), inp = $('#palInput'), list = $('#palList'); let IDX = null, sel = 0, items = [];
  async function openPal() {
    pal.hidden = false; inp.value = ''; inp.focus(); render('');
    if (!IDX) { try { IDX = (await (await fetch('/data/search.json')).json()).map(r => ({ id: r[0], t: r[1], q: r[2], m: r[3], l: r[4], f: r[5], o: r[6], hay: (r[1] + ' ' + r[2] + ' ' + r[3] + ' ' + r[6]).toLowerCase(), tl: r[1].toLowerCase() })); render(inp.value); } catch { list.innerHTML = '<li class="muted" style="padding:12px">Could not load the topic index.</li>'; } }
  }
  const closePal = () => { pal.hidden = true; };
  function score(x, terms) {
    let s = 0; for (const w of terms) { const i = x.tl.indexOf(w); if (i === 0) s += 12; else if (i > 0) s += x.tl[i - 1] === ' ' ? 8 : 5; else if (x.hay.includes(w)) s += 2; else return -1; }
    return s + (x.f.includes('1') ? 1 : 0) - x.tl.length / 400;
  }
  const hl = (s, terms) => { let r = esc(s); for (const w of terms) if (w.length > 1) r = r.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); return r; };
  function render(q) {
    if (!IDX) { list.innerHTML = '<li class="muted" style="padding:12px">Loading…</li>'; return; }
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean); const beg = root.classList.contains('ed-b');
    let pool = IDX.filter(x => !beg || x.l === 1);
    if (!terms.length) { const recent = S.hist.slice(0, 8).map(h => IDX.find(x => '/t/' + x.id + '/' === h.u || h.u.startsWith('/t/' + x.id + '/'))).filter(Boolean); items = recent.length ? recent : pool.slice(0, 8); }
    else items = pool.map(x => [score(x, terms), x]).filter(a => a[0] >= 0).sort((a, b) => b[0] - a[0]).slice(0, 40).map(a => a[1]);
    sel = 0;
    list.innerHTML = items.length ? items.map((x, i) => `<li role="option" aria-selected="${i === sel}"><a href="/t/${x.id}/"><b>${hl(x.t, terms)}</b><span>${hl(x.q, terms)}</span><i>${esc(x.m)}<br>${x.f.split('').filter(c => c === '1').length}/4 readings</i></a></li>`).join('') : `<li class="muted" style="padding:12px">No topic titles match. <a href="/search/?q=${encodeURIComponent(q)}">Search the full text instead →</a></li>`;
  }
  function move(d) { const lis = $$('li[role=option]', list); if (!lis.length) return; sel = (sel + d + lis.length) % lis.length; lis.forEach((l, i) => l.setAttribute('aria-selected', i === sel)); lis[sel].scrollIntoView({ block: 'nearest' }); }
  inp?.addEventListener('input', () => render(inp.value));
  inp?.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { const a = $$('li[role=option] a', list)[sel]; if (a) location.href = a.href; else if (inp.value) location.href = '/search/?q=' + encodeURIComponent(inp.value); }
    else if (e.key === 'Escape') closePal();
  });
  pal?.addEventListener('click', e => { if (e.target === pal) closePal(); });
  $('#openPalette')?.addEventListener('click', openPal); $$('[data-open-palette]').forEach(b => b.addEventListener('click', openPal));
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? openPal() : closePal(); }
    else if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && pal.hidden) { e.preventDefault(); openPal(); }
  });

  /* ── full-text search page ── */
  if ($('#pfsearch') && window.PagefindUI) {
    const ui = new PagefindUI({ element: '#pfsearch', showSubResults: true, showImages: false, resetStyles: false, excerptLength: 26, translations: { placeholder: 'Search 1,700+ reading pages and 1,046 topics' } });
    const q = new URLSearchParams(location.search).get('q'); if (q) ui.triggerSearch(q);
  }

  /* ── my learning ── */
  const me = $('#me');
  if (me) (async () => {
    let IDXm = {}; try { (await (await fetch('/data/search.json')).json()).forEach(r => IDXm[r[0]] = r); } catch {}
    const title = id => IDXm[id]?.[1] || id;
    const nDone = Object.keys(S.done).length, nRead = Object.keys(S.read).length;
    const marks = Object.entries(S.marks).sort((a, b) => b[1] - a[1]), notes = Object.entries(S.notes).sort((a, b) => b[1].ts - a[1].ts);
    me.innerHTML = `<div class="mestats"><div class="box"><b>${nDone}</b>topics understood</div><div class="box"><b>${nRead}</b>readings finished</div><div class="box"><b>${marks.length}</b>bookmarks</div><div class="box"><b>${notes.length}</b>notes</div></div>
<section class="sec"><h2>Bookmarks</h2>${marks.length ? `<div class="chips">${marks.map(([id]) => `<a class="chip" href="/t/${id}/">${esc(title(id))}</a>`).join('')}</div>` : '<p class="muted">Use ☆ Bookmark on any topic to keep it here.</p>'}</section>
<section class="sec"><h2>Notes</h2>${notes.length ? notes.map(([id, n]) => `<div class="box"><h3><a href="/t/${id}/">${esc(title(id))}</a></h3><p style="white-space:pre-wrap">${esc(n.text)}</p><p class="muted small">${new Date(n.ts).toLocaleString()}</p></div>`).join('') : '<p class="muted">Notes you write on topic pages appear here.</p>'}</section>
<section class="sec"><h2>Recently opened</h2>${S.hist.length ? `<ul class="rlist">${S.hist.map(h => `<li><a href="${h.u}">${esc(h.t)}</a><span class="why">${ago(h.ts)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}</section>`;
  })();
  $('#exportP')?.addEventListener('click', () => { const b = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `pmkg-progress-${new Date().toISOString().slice(0, 10)}.json`; a.click(); });
  $('#importP')?.addEventListener('change', async e => { try { const d = JSON.parse(await e.target.files[0].text()); for (const k of ['read', 'done', 'marks', 'notes']) S[k] = Object.assign({}, S[k], d[k] || {}); S.hist = [...(d.hist || []), ...S.hist].slice(0, 30); save(); toast('Progress imported and merged'); setTimeout(() => location.reload(), 600); } catch { toast('That file is not a progress export'); } });
  $('#resetP')?.addEventListener('click', () => { if (confirm('Delete all progress, bookmarks and notes stored in this browser?')) { localStorage.removeItem(KEY); location.reload(); } });

  /* ── drag-to-scroll for dependency maps ── */
  $$('.gscroll').forEach(el => { let x0, y0, sx, sy, down = false; el.addEventListener('pointerdown', e => { if (e.target.closest('a')) return; down = true; x0 = e.clientX; y0 = e.clientY; sx = el.scrollLeft; sy = el.scrollTop; el.setPointerCapture(e.pointerId); }); el.addEventListener('pointermove', e => { if (!down) return; el.scrollLeft = sx - (e.clientX - x0); el.scrollTop = sy - (e.clientY - y0); }); el.addEventListener('pointerup', () => down = false); });

  /* ── offline: service worker + "save for offline" ── */
  if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') navigator.serviceWorker?.register('/sw.js').catch(() => {});
  document.addEventListener('click', async e => {
    const b = e.target.closest('.offline'); if (!b) return;
    if (!('caches' in window)) return toast('This browser cannot store pages offline');
    const urls = b.dataset.urls.split(' '); b.disabled = true; let n = 0;
    const c = await caches.open('pmkg-pages');
    for (let i = 0; i < urls.length; i += 6) { await Promise.all(urls.slice(i, i + 6).map(u => c.add(u).then(() => n++).catch(() => {}))); b.textContent = `Saving… ${n}/${urls.length}`; }
    b.textContent = `✓ ${n} pages saved for offline`;
  });
  /* the original map is a separate app; open it in its own tab */
  $$('a[data-orig]').forEach(a => a.target = '_blank');

  paint();
})();
