# Digital Reader (Chrome extension) — MVP

Brings the cursor-tracking idea from the Digital Reader experiment to any article on the web:
as your cursor moves along a line, the letters just behind it lift slightly and settle back,
like a finger running under the text of a book.

## Install (developer mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this repository's folder (the one containing `manifest.json`).
4. Optional: pin the extension from the puzzle-piece menu.

## Use

- Click the toolbar icon, or press **Alt+Shift+R**, to turn it on for the current tab. The badge shows **ON**.
- Move your cursor along a line of the article. Resting it just under a line works too.
- Click again to turn it off. Reloading the page also turns it off.
- If your system has "reduce motion" switched on, letters are highlighted instead of moved.

## How it works

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3. Only asks for `activeTab` + `scripting`, so it can read a page only after you click. |
| `background.js` | Injects the script and styles on click, toggles them, and sets the badge. |
| `content.js` | Finds the article text, splits the paragraph under the cursor into letters, and animates the lift. |
| `content.css` | Styles for the letter elements and the on/off toast. |
| `test/index.html` | A sample article for testing the effect without Chrome's extension machinery. |

- **Finding the article:** looks for `<article>` / `<main>` first, otherwise the container holding the most paragraph text.
  Navigation, sidebars, footers, code blocks and form fields are skipped.
- **Performance:** only the paragraph under the cursor is split into letters, and it's restored when you move on.
- **Tuning:** `LIFT_PX`, `TRAIL` and `EASE` at the top of `content.js` control the lift height, the trail length and the lag.

## Known limits

- Doesn't run on `chrome://` pages, the Chrome Web Store or PDFs (Chrome blocks extensions there).
- Pages that rebuild their text with JavaScript while you hover (some React apps) may briefly fight with the effect.
- Uses Chrome's default icon until real icons are added.

## Next phases

2. Anti-skim: blur or jitter text when scrolling faster than reading pace.
3. Settings popup: font, size, line height and letter spacing, saved per site.
4. Extras: reading-speed stats, Firefox support.
