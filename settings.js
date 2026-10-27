// Reader settings, saved per site in chrome.storage.sync.
// Used by the popup and the content script. A site with no saved settings uses your defaults,
// and anything you never set falls back to DEFAULTS below.
globalThis.DigitalReaderSettings ??= (() => {
  const DEFAULTS = {
    font: '',             // CSS font-family; '' keeps the page's font
    size: null,           // px; null keeps the page's size
    lineHeight: null,     // unitless; null keeps the page's line height
    letterSpacing: null,  // em; null keeps the page's spacing
    lift: true,           // cursor lift effect
    antiSkim: true,       // scramble text when scrolling too fast
    skimSpeed: 1.5,       // screens per second before anti-skim kicks in
  };

  // System fonts only, so nothing is downloaded and page security rules can't block them.
  const FONTS = [
    ['', 'Page font'],
    ['Georgia, serif', 'Georgia'],
    ['"Palatino Linotype", Palatino, "Book Antiqua", serif', 'Palatino'],
    ['Verdana, Geneva, sans-serif', 'Verdana'],
    ['"Trebuchet MS", sans-serif', 'Trebuchet'],
    ['Arial, Helvetica, sans-serif', 'Arial'],
    ['system-ui, -apple-system, "Segoe UI", sans-serif', 'System UI'],
    ['"Comic Sans MS", "Comic Sans", cursive', 'Comic Sans'],
    ['Consolas, "Courier New", monospace', 'Monospace'],
  ];

  const siteKey = (host) => `site:${host}`;
  const pick = (s) => Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, s[k]]));

  async function load(host) {
    const key = siteKey(host);
    const stored = await chrome.storage.sync.get(['defaults', key]);
    return {
      settings: { ...DEFAULTS, ...stored.defaults, ...stored[key] },
      hasSiteSettings: Boolean(stored[key]),
    };
  }

  const save = (host, settings) => chrome.storage.sync.set({ [siteKey(host)]: pick(settings) });
  const resetSite = (host) => chrome.storage.sync.remove(siteKey(host));
  const saveDefaults = (settings) => chrome.storage.sync.set({ defaults: pick(settings) });

  return { DEFAULTS, FONTS, siteKey, load, save, resetSite, saveDefaults };
})();
