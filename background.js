// The toolbar icon opens the settings popup; Alt+Shift+R toggles the reader without it.
importScripts('reader.js');

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-reader' || !tab) return;
  try {
    await DigitalReaderTab.toggle(tab.id);
  } catch (err) {
    // Chrome blocks extensions on pages like chrome:// and the Web Store.
    console.warn('Digital Reader cannot run on this page:', err.message);
  }
});

// A new page load starts with the reader off.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') DigitalReaderTab.setBadge(tabId, false);
});
