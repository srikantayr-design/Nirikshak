export type Preferences = {
  liveIncidentNotifications: boolean;
  soundAlerts: boolean;
  compactDataDensity: boolean;
  mapAutoRefresh: boolean;
  defaultMapLayer: "operational" | "satellite";
};

export const defaultPreferences: Preferences = {
  liveIncidentNotifications: true,
  soundAlerts: true,
  compactDataDensity: false,
  mapAutoRefresh: true,
  defaultMapLayer: "operational",
};

const storageKey = "nirikshak.preferences";

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return defaultPreferences;
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<Preferences> | null;
    return { ...defaultPreferences, ...saved };
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(preferences: Preferences) {
  window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent("nirikshak-preferences-change", { detail: preferences }));
}
