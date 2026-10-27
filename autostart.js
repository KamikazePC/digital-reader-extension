// Runs right after content.js on "always on" sites (background.js registers it).
// Starts the reader quietly: pages without an article, like a site's home page, are left alone.
(async () => {
  const reader = window.__digitalReader;
  let on = await reader.setEnabled(true, { quiet: true });
  if (!on) {
    // Some sites render their article after the page has loaded, so look once more.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    on = await reader.setEnabled(true, { quiet: true });
  }
  chrome.runtime.sendMessage({ type: 'reader-state', on }).catch(() => {});
})();
