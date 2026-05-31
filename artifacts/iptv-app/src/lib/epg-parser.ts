export interface EpgProgram {
  channelId: string;
  title: string;
  description: string;
  start: Date;
  stop: Date;
}

export interface EpgChannel {
  id: string;
  name: string;
  icon: string;
}

export interface EpgData {
  channels: Map<string, EpgChannel>;
  programs: Map<string, EpgProgram[]>;
  nameIndex: Map<string, string>;
  fetchedAt: number;
}

export interface NowNextProgram {
  now: EpgProgram | null;
  next: EpgProgram | null;
}

function parseEpgDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  const clean = dateStr.trim();
  const m = clean.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
  if (!m) return new Date(0);
  const [, year, month, day, hour, min, sec, tz] = m;
  let offsetMs = 0;
  if (tz) {
    const sign = tz[0] === '+' ? 1 : -1;
    const h = parseInt(tz.slice(1, 3), 10);
    const mi = parseInt(tz.slice(3, 5), 10);
    offsetMs = sign * (h * 60 + mi) * 60000;
  }
  const utc = Date.UTC(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(min), parseInt(sec)
  );
  return new Date(utc - offsetMs);
}

export function parseEpgXml(xml: string): EpgData {
  const channels = new Map<string, EpgChannel>();
  const programs = new Map<string, EpgProgram[]>();
  const nameIndex = new Map<string, string>();

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    doc.querySelectorAll('channel').forEach((ch) => {
      const id = ch.getAttribute('id') || '';
      if (!id) return;
      const nameEl = ch.querySelector('display-name');
      const iconEl = ch.querySelector('icon');
      const name = nameEl?.textContent?.trim() || id;
      channels.set(id, { id, name, icon: iconEl?.getAttribute('src') || '' });
      nameIndex.set(name.toLowerCase(), id);
    });

    doc.querySelectorAll('programme').forEach((prog) => {
      const channelId = prog.getAttribute('channel') || '';
      const startStr = prog.getAttribute('start') || '';
      const stopStr = prog.getAttribute('stop') || '';
      if (!channelId || !startStr) return;

      const title = prog.querySelector('title')?.textContent?.trim() || '';
      const desc = prog.querySelector('desc')?.textContent?.trim() || '';
      const start = parseEpgDate(startStr);
      const stop = parseEpgDate(stopStr);

      if (!programs.has(channelId)) programs.set(channelId, []);
      programs.get(channelId)!.push({ channelId, title, description: desc, start, stop });
    });

    for (const [, progs] of programs) {
      progs.sort((a, b) => a.start.getTime() - b.start.getTime());
    }
  } catch {
    // silent
  }

  return { channels, programs, nameIndex, fetchedAt: Date.now() };
}

function binarySearchNow(progs: EpgProgram[], now: number): number {
  let lo = 0, hi = progs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const s = progs[mid].start.getTime();
    const e = progs[mid].stop.getTime();
    if (s <= now && e > now) return mid;
    if (e <= now) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function getNowNext(
  epgData: EpgData | null,
  channelId: string
): NowNextProgram {
  if (!epgData || !channelId) return { now: null, next: null };

  const progs = epgData.programs.get(channelId);
  if (!progs || progs.length === 0) return { now: null, next: null };

  const now = Date.now();
  const idx = binarySearchNow(progs, now);

  return {
    now: idx >= 0 ? progs[idx] : null,
    next: idx >= 0 && idx + 1 < progs.length ? progs[idx + 1] : null,
  };
}

export function getProgressPercent(program: EpgProgram | null): number {
  if (!program) return 0;
  const now = Date.now();
  const total = program.stop.getTime() - program.start.getTime();
  const elapsed = now - program.start.getTime();
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function resolveChannelId(
  epgData: EpgData | null,
  tvgId: string,
  tvgName: string,
  channelName: string
): string {
  if (!epgData) return '';

  if (tvgId && epgData.programs.has(tvgId)) return tvgId;
  if (tvgName && epgData.programs.has(tvgName)) return tvgName;

  const lowerName = channelName.toLowerCase();
  const exact = epgData.nameIndex.get(lowerName);
  if (exact) return exact;

  for (const [name, id] of epgData.nameIndex) {
    if (name.includes(lowerName) || lowerName.includes(name)) return id;
  }
  return '';
}
