export interface PlaylistItem {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  type: 'live' | 'movies' | 'series';
  tvgId: string;
  tvgName: string;
}

function fastHash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function extractAttr(line: string, attr: string): string {
  const key = attr + '="';
  const start = line.indexOf(key);
  if (start === -1) return '';
  const vs = start + key.length;
  const end = line.indexOf('"', vs);
  return end === -1 ? '' : line.slice(vs, end);
}

function extractAttrCI(line: string, attr: string): string {
  const lower = line.toLowerCase();
  const key = attr.toLowerCase() + '="';
  const start = lower.indexOf(key);
  if (start === -1) return '';
  const vs = start + key.length;
  const end = line.indexOf('"', vs);
  return end === -1 ? '' : line.slice(vs, end);
}

function extractTitle(line: string): string {
  const commaIdx = line.lastIndexOf(',');
  if (commaIdx === -1) return '';
  let title = line.slice(commaIdx + 1).trim();
  const hashIdx = title.indexOf('#');
  if (hashIdx !== -1) title = title.slice(0, hashIdx).trim();
  return title || '';
}

function detectTypeFromUrl(url: string): 'live' | 'movies' | 'series' | null {
  const lower = url.toLowerCase();
  if (lower.includes('/movie/')) return 'movies';
  if (lower.includes('/series/')) return 'series';
  if (lower.includes('/live/')) return 'live';
  if (lower.endsWith('.mp4') || lower.endsWith('.mkv') || lower.endsWith('.avi')) return 'movies';
  return null;
}

const MOVIE_KW = ['movie', 'vod', 'film', 'cinema', 'افلام', 'فيلم'];
const SERIES_KW = ['series', 'show', 'episode', 'season', 'مسلسل', 'مسلسلات'];

function detectTypeFromGroup(group: string, name: string): 'live' | 'movies' | 'series' {
  const lower = (group + ' ' + name).toLowerCase();
  for (const kw of MOVIE_KW) if (lower.includes(kw)) return 'movies';
  for (const kw of SERIES_KW) if (lower.includes(kw)) return 'series';
  return 'live';
}

export function parseM3U(content: string): PlaylistItem[] {
  const text = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
  const items: PlaylistItem[] = [];

  let pos = 0;
  const len = text.length;
  let pendingMeta: { name: string; logo: string; group: string; tvgId: string; tvgName: string } | null = null;

  while (pos < len) {
    let eol = text.indexOf('\n', pos);
    if (eol === -1) eol = len;

    let line = text.slice(pos, eol);
    if (line.length > 0 && line.charCodeAt(line.length - 1) === 13) {
      line = line.slice(0, -1);
    }
    pos = eol + 1;

    if (line.length === 0) continue;

    if (line.charCodeAt(0) !== 35) {
      if (pendingMeta && line.length > 4) {
        const url = line.trim();
        const urlType = detectTypeFromUrl(url);
        items.push({
          id: fastHash(url + pendingMeta.name),
          name: pendingMeta.name || 'Unknown',
          logo: pendingMeta.logo,
          group: pendingMeta.group,
          url,
          type: urlType ?? detectTypeFromGroup(pendingMeta.group, pendingMeta.name),
          tvgId: pendingMeta.tvgId,
          tvgName: pendingMeta.tvgName,
        });
        pendingMeta = null;
      }
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const logo = extractAttrCI(line, 'tvg-logo');
      const group = extractAttrCI(line, 'group-title') || 'Uncategorized';
      const tvgId = extractAttrCI(line, 'tvg-id');
      const tvgName = extractAttrCI(line, 'tvg-name');
      const name = extractTitle(line) || 'Unknown';
      pendingMeta = { name, logo, group, tvgId, tvgName };
    }
  }

  if (items.length === 0) {
    pos = 0;
    let idx = 0;
    while (pos < len) {
      let eol = text.indexOf('\n', pos);
      if (eol === -1) eol = len;
      const line = text.slice(pos, eol).trim();
      pos = eol + 1;
      if (line.startsWith('http')) {
        items.push({
          id: fastHash(line + idx),
          name: `Stream ${++idx}`,
          url: line,
          group: 'Imported',
          type: detectTypeFromUrl(line) ?? 'live',
          logo: '',
          tvgId: '',
          tvgName: '',
        });
      }
    }
  }

  return items;
}
