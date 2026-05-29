import type { Settings } from "./sheetsLogic";
import { defaultSettings } from "./sheetsLogic";

const KEY = "sheets-reader-settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    const base = defaultSettings();
    return {
      ...base,
      ...parsed,
      cellRange: parsed.cellRange ?? parsed.range?.split("!").pop() ?? base.cellRange,
      sheetTabs: parsed.sheetTabs ?? base.sheetTabs,
      actionFilter: parsed.actionFilter ?? base.actionFilter,
      hiddenStatuses: parsed.hiddenStatuses ?? base.hiddenStatuses,
      includeSharedAssignees:
        parsed.includeSharedAssignees ?? base.includeSharedAssignees,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
