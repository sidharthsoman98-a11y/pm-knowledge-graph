// Build-time SVG graphs. No client JavaScript needed to see a map.
import dagre from 'dagre';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text, max = 24, lines = 3) {
  const words = String(text).split(/\s+/); const out = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}

/**
 * Dependency graph of a set of topics (module, session or path).
 * nodes: [{id,title,href,level,written,hue}], edges: [[from,to]] (prereq -> dependent)
 */
export function setGraphSvg(nodes, edges, { rankdir = 'LR', label = 'Dependency map' } = {}) {
  if (!nodes.length) return '';
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: 14, ranksep: 46, marginx: 12, marginy: 12 });
  g.setDefaultEdgeLabel(() => ({}));
  const W = 178, LH = 15;
  for (const n of nodes) {
    const lines = wrap(n.title, 25, 3);
    n._lines = lines;
    g.setNode(n.id, { width: W, height: 16 + lines.length * LH });
  }
  const ids = new Set(nodes.map(n => n.id));
  for (const [a, b] of edges) if (ids.has(a) && ids.has(b)) g.setEdge(a, b);
  dagre.layout(g);
  const gr = g.graph();
  const w = Math.ceil(gr.width), h = Math.ceil(gr.height);
  let s = `<svg class="dgraph" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}"><defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="ahd"/></marker></defs>`;
  for (const e of g.edges()) {
    const pts = g.edge(e).points;
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    s += `<path class="de" data-from="${esc(e.v)}" data-to="${esc(e.w)}" d="${d}" marker-end="url(#ah)"/>`;
  }
  for (const n of nodes) {
    const p = g.node(n.id); const x = p.x - p.width / 2, y = p.y - p.height / 2;
    s += `<a href="${esc(n.href)}" class="dn${n.level === 2 ? ' l2' : ''}${n.written ? ' w' : ''}" data-topic="${esc(n.id)}" data-level="${n.level}">` +
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${p.width}" height="${p.height}" rx="7" style="--h:${n.hue}"/>` +
      `<text x="${(x + 10).toFixed(1)}" y="${(y + 20).toFixed(1)}">` +
      n._lines.map((l, i) => `<tspan x="${(x + 10).toFixed(1)}" dy="${i ? LH : 0}">${esc(l)}</tspan>`).join('') +
      `</text><title>${esc(n.title)}</title></a>`;
  }
  return s + '</svg>';
}

/** Three-column neighbourhood: prerequisites → topic → what it unlocks. */
export function localGraphSvg(center, before, after) {
  const MAX = 7;
  const b = before.slice(0, MAX), a = after.slice(0, MAX);
  const moreB = before.length - b.length, moreA = after.length - a.length;
  const rowH = 46, colW = 220, gap = 70;
  const rows = Math.max(b.length + (moreB ? 1 : 0), a.length + (moreA ? 1 : 0), 1);
  const H = rows * rowH + 20, W = colW * 3 + gap * 2;
  const cy = H / 2;
  const colY = (n, i) => (H - n * rowH) / 2 + i * rowH + rowH / 2;
  const node = (t, x, y, cls) => {
    const lines = wrap(t.title, 28, 2);
    const hh = 14 + lines.length * 14;
    return `<a href="${esc(t.href)}" class="ln ${cls}" data-topic="${esc(t.id)}" data-level="${t.level || ''}"><rect x="${x}" y="${(y - hh / 2).toFixed(1)}" width="${colW}" height="${hh}" rx="7"/>` +
      `<text x="${x + 10}" y="${(y - hh / 2 + 18).toFixed(1)}">${lines.map((l, i) => `<tspan x="${x + 10}" dy="${i ? 14 : 0}">${esc(l)}</tspan>`).join('')}</text><title>${esc(t.title + (t.rel ? ' — ' + t.rel : ''))}</title></a>`;
  };
  let s = `<svg class="lgraph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Prerequisites and what this topic unlocks"><defs><marker id="lah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="ahd"/></marker></defs>`;
  const cx0 = colW + gap, cx1 = cx0 + colW;
  const nb = b.length + (moreB ? 1 : 0), na = a.length + (moreA ? 1 : 0);
  b.forEach((t, i) => { const y = colY(nb, i); s += `<path class="le" d="M${colW},${y.toFixed(1)} C${colW + gap / 2},${y.toFixed(1)} ${cx0 - gap / 2},${cy} ${cx0},${cy}" marker-end="url(#lah)"/>`; });
  a.forEach((t, i) => { const y = colY(na, i); s += `<path class="le" d="M${cx1},${cy} C${cx1 + gap / 2},${cy} ${cx1 + gap - gap / 2},${y.toFixed(1)} ${cx1 + gap},${y.toFixed(1)}" marker-end="url(#lah)"/>`; });
  b.forEach((t, i) => { s += node(t, 0, colY(nb, i), 'pre'); });
  if (moreB) s += `<text class="more" x="10" y="${colY(nb, b.length) + 4}">+${moreB} more below</text>`;
  a.forEach((t, i) => { s += node(t, cx1 + gap, colY(na, i), 'post'); });
  if (moreA) s += `<text class="more" x="${cx1 + gap + 10}" y="${colY(na, a.length) + 4}">+${moreA} more below</text>`;
  if (!b.length) s += `<text class="more" x="10" y="${cy + 4}">Starting point — no prerequisites</text>`;
  if (!a.length) s += `<text class="more" x="${cx1 + gap + 10}" y="${cy + 4}">Nothing depends on this yet</text>`;
  const lines = wrap(center.title, 28, 3); const hh = 18 + lines.length * 15;
  s += `<g class="ln self"><rect x="${cx0}" y="${(cy - hh / 2).toFixed(1)}" width="${colW}" height="${hh}" rx="8"/><text x="${cx0 + 12}" y="${(cy - hh / 2 + 21).toFixed(1)}">${lines.map((l, i) => `<tspan x="${cx0 + 12}" dy="${i ? 15 : 0}">${esc(l)}</tspan>`).join('')}</text></g>`;
  return s + '</svg>';
}
