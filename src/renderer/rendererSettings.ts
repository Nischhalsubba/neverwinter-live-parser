export type ThemeMode = "obsidian-dark" | "obsidian-flux";

export type ProfileSettings = {
  autoStart: boolean;
  soundAlerts: boolean;
  overlayOpacity: number;
  visualCore: ThemeMode;
  targetFps: 60 | 120;
  reducedMotion: boolean;
  compactMode: boolean;
  smoothTables: boolean;
};

export const DEFAULT_SETTINGS: ProfileSettings = {
  autoStart: true,
  soundAlerts: false,
  overlayOpacity: 85,
  visualCore: "obsidian-dark",
  targetFps: 60,
  reducedMotion: false,
  compactMode: false,
  smoothTables: true
};
