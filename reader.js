// Turns the reader on or off in a tab. Shared by background.js (keyboard shortcut) and the popup.
// The content script is injected only when asked, so the extension needs no access to every site.
globalThis.DigitalReaderTab ??= {
  async isOn(tabId) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(window.__digitalReader && window.__digitalReader.enabled),
    });
    return result;
  },

  async setOn(tabId, on) {
    const target = { tabId };
    const [{ result: loaded }] = await chrome.scripting.executeScript({
      target,
      func: () => Boolean(window.__digitalReader),
    });
    if (!loaded) {
      await chrome.scripting.insertCSS({ target, files: ['content.css'] });
      await chrome.scripting.executeScript({ target, files: ['settings.js', 'content.js'] });
    }
    const [{ result }] = await chrome.scripting.executeScript({
      target,
      func: (want) => window.__digitalReader.setEnabled(want),
      args: [on],
    });
    await this.setBadge(tabId, result);
    return result;
  },

  async toggle(tabId) {
    return this.setOn(tabId, !(await this.isOn(tabId)));
  },

  async setBadge(tabId, on) {
    await chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' });
    if (on) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b6e4f' });
  },
};
