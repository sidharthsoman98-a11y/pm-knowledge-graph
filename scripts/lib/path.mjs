// The learning path: which readable topics to learn, in what order, in which steps.
// Pure functions of the source graph, so build and verify compute the same thing.
//
// Design (see DESIGN.md):
//  • Only topics with at least one reading in the source become lessons. The other topics stay in
//    the map as outline-only entries (their question and objective are shown wherever they matter).
//  • Order respects every prerequisite, including ones that pass through outline-only topics.
//  • Lessons stay in one module for as long as prerequisites allow (blocked first learning);
//    mixing across modules happens later, in spaced review (interleaving).
//  • Two passes, a spiral: Stage 1 Foundations = Exp20 → recall → Case20 for the Beginner edition;
//    Stage 2 Depth = Exp40 → Case40 for the same topics, plus the Practitioner-only topics in full.

export const KINDS = ['exp20', 'exp40', 'case20', 'case40'];

export function buildPath(D, written) {
  const T = Object.fromEntries(D.topics.map((t, i) => [t.id, { ...t, _i: i }]));
  const has = (id, k) => !!written[id]?.[k];
  const readable = D.topics.filter(t => KINDS.some(k => has(t.id, k))).map(t => t.id);
  const R = new Set(readable);
  const modRank = Object.fromEntries(D.modules.map((m, i) => [m.key, i]));

  // readable ancestors reached directly or through outline-only topics
  const memo = {};
  function effPre(id, stack = new Set()) {
    if (memo[id]) return memo[id];
    const out = new Set();
    for (const p of T[id].prereqs) {
      if (stack.has(p) || !T[p]) continue;
      if (R.has(p)) out.add(p);
      else { stack.add(p); for (const q of effPre(p, stack)) out.add(q); stack.delete(p); }
    }
    return (memo[id] = out);
  }

  // prerequisite-respecting order that stays inside one module as long as it can
  function order(ids) {
    const set = new Set(ids); const pre = {}; ids.forEach(id => (pre[id] = [...effPre(id)].filter(p => set.has(p))));
    const done = new Set(), res = []; let cur = null;
    while (res.length < ids.length) {
      let avail = ids.filter(id => !done.has(id) && pre[id].every(p => done.has(p)));
      if (!avail.length) avail = [ids.find(id => !done.has(id))]; // cycle guard: keep source order
      let pick = avail.filter(id => T[id].module === cur).sort((a, b) => T[a]._i - T[b]._i)[0];
      if (!pick) { pick = avail.sort((a, b) => modRank[T[a].module] - modRank[T[b].module] || T[a]._i - T[b]._i)[0]; cur = T[pick].module; }
      done.add(pick); res.push(pick);
    }
    return res;
  }
  // within-set topological order by source index (used inside sessions)
  function topo(ids) {
    const set = new Set(ids); const pre = {}; ids.forEach(id => (pre[id] = [...effPre(id)].filter(p => set.has(p))));
    const done = new Set(), res = [];
    while (res.length < ids.length) {
      const a = ids.filter(id => !done.has(id) && pre[id].every(p => done.has(p))).sort((x, y) => T[x]._i - T[y]._i);
      const pick = a[0] || ids.find(id => !done.has(id)); done.add(pick); res.push(pick);
    }
    return res;
  }
  // group consecutive lessons of one module into units; fold tiny detours (1–2 lessons) into the next unit
  function units(seq) {
    const runs = [];
    for (const id of seq) { const m = T[id].module; if (!runs.length || runs.at(-1).module !== m) runs.push({ module: m, items: [] }); runs.at(-1).items.push(id); }
    const out = [];
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (r.items.length < 3 && i < runs.length - 1) { runs[i + 1].items = [...r.items, ...runs[i + 1].items]; continue; }
      if (r.items.length < 3 && out.length) { out.at(-1).items.push(...r.items); continue; }
      out.push(r);
    }
    // name a unit by the module of most of its lessons; count repeats of a module ("part 2")
    const seen = {};
    return out.map(u => {
      const cnt = {}; u.items.forEach(id => (cnt[T[id].module] = (cnt[T[id].module] || 0) + 1));
      const module = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
      seen[module] = (seen[module] || 0) + 1;
      return { module, part: seen[module], items: u.items };
    }).map(u => ({ ...u, title: D.modules.find(m => m.key === u.module).name + (seen[u.module] > 1 ? ` (part ${u.part})` : '') }));
  }

  const depthSteps = id => ['exp40', 'case40'].filter(k => has(id, k));
  const L1 = readable.filter(id => T[id].level === 1);
  const depthIds = readable.filter(id => T[id].level === 2 || depthSteps(id).length);
  const sessions = Object.keys(D.sessionTitles).map(Number).sort((a, b) => a - b);
  const seenC = new Set();
  const courseUnits = sessions.map(n => {
    const ids = (D.sessionTopics[n] || []).filter(id => R.has(id) && !seenC.has(id));
    ids.forEach(id => seenC.add(id));
    return { module: null, session: n, title: `S${n} · ${D.sessionTitles[n]}`, items: topo(ids) };
  }).filter(u => u.items.length);
  const courseDepth = courseUnits.map(u => ({ ...u, items: u.items.filter(id => depthSteps(id).length) })).filter(u => u.items.length);

  const tracks = {
    complete: {
      label: 'Complete mastery', short: 'Everything in the map, foundations first',
      stages: [
        { key: 'found', label: 'Stage 1 · Foundations', desc: 'Every Beginner-edition topic: read the working explainer, recall it from memory, then work the decision case.', units: units(order(L1)) },
        { key: 'depth', label: 'Stage 2 · Depth', desc: 'Return to each topic at near-expert depth and work the case with no clear path; Practitioner-only topics are learned here in full.', units: units(order(depthIds)) },
      ],
    },
    course: {
      label: 'ISB course order', short: 'Sessions 1–10 of Software Product Management, then depth',
      stages: [
        { key: 'found', label: 'Pass 1 · Sessions 1–10', desc: 'The topics each session teaches, in session order, prerequisites first within a session.', units: courseUnits },
        { key: 'depth', label: 'Pass 2 · Depth', desc: 'The same sessions again at near-expert depth.', units: courseDepth },
      ],
    },
  };
  return { tracks, readable, R, effPre, T };
}

/** Steps a lesson has in a given stage. Mirrored in site/assets/app.js (stepsFor). */
export function stepsFor(id, stage, level, has, track = 'complete') {
  const f = [];
  if (has('exp20')) f.push('exp20'); else if (has('exp40') && stage === 'found') f.push('exp40');
  if (f.length) f.push('recall');
  if (has('case20')) f.push('case20');
  const d = ['exp40', 'case40'].filter(k => has(k) && !(k === 'exp40' && f.includes('exp40')));
  if (stage === 'found') return f;
  return level === 2 && track === 'complete' ? [...f, ...d] : d;
}
