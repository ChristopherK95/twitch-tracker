// Single source of truth for the dev-only keybinds wired up in App.tsx, so the
// Settings page's "Developer" card (also dev-only — see Settings.tsx) can list them
// without the two drifting apart.
export interface DevKeybind {
  keys: string;
  description: string;
}

export const DEV_KEYBINDS: DevKeybind[] = [
  {
    keys: "Ctrl+Shift+N",
    description: "Simulate a notification (cycles Go-Live → Go-Offline → Metadata Change)",
  },
];
