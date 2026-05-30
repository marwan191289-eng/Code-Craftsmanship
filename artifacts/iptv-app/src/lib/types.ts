export interface Profile {
  id: number;
  name: string;
  mode: string;
  m3uUrl: string | null;
  m3uContent: string | null;
  epgUrl: string | null;
  serverUrl: string | null;
  username: string | null;
  password: string | null;
  favorites: string[] | null;
  continueWatching: Record<string, { time: number; duration: number }> | null;
}

export interface InsertProfile {
  name: string;
  mode: string;
  m3uUrl?: string | null;
  m3uContent?: string | null;
  epgUrl?: string | null;
  serverUrl?: string | null;
  username?: string | null;
  password?: string | null;
  favorites?: string[] | null;
  continueWatching?: Record<string, { time: number; duration: number }> | null;
}
