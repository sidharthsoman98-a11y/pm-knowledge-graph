// Decides whether a new version of the source can simply be added to the site,
// or whether it changes the site's structure and therefore needs the owner's approval.
//
// ADDITIVE (applied automatically): new topics inside existing modules, new or rewritten reading
// pages, wording edits to titles/questions/objectives, new prerequisite links that do not reorder
// existing lessons, outline-only topics gaining readings (they become new lessons).
//
// STRUCTURAL (held for approval): anything that moves, removes or renames what a learner already
// relies on — domains or modules added/removed/renamed/moved, topics removed or moved between
// modules, a topic changing edition (Beginner ↔ Practitioner) or ISB sessions, a lesson losing all
// its readings, or existing lessons changing their relative order in a learning path.
import { buildPath, KINDS } from './path.mjs';

export function writtenMap(src) {
  const D = src.data;
  return Object.fromEntries(D.topics.map(t => [t.id, Object.fromEntries(KINDS.map(k => { const key = D.bundleMap[`${k}-${t.id}`]; return [k, !!(key && src.pages.has(key))]; }))]));
}

export function classify(prev, next) {
  const reasons = [], additions = [];
  const A = prev.data, B = next.data;
  const oT = Object.fromEntries(A.topics.map(t => [t.id, t])), nT = Object.fromEntries(B.topics.map(t => [t.id, t]));
  const oM = Object.fromEntries(A.modules.map(m => [m.key, m])), nM = Object.fromEntries(B.modules.map(m => [m.key, m]));
  const oD = Object.fromEntries(A.domains.map(d => [d.key, d])), nD = Object.fromEntries(B.domains.map(d => [d.key, d]));
  const why = (type, text) => reasons.push({ type, text });

  for (const k of Object.keys(oD)) if (!nD[k]) why('domain-removed', `Domain removed: ${oD[k].name}`); else if (oD[k].name !== nD[k].name) why('domain-renamed', `Domain renamed: ${oD[k].name} → ${nD[k].name}`);
  for (const k of Object.keys(nD)) if (!oD[k]) why('domain-added', `New domain: ${nD[k].name}`);
  for (const k of Object.keys(oM)) {
    if (!nM[k]) why('module-removed', `Module removed: ${oM[k].name}`);
    else { if (oM[k].name !== nM[k].name) why('module-renamed', `Module renamed: ${oM[k].name} → ${nM[k].name}`); if (oM[k].domain !== nM[k].domain) why('module-moved', `Module moved to another domain: ${nM[k].name}`); }
  }
  for (const k of Object.keys(nM)) if (!oM[k]) why('module-added', `New module: ${nM[k].name}`);

  const wA = writtenMap(prev), wB = writtenMap(next);
  const readable = (w, id) => KINDS.some(k => w[id]?.[k]);
  for (const id of Object.keys(oT)) {
    const o = oT[id], n = nT[id];
    if (!n) { why('topic-removed', `Topic removed: ${o.title}`); continue; }
    if (o.module !== n.module) why('topic-moved', `Topic moved from ${oM[o.module]?.name || o.module} to ${nM[n.module]?.name || n.module}: ${n.title}`);
    if (o.level !== n.level) why('edition-changed', `Topic changed edition (${o.level === 1 ? 'Beginner' : 'Practitioner'} → ${n.level === 1 ? 'Beginner' : 'Practitioner'}): ${n.title}`);
    if (JSON.stringify([...o.sessions].sort()) !== JSON.stringify([...n.sessions].sort())) why('sessions-changed', `ISB sessions changed for: ${n.title}`);
    if (readable(wA, id) && !readable(wB, id)) why('lesson-lost', `Lesson lost all its readings: ${n.title}`);
    if (!readable(wA, id) && readable(wB, id)) additions.push(`Outline-only topic gained readings: ${n.title}`);
  }
  for (const id of Object.keys(nT)) if (!oT[id]) additions.push(`New topic in ${nM[nT[id].module]?.name || nT[id].module}: ${nT[id].title}`);

  // relative order of lessons that exist in both versions, per track and stage
  const pA = buildPath(A, wA).tracks, pB = buildPath(B, wB).tracks;
  for (const tk of Object.keys(pA)) for (const [i, st] of pA[tk].stages.entries()) {
    const sB = pB[tk]?.stages[i]; if (!sB) continue;
    const a = st.units.flatMap(u => u.items), b = sB.units.flatMap(u => u.items);
    const common = new Set(a.filter(x => b.includes(x)));
    const a2 = a.filter(x => common.has(x)), b2 = b.filter(x => common.has(x));
    let moved = 0; for (let j = 0; j < a2.length; j++) if (a2[j] !== b2[j]) moved++;
    if (moved) why('path-reordered', `${pA[tk].label} · ${st.label}: ${moved} existing lessons would change position`);
  }
  return { kind: reasons.length ? 'structural' : 'additive', reasons, additions };
}
