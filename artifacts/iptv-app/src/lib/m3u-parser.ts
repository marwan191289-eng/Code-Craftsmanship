export interface PlaylistItem {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  type: 'live' | 'movies' | 'series';
}

function stringToId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function detectTypeFromUrl(url: string): 'live' | 'movies' | 'series' | null {
  const lowerUrl = url.toLowerCase();
  if (/\/movie\//.test(lowerUrl)) return 'movies';
  if (/\/series\//.test(lowerUrl)) return 'series';
  if (/\/live\//.test(lowerUrl)) return 'live';
  if (lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mkv') || lowerUrl.endsWith('.avi')) return 'movies';
  return null;
}

function detectTypeFromGroup(group: string, name: string): 'live' | 'movies' | 'series' {
  const lowerGroup = group.toLowerCase();
  const lowerName = name.toLowerCase();

  const movieKeywords = ['movie', 'vod', 'film', 'cinema', 'افلام', 'فيلم'];
  for (const kw of movieKeywords) {
    if (lowerGroup.includes(kw) || lowerName.includes(kw)) return 'movies';
  }

  const seriesKeywords = ['series', 'show', 'episode', 'season', 'مسلسل', 'مسلسلات'];
  for (const kw of seriesKeywords) {
    if (lowerGroup.includes(kw) || lowerName.includes(kw)) return 'series';
  }

  return 'live';
}

export function parseM3U(content: string): PlaylistItem[] {
  const cleanContent = content.replace(/^\uFEFF/, '');
  const lines = cleanContent.split(/\r?\n/);
  const items: PlaylistItem[] = [];
  let currentItem: Partial<PlaylistItem> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const titleMatch = line.match(/,(.*)$/);

      const group = groupMatch ? groupMatch[1].trim() : 'Uncategorized';
      let name = titleMatch ? titleMatch[1].trim() : 'Unknown';
      name = name.split('#')[0].trim();
      if (!name) name = 'Unknown';

      currentItem = {
        name,
        group,
        logo: logoMatch ? logoMatch[1] : '',
      };
    } else if (line && !line.startsWith('#')) {
      currentItem.url = line;
      currentItem.id = stringToId(line + (currentItem.name || i.toString()));

      if (currentItem.name && currentItem.url) {
        const urlType = detectTypeFromUrl(currentItem.url);
        currentItem.type = urlType ?? detectTypeFromGroup(currentItem.group || '', currentItem.name);
        items.push(currentItem as PlaylistItem);
        currentItem = {};
      }
    }
  }

  if (items.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('http')) {
        items.push({
          id: stringToId(line + i),
          name: `Stream ${i + 1}`,
          url: line,
          group: 'Imported',
          type: detectTypeFromUrl(line) ?? 'live',
          logo: ''
        });
      }
    }
  }

  return items;
}
