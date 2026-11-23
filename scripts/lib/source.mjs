// Reads the original artifact folder exactly as the author ships it.
// Nothing here invents content: every field comes from the source files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function extractData(html, file) {
  const marker = 'const DATA = ';
  const i = html.indexOf(marker);
  if (i < 0) throw new Error(`No "const DATA = " blob found in ${file}`);
  // Walk the JSON object literal by brace depth, respecting strings.
  let j = i + marker.length, depth = 0, inStr = false, esc = false;
  for (; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return JSON.parse(html.slice(i + marker.length, j));
}

export function parseVersion(indexHtml) {
  const text = indexHtml.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const m = text.match(/Version\s+(\d+)\s*·\s*Last updated\s+([0-9]{1,2}\s+\w+\s+\d{4})/);
  return m ? { number: Number(m[1]), updated: m[2] } : { number: null, updated: null };
}

export function loadSource(dir) {
  const need = ['index.html', 'practitioner.html', 'beginner.html', 'b'];
  for (const n of need) if (!fs.existsSync(path.join(dir, n))) throw new Error(`Source folder is missing ${n}: ${dir}`);
  const indexHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const pracHtml = fs.readFileSync(path.join(dir, 'practitioner.html'), 'utf8');
  const begHtml = fs.readFileSync(path.join(dir, 'beginner.html'), 'utf8');
  const data = extractData(pracHtml, 'practitioner.html');
  const bdata = extractData(begHtml, 'beginner.html');

  const pages = new Map();
  const bundleFiles = fs.readdirSync(path.join(dir, 'b')).filter(f => f.endsWith('.json')).sort();
  for (const f of bundleFiles) {
    const obj = JSON.parse(fs.readFileSync(path.join(dir, 'b', f), 'utf8'));
    for (const [k, v] of Object.entries(obj)) if (!pages.has(k)) pages.set(k, v);
  }
  const version = parseVersion(indexHtml);
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(data));
  for (const k of [...pages.keys()].sort()) hash.update(k).update(pages.get(k));
  return { dir, indexHtml, data, bdata, pages, bundleFiles, version, contentHash: hash.digest('hex').slice(0, 16) };
}

export function pageHash(html) {
  return crypto.createHash('sha1').update(html).digest('hex').slice(0, 12);
}
