// The toolbar icon opens the settings popup; Alt+Shift+R toggles the reader without it.
// "Always on" sites: granting the extension access to a site (from the popup checkbox) registers a
// content script there that starts the reader on every page load. Removing access unregisters it.
importScripts('reader.js');

const AUTO_PREFIX = 'auto-';
const hostOf = (origin) => origin.replace(/^\*:\/\//, '').replace(/\/\*$/, '');

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-reader' || !tab) return;
  try {
    await DigitalReaderTab.toggle(tab.id);
  } catch (err) {
    // Chrome blocks extensions on pages like chrome:// and the Web Store.
    console.warn('Digital Reader cannot run on this page:', err.message);
  }
});

// A new page load starts with the reader off (an "always on" site turns it back on right after).
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') DigitalReaderTab.setBadge(tabId, false);
});

// autostart.js reports whether it turned the reader on.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === 'reader-state' && sender.tab) {
    DigitalReaderTab.setBadge(sender.tab.id, message.on);
  }
});

// ---- Always-on sites ----

// Make the registered auto-start scripts match the sites the extension has access to.
// Runs one at a time, since registering an id twice throws.
let syncing = Promise.resolve();
function syncAutoScripts() {
  syncing = syncing.then(async () => {
    const { origins = [] } = await chrome.permissions.getAll();
    const wanted = new Map(origins.map((origin) => [AUTO_PREFIX + hostOf(origin), origin]));
    const ours = (await chrome.scripting.getRegisteredContentScripts())
      .filter((script) => script.id.startsWith(AUTO_PREFIX));

    const stale = ours.filter((script) => !wanted.has(script.id)).map((script) => script.id);
    if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });

    const have = new Set(ours.map((script) => script.id));
    const missing = [...wanted].filter(([id]) => !have.has(id)).map(([id, origin]) => ({
      id,
      matches: [origin],
      css: ['content.css'],
      js: ['settings.js', 'content.js', 'autostart.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    }));
    if (missing.length) await chrome.scripting.registerContentScripts(missing);
  }).catch((err) => console.warn('Digital Reader: could not update always-on sites:', err.message));
  return syncing;
}

// Handled here rather than in the popup, because the popup can close while Chrome shows its permission prompt.
chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  await syncAutoScripts();
  // Pages already open on the site don't get the new script until they reload, so turn the reader on now.
  for (const origin of origins) {
    for (const tab of await chrome.tabs.query({ url: origin })) {
      DigitalReaderTab.setOn(tab.id, true).catch(() => {});
    }
  }
});

chrome.permissions.onRemoved.addListener(syncAutoScripts);
chrome.runtime.onInstalled.addListener(syncAutoScripts);
chrome.runtime.onStartup.addListener(syncAutoScripts);
