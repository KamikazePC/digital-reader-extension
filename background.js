// Toolbar button (or Alt+Shift+R) toggles the reader on the current tab.
// The content script is injected only when asked, so the extension needs no access to every site.

chrome.action.onClicked.addListener(async (tab) => {
  const target = { tabId: tab.id };
  try {
    const [{ result: loaded }] = await chrome.scripting.executeScript({
      target,
      func: () => Boolean(window.__digitalReader),
    });
    if (!loaded) {
      await chrome.scripting.insertCSS({ target, files: ['content.css'] });
      await chrome.scripting.executeScript({ target, files: ['content.js'] });
    }
    const [{ result: on }] = await chrome.scripting.executeScript({
      target,
      func: () => window.__digitalReader.toggle(),
    });
    await setBadge(tab.id, on);
  } catch (err) {
    // Chrome blocks extensions on pages like chrome:// and the Web Store.
    console.warn('Digital Reader cannot run on this page:', err.message);
  }
});

// A new page load starts with the reader off.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') setBadge(tabId, false);
});

async function setBadge(tabId, on) {
  await chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' });
  if (on) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b6e4f' });
}
