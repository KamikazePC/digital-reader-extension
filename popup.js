// Settings popup: the reader switch for this tab, and the settings saved for this site.
// Changes are saved as you go; the page picks them up through chrome.storage.onChanged.
const Settings = globalThis.DigitalReaderSettings;
const Tab = globalThis.DigitalReaderTab;
const $ = (id) => document.getElementById(id);

// Sliders for page styling get one extra stop below their minimum that means "page default".
const STYLE_SLIDERS = ['size', 'lineHeight', 'letterSpacing'];

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let host = '';
try {
  host = new URL(tab.url).hostname;
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

function render() {
  $('font').value = settings.font;
  for (const id of STYLE_SLIDERS) {
    const range = $(id);
    const value = settings[id];
    range.value = value === null ? range.min : value;
    $(`${id}-out`).textContent = value === null
      ? 'Page default'
      : `${value.toFixed(+range.dataset.digits)}${range.dataset.unit}`;
  }
  $('lift').checked = settings.lift;
  $('antiSkim').checked = settings.antiSkim;
  $('skimSpeed').value = settings.skimSpeed;
  $('skimSpeed-out').textContent = `${settings.skimSpeed} screens/sec`;
  $('skimSpeed').disabled = !settings.antiSkim;
  $('skimField').setAttribute('aria-disabled', String(!settings.antiSkim));
  $('status').textContent = hasSiteSettings ? 'Saved for this site' : 'Using your defaults';
}

function onInput(e) {
  const { id } = e.target;
  if (STYLE_SLIDERS.includes(id)) settings[id] = readSlider(id);
  else if (id === 'font') settings.font = e.target.value;
  else if (id === 'skimSpeed') settings.skimSpeed = +e.target.value;
  else if (id === 'lift' || id === 'antiSkim') settings[id] = e.target.checked;
  else return;
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

function flash(message) {
  $('status').textContent = message;
  setTimeout(render, 1500);
}

function showNotice(message) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

for (const section of document.querySelectorAll('section')) {
  section.addEventListener('input', onInput);
  section.addEventListener('change', save);
}

$('reset').addEventListener('click', async () => {
  clearTimeout(saveTimer);
  await Settings.resetSite(host);
  await reload();
  flash('Reset to your defaults');
});

$('makeDefault').addEventListener('click', async () => {
  await Settings.saveDefaults(settings);
  flash('Saved as your default');
});

// ---- Reader switch ----

$('enabled').addEventListener('change', async (e) => {
  const want = e.target.checked;
  showNotice('');
  try {
    const on = await Tab.setOn(tab.id, want);
    e.target.checked = on;
    if (want && !on) showNotice('No article text found on this page.');
  } catch {
    e.target.checked = !want;
    showNotice("Chrome doesn't let extensions run on this page.");
  }
});

// ---- Start ----

$('site').textContent = host || 'This page';
await reload();
try {
  $('enabled').checked = await Tab.isOn(tab.id);
} catch {
  showNotice("Chrome doesn't let extensions run on this page.");
  for (const control of document.querySelectorAll('input, select, button')) control.disabled = true;
}
