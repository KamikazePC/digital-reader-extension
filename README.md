# Digital Reader (Chrome extension)

Brings the ideas from the Digital Reader experiment to any article on the web:

- **Cursor tracking:** as your cursor moves along a line, the letters just behind it lift slightly and settle back,
  like a finger running under the text of a book.
- **Anti-skim:** scroll faster than reading pace and the article text scrambles, more the faster you go.
  Slow down and it clears up.

## Install (developer mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this repository's folder (the one containing `manifest.json`).
4. Optional: pin the extension from the puzzle-piece menu.

After pulling new changes, click the reload icon on the extension's card in `chrome://extensions`.

## Use

- Click the toolbar icon, or press **Alt+Shift+R**, to turn it on for the current tab. The badge shows **ON**.
- Move your cursor along a line of the article. Resting it just under a line works too.
- Scroll at a reading pace. Fast scrolling scrambles the text until you slow down.
- Click again to turn it off. Reloading the page also turns it off.
- If your system has "reduce motion" switched on, letters are highlighted instead of moved,
  and fast scrolling fades the text instead of scrambling it.

## How it works

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3. Only asks for `activeTab` + `scripting`, so it can read a page only after you click. |
| `background.js` | Injects the script and styles on click, toggles them, and sets the badge. |
| `content.js` | Finds the article text, animates the letter lift, and measures scroll speed for anti-skim. |
| `content.css` | Styles for the letter elements, the scramble effect and the on/off toast. |
| `test/index.html` | A sample article for testing the effects without Chrome's extension machinery. |

- **Finding the article:** looks for `<article>` / `<main>` first, otherwise the container holding the most paragraph text.
  Navigation, sidebars, footers, code blocks and form fields are skipped.
- **Performance:** only the paragraph under the cursor is split into letters, and it's restored when you move on.
  The scramble filter is only applied while you're scrolling too fast.
- **Anti-skim:** scroll speed is smoothed and measured in screen heights per second. Above `SKIM_SPEED` (1.5 screens/s)
  an SVG noise filter slices the text into shifting bands, reaching full strength at twice that speed.
  Jumps of more than a screen at once (Home key, table-of-contents links) don't count as skimming.
- **Tuning:** at the top of `content.js`, `LIFT_PX`, `TRAIL` and `EASE` control the lift;
  `SKIM_SPEED`, `MAX_DISPLACE_PX`, `MAX_BLUR_PX` and `MIN_FADE` control anti-skim.

## Known limits

- Doesn't run on `chrome://` pages, the Chrome Web Store or PDFs (Chrome blocks extensions there).
- Pages that rebuild their text with JavaScript while you hover (some React apps) may briefly fight with the effect.
- Uses Chrome's default icon until real icons are added.

## Next phases

3. Settings popup: font, size, line height and letter spacing, anti-skim on/off and sensitivity, saved per site.
4. Extras: reading-speed stats, Firefox support.
