// Settings popup: the reader switch for this tab, and the settings saved for this site.
// Changes are saved as you go; the page picks them up through chrome.storage.onChanged.
const Settings = globalThis.DigitalReaderSettings;
const Tab = globalThis.DigitalReaderTab;
const $ = (id) => document.getElementById(id);

const NO_ARTICLE = 'No article found on this page. Open an article, then turn the reader on.';
const BLOCKED_PAGE = 'Chrome doesn’t allow extensions on this page. Open an article on a regular website to use the reader.';

// Sliders for page styling get one extra stop below their minimum that means "page default".
const STYLE_SLIDERS = ['size', 'lineHeight', 'letterSpacing'];

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let host = '';
let sitePattern = null;  // match pattern for "always on", only for normal web pages
try {
  const url = new URL(tab.url);
  host = url.hostname;
  if (/^https?:$/.test(url.protocol) && host) sitePattern = `*://${host}/*`;
} catch {
  // No readable URL; treated as an unsupported page below.
}

let settings;
let hasSiteSettings = false;
let saveTimer = 0;

// ---- Controls ----

for (const [value, label] of Settings.FONTS) $('font').add(new Option(label, value));
for (const id of STYLE_SLIDERS) {
  const range = $(id);
  range.dataset.min = range.min;
  range.min = String(+range.min - +range.step);
}

function readSlider(id) {
  const range = $(id);
  const value = +range.value;
  if (value < +range.dataset.min - +range.step / 2) return null;
  return +value.toFixed(+range.dataset.digits);
}

// Shows a slider's value beside its label, and gives screen readers the same words instead of a bare number.
function showValue(id, text) {
  $(`${id}-out`).textContent = text;
  $(id).setAttribute('aria-valuetext', text);
}

function render() {
  $('font').value = settings.font;
  for (const id of STYLE_SLIDERS) {
    const range = $(id);
    const value = settings[id];
    range.value = value === null ? range.min : value;
    showValue(id, value === null
      ? 'Page default'
      : `${value.toFixed(+range.dataset.digits)}${range.dataset.unit}`);
  }
  $('lift').checked = settings.lift;
  $('antiSkim').checked = settings.antiSkim;
  $('skimSpeed').value = settings.skimSpeed;
  showValue('skimSpeed', `${settings.skimSpeed} screens/sec`);
  $('skimSpeed').disabled = !settings.antiSkim;
  $('skimField').setAttribute('aria-disabled', String(!settings.antiSkim));
  const status = hasSiteSettings ? 'Saved for this site' : 'Using your defaults';
  if ($('status').textContent !== status) $('status').textContent = status;
}

function onInput(e) {
  const { id } = e.target;
  if (STYLE_SLIDERS.includes(id)) settings[id] = readSlider(id);
  else if (id === 'font') settings.font = e.target.value;
  else if (id === 'skimSpeed') settings.skimSpeed = +e.target.value;
  else if (id === 'lift' || id === 'antiSkim') settings[id] = e.target.checked;
  else return;
  clearFeedback();  // an Undo offered earlier would now throw away this change
  hasSiteSettings = true;
  render();
  // Save shortly after dragging pauses, and right away when a control is let go,
  // since the popup can close at any moment.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 150);
}

async function save() {
  clearTimeout(saveTimer);
  await Settings.save(host, settings);
}

async function reload() {
  ({ settings, hasSiteSettings } = await Settings.load(host));
  render();
}

// Confirms an action in the footer with a way to take it back.
let feedbackTimer = 0;
function confirmWithUndo(message, undo) {
  clearTimeout(feedbackTimer);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Undo';
  button.addEventListener('click', async () => {
    clearFeedback();
    await undo();
    await reload();
  });
  $('feedback').replaceChildren(message, button);
  feedbackTimer = setTimeout(clearFeedback, 8000);
}

function clearFeedback() {
  clearTimeout(feedbackTimer);
  $('feedback').replaceChildren();
}

function showNotice(message) {
  $('notice').textContent = message;
}

for (const section of document.querySelectorAll('section')) {
  section.addEventListener('input', onInput);
  section.addEventListener('change', save);
}

$('reset').addEventListener('click', async () => {
  clearTimeout(saveTimer);
  const before = hasSiteSettings ? { ...settings } : null;
  await Settings.resetSite(host);
  await reload();
  confirmWithUndo('Reset to your defaults.', () => (before ? Settings.save(host, before) : null));
});

$('makeDefault').addEventListener('click', async () => {
  const before = await Settings.loadDefaults();
  await Settings.saveDefaults(settings);
  confirmWithUndo('Saved as your default.', () => Settings.restoreDefaults(before));
});

// ---- Reader switch ----

$('enabled').addEventListener('change', async (e) => {
  const want = e.target.checked;
  showNotice('');
  try {
    const on = await Tab.setOn(tab.id, want);
    e.target.checked = on;
    if (want && !on) showNotice(NO_ARTICLE);
  } catch {
    e.target.checked = !want;
    showNotice(BLOCKED_PAGE);
  }
});

// ---- Always on for this site ----
// Granting the extension access to the site is what makes it "always on": background.js sees the new
// permission and registers the auto-start script. Removing access turns it off again.

$('autoOn').addEventListener('change', async (e) => {
  showNotice('');
  if (e.target.checked) {
    const granted = await chrome.permissions.request({ origins: [sitePattern] });
    e.target.checked = granted;
    if (granted) $('enabled').checked = true;  // background.js turns it on in this tab too
    else showNotice('Always on needs access to this site. Check the box again and choose Allow.');
  } else {
    await chrome.permissions.remove({ origins: [sitePattern] });
  }
});

// ---- Start ----

$('site').textContent = host || 'This page';
if (sitePattern) {
  $('autoOn').checked = await chrome.permissions.contains({ origins: [sitePattern] });
  $('autoOn-hint').textContent = `Starts by itself on every page of ${host}`;
} else {
  $('autoOn').disabled = true;
}
await reload();
try {
  $('enabled').checked = await Tab.isOn(tab.id);
} catch {
  showNotice(BLOCKED_PAGE);
  for (const control of document.querySelectorAll('input, select, button')) control.disabled = true;
}
