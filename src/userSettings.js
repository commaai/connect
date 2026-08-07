const DEV_TOOLS_STORAGE_KEY = 'developerToolsEnabled';
export const DEV_TOOLS_CHANGED_EVENT = 'connect:developer-tools-changed';

export const getDeveloperToolsEnabled = () => {
  try {
    return window.localStorage.getItem(DEV_TOOLS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setDeveloperToolsEnabled = (enabled) => {
  const nextValue = Boolean(enabled);

  try {
    window.localStorage.setItem(DEV_TOOLS_STORAGE_KEY, String(nextValue));
  } catch {
    // Keep the setting usable for this session when storage is unavailable.
  }

  window.dispatchEvent(new CustomEvent(DEV_TOOLS_CHANGED_EVENT, {
    detail: { enabled: nextValue },
  }));
};
