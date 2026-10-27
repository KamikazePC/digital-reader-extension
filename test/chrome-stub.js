// A small in-memory stand-in for the chrome.storage API, so the pages in test/ run in a normal browser tab.
// A page framed by test/popup.html shares its parent's stub, so the popup and the article see the same storage.
(() => {
  if (window.chrome && window.chrome.storage) return;  // running as a real extension

  let stub = window.parent !== window && window.parent.chromeStub;
  if (!stub) {
    const data = {};
    const listeners = new Set();
    const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
    const emit = (changes) => setTimeout(() => listeners.forEach((fn) => fn(changes, 'sync')));
    stub = {
      storage: {
        sync: {
          async get(keys) {
            const out = {};
            for (const k of [].concat(keys ?? Object.keys(data))) if (k in data) out[k] = copy(data[k]);
            return out;
          },
          async set(items) {
            const changes = {};
            for (const [k, v] of Object.entries(items)) {
              changes[k] = { oldValue: copy(data[k]), newValue: copy(v) };
              data[k] = copy(v);
            }
            emit(changes);
          },
          async remove(keys) {
            const changes = {};
            for (const k of [].concat(keys)) {
              if (k in data) changes[k] = { oldValue: copy(data[k]) };
              delete data[k];
            }
            emit(changes);
          },
        },
        onChanged: {
          addListener: (fn) => listeners.add(fn),
          removeListener: (fn) => listeners.delete(fn),
        },
      },
    };
    window.chromeStub = stub;
  }
  Object.defineProperty(window, 'chrome', { value: stub, configurable: true, writable: true });
})();
