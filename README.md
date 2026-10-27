# Digital Reader (Chrome extension)

Brings the ideas from the Digital Reader experiment to any article on the web:

- **Cursor tracking:** as your cursor moves along a line, the letters just behind it lift slightly and settle back,
  like a finger running under the text of a book.
- **Anti-skim:** scroll faster than reading pace and the article text scrambles, more the faster you go.
  Slow down and it clears up.
- **Your typography:** pick the font, size, line height and letter spacing for each site.

## Install (developer mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this repository's folder (the one containing `manifest.json`).
4. Optional: pin the extension from the puzzle-piece menu.

After pulling new changes, click the reload icon on the extension's card in `chrome://extensions`.

## Use

- Click the toolbar icon to open the popup, and flip the switch to turn the reader on for this tab.
  **Alt+Shift+R** toggles it without opening the popup. The badge shows **ON**.
- Move your cursor along a line of the article. Resting it just under a line works too.
- Scroll at a reading pace. Fast scrolling scrambles the text until you slow down.
- Reloading the page turns the reader off.
- If your system has "reduce motion" switched on, letters are highlighted instead of moved,
  and fast scrolling fades the text instead of scrambling it.

### Settings

Everything in the popup is saved for the current site as you change it, and applies right away.

| Setting | What it does |
| --- | --- |
| Font | Swap the article font for a system font. "Page font" keeps the site's own. Code stays monospace. |
| Size, Line height, Letter spacing | Slide all the way left for "Page default"; anything else overrides the site. |
| Cursor lift | Turn the letter-lift effect on or off. |
| Anti-skim | Turn the scramble on or off, and choose how fast you can scroll before it starts (Strict ↔ Relaxed). |
| Reset site | Forget this site's settings and go back to your defaults. |
| Set as default | Use the current settings on every site you haven't customized. |

Settings sync across your Chrome profile through `chrome.storage.sync`.

## How it works

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3. Asks for `activeTab`, `scripting` and `storage`, so it can only read a page after you open the popup or press the shortcut. |
| `background.js` | Handles the Alt+Shift+R shortcut and clears the badge on page loads. |
| `reader.js` | Shared by the popup and background: injects the reader into a tab and turns it on or off. |
| `settings.js` | Default settings, the font list, and loading/saving per-site settings. |
| `popup.html` / `.css` / `.js` | The settings popup. |
| `content.js` | Finds the article text, applies your settings, animates the letter lift, and measures scroll speed for anti-skim. |
| `content.css` | Styles for the letters, the typography overrides, the scramble effect and the on/off toast. |
| `test/index.html` | A sample article for testing the page effects in a normal browser tab. |
| `test/popup.html` | The real popup next to the sample article, wired together with a fake `chrome.*` API (`test/chrome-stub.js`). |

- **Finding the article:** looks for `<article>` / `<main>` first, otherwise the container holding the most paragraph text.
  Navigation, sidebars, footers, code blocks and form fields are skipped.
- **Performance:** only the paragraph under the cursor is split into letters, and it's restored when you move on.
  The scramble filter is only applied while you're scrolling too fast.
- **Anti-skim:** scroll speed is smoothed and measured in screen heights per second. Above the "Triggers at" speed
  an SVG noise filter slices the text into shifting bands, reaching full strength at twice that speed.
  Jumps of more than a screen at once (Home key, table-of-contents links) don't count as skimming.
- **Typography:** only settings you've changed are applied, as `!important` overrides on the article's paragraphs.
- **Tuning:** at the top of `content.js`, `LIFT_PX`, `TRAIL` and `EASE` control the lift;
  `MAX_DISPLACE_PX`, `MAX_BLUR_PX` and `MIN_FADE` control how strong anti-skim looks.

## Testing without installing

The pages in `test/` need to be served over HTTP (for example `npx serve .` or `python -m http.server`
from the repository folder). Then open `/test/popup.html` to try the popup and the effects together.

## Known limits

- Doesn't run on `chrome://` pages, the Chrome Web Store or PDFs (Chrome blocks extensions there).
- Pages that rebuild their text with JavaScript while you hover (some React apps) may briefly fight with the effect.
- Fonts are limited to ones already on your computer. Bundling accessible fonts such as Atkinson Hyperlegible or
  OpenDyslexic is a possible next step.
- Uses Chrome's default icon until real icons are added.

## Next phases

4. Extras: reading-speed stats, bundled accessible fonts, Firefox support.
