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

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    doc.querySelectorAll('channel').forEach((ch) => {
      const id = ch.getAttribute('id') || '';
      if (!id) return;
      const nameEl = ch.querySelector('display-name');
      const iconEl = ch.querySelector('icon');
      channels.set(id, {
        id,
        name: nameEl?.textContent?.trim() || id,
        icon: iconEl?.getAttribute('src') || '',
      });
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
  } catch {
    // silent
  }

  return { channels, programs, fetchedAt: Date.now() };
}

export function getNowNext(
  epgData: EpgData | null,
  channelId: string
): NowNextProgram {
  if (!epgData || !channelId) return { now: null, next: null };

  const progs = epgData.programs.get(channelId);
  if (!progs || progs.length === 0) return { now: null, next: null };

  const now = Date.now();
  const sorted = [...progs].sort((a, b) => a.start.getTime() - b.start.getTime());

  let nowIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].start.getTime() <= now && sorted[i].stop.getTime() > now) {
      nowIdx = i;
      break;
    }
  }

  return {
    now: nowIdx >= 0 ? sorted[nowIdx] : null,
    next: nowIdx >= 0 && nowIdx + 1 < sorted.length ? sorted[nowIdx + 1] : null,
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
  for (const [id] of epgData.channels) {
    const ch = epgData.channels.get(id);
    if (ch?.name.toLowerCase() === lowerName) return id;
  }
  for (const [id] of epgData.channels) {
    const ch = epgData.channels.get(id);
    if (ch && (ch.name.toLowerCase().includes(lowerName) || lowerName.includes(ch.name.toLowerCase()))) {
      return id;
    }
  }
  return '';
}
