// Digital Reader content script.
// Lifts the letters just behind the cursor, like a finger running under a line in a book,
// scrambles the text when you scroll too fast, and applies your font and spacing settings.
// reader.js injects it (after settings.js) on demand; window.__digitalReader.setEnabled() turns it on and off.
(() => {
  if (window.__digitalReader) return;

  const Settings = globalThis.DigitalReaderSettings;
  const host = location.hostname;

  const LIFT_PX = 4;   // how far the letter right at the cursor rises
  const TRAIL = 6;     // how many letters behind the cursor lift, tapering off
  const EASE = 0.2;    // share of the remaining distance covered each frame (lower = more lag)
  const MIN_CHARS = 25;

  // Anti-skim: scrolling faster than settings.skimSpeed (screen heights per second) scrambles
  // the text, reaching full strength at twice that speed.
  const MAX_DISPLACE_PX = 16;  // how far the scramble shifts slices of text
  const MAX_BLUR_PX = 1.5;
  const MIN_FADE = 0.35;       // opacity at full strength when reduced motion is on
  // Skimming has a cost: once you stop, the text stays scrambled for a while before clearing,
  // so racing ahead doesn't get you anywhere faster.
  const HOLD_BASE_S = 1;       // every skim holds the scramble at least this long...
  const HOLD_PER_S = 2;        // ...plus this much per second spent skimming at full strength
  const HOLD_MAX_S = 5;
  const RECOVER_S = 1.5;       // after the hold, the text clears over about this long

  const BLOCKS = 'p, li, blockquote, dd, figcaption';
  const SKIP = 'pre, code, kbd, samp, script, style, textarea, input, select, button, svg, math, [contenteditable]:not([contenteditable="false"])';
  const PAGE_CHROME = 'nav, aside, footer, [role="navigation"], [role="complementary"], [role="contentinfo"]';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const graphemes = (s) => (segmenter ? Array.from(segmenter.segment(s), (g) => g.segment) : Array.from(s));

  let settings = { ...Settings.DEFAULTS };
  let enabled = false;
  let switching = Promise.resolve(enabled);  // serializes on/off requests
  let blocks = [];
  let active = null;       // the paragraph currently split into letters: { el, wrappers, chars, lines }
  const lift = new Map();  // letter -> current lift in px
  const goal = new Map();  // letter -> lift it is easing toward
  let pointer = null;      // last cursor position, client coordinates
  let pointerDirty = false;
  let frame = 0;

  let scrollSpeed = 0;              // smoothed scroll speed, px per second
  let lastScrollAt = 0;
  let skim = 0;                     // current distortion strength, 0..1
  let skimPainted = 0;
  let penalty = 0;                  // strength the text is held at after skimming, 0..1
  let holdS = 0;                    // extra hold time earned by skimming
  let holdUntil = 0;                // when the text starts clearing
  let lastSkimTick = 0;
  let scrollState = new WeakMap();  // scroller -> { pos, t, holdsArticle }
  let svg = null;                   // holds the scramble filter

  // ---- Finding the article ----

  const textLength = (el) => el.textContent.trim().length;

  function isReadable(el) {
    return textLength(el) >= MIN_CHARS &&
      !el.closest(SKIP) &&
      !el.closest(PAGE_CHROME) &&
      !el.querySelector(BLOCKS) &&     // use the innermost block, e.g. the <p> inside an <li>
      el.getClientRects().length > 0;  // visible
  }

  // The article is the container holding the most readable text.
  function findBlocks() {
    const all = [...document.querySelectorAll(BLOCKS)].filter(isReadable);
    const textIn = (root) => all.reduce((n, b) => n + (root.contains(b) ? textLength(b) : 0), 0);

    let root = document.querySelector('article, main, [role="main"]');
    if (!root || textIn(root) < 500) {
      const byParent = new Map();
      for (const b of all) byParent.set(b.parentElement, (byParent.get(b.parentElement) || 0) + textLength(b));
      root = null;
      let best = 0;
      for (const [el, n] of byParent) if (n > best) { root = el; best = n; }
      // Articles are often split across sibling sections, so widen while that adds a lot of text.
      for (let i = 0; root && i < 3; i++) {
        const up = root.parentElement;
        if (!up || up === document.body || textIn(up) < textIn(root) * 1.2) break;
        root = up;
      }
    }
    return root ? all.filter((b) => root.contains(b)) : all;
  }

  // ---- Splitting one paragraph into letters ----
  // Only the paragraph under the cursor is split, and it is put back when the cursor moves on.
  // Existing elements (links, emphasis) stay in place; only their text nodes are swapped.

  function activate(el) {
    if (active && active.el === el) return;
    deactivate();
    const texts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest(SKIP)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    while (walker.nextNode()) texts.push(walker.currentNode);

    const wrappers = [];
    const chars = [];
    for (const node of texts) {
      const wrapper = document.createElement('dr-text');
      for (const g of graphemes(node.nodeValue)) {
        if (/^\s+$/.test(g)) { wrapper.append(g); continue; }
        const c = document.createElement('dr-c');
        c.textContent = g;
        wrapper.append(c);
        chars.push(c);
      }
      wrappers.push([wrapper, node.nodeValue]);
      node.replaceWith(wrapper);
    }
    active = { el, wrappers, chars, lines: null };
  }

  function deactivate() {
    if (!active) return;
    for (const [wrapper, text] of active.wrappers) wrapper.replaceWith(text);
    lift.clear();
    goal.clear();
    active = null;
  }

  // ---- Working out which letters to lift ----

  const offset = (c) => (c.style.top ? -parseFloat(c.style.top) : 0);

  // Group the letters into visual lines, measuring where they sit without any lift.
  function measureLines() {
    const lines = [];
    let line = null;
    active.chars.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const top = r.top + offset(c);
      if (!line || top > line.top + r.height / 2) {
        line = { top, bottom: top + r.height, right: r.right, start: i, lefts: [] };
        lines.push(line);
      }
      line.bottom = Math.max(line.bottom, top + r.height);
      line.right = Math.max(line.right, r.right);
      line.lefts.push(r.left);
    });
    return lines;
  }

  function setGoals() {
    goal.clear();
    if (!active || !pointer || !settings.lift) return;
    active.lines ||= measureLines();
    const { x, y } = pointer;

    // A finger sits just under the line it reads, so the cursor reads the line it is on,
    // or the line just above it when it is in the gap between lines.
    let line = null;
    for (const l of active.lines) {
      if (l.top <= y) line = l;
      else break;
    }
    if (!line || y > line.bottom + (line.bottom - line.top) || x > line.right + 30) return;

    let idx = -1;
    for (let i = 0; i < line.lefts.length && line.lefts[i] <= x; i++) idx = i;
    if (idx < 0) return;

    for (let k = 0; k < TRAIL && idx - k >= 0; k++) {
      goal.set(active.chars[line.start + idx - k], LIFT_PX * (1 - k / TRAIL));
    }
  }

  // ---- Animation ----

  function schedule() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function tick() {
    frame = 0;
    if (!enabled) return;
    if (pointerDirty) {
      pointerDirty = false;
      setGoals();
    }
    const still = reduceMotion.matches;
    let moving = false;
    for (const c of new Set([...lift.keys(), ...goal.keys()])) {
      const to = goal.get(c) || 0;
      const from = lift.get(c) || 0;
      let now = still ? to : from + (to - from) * EASE;
      if (Math.abs(to - now) < 0.05) now = to;
      if (now) lift.set(c, now);
      else lift.delete(c);
      if (still) {
        // With reduced motion, highlight the letters instead of moving them.
        c.toggleAttribute('data-lit', now > 0);
      } else {
        c.style.top = now ? `${-now.toFixed(2)}px` : '';
      }
      if (now !== to) moving = true;
    }
    if (updateSkim()) moving = true;
    if (moving) schedule();
  }

  // ---- Anti-skim ----

  // Returns true while the distortion is still changing and needs more frames.
  function updateSkim() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (lastSkimTick || now)) / 1000);
    lastSkimTick = now;

    // Without new scroll events the speed decays to zero.
    if (now - lastScrollAt > 80) scrollSpeed *= 0.8;
    if (scrollSpeed < 5) scrollSpeed = 0;

    const pageSpeed = scrollSpeed / innerHeight;
    const limit = settings.skimSpeed;
    const target = settings.antiSkim ? Math.min(1, Math.max(0, (pageSpeed - limit) / limit)) : 0;

    if (!settings.antiSkim) {
      penalty = 0;
      holdS = 0;
    } else if (target > 0) {
      // Skimming: scramble at least this hard, and earn a longer wait once you stop.
      penalty = Math.max(penalty, target);
      holdS = Math.min(HOLD_MAX_S - HOLD_BASE_S, holdS + dt * HOLD_PER_S * target);
      holdUntil = now + (HOLD_BASE_S + holdS) * 1000;
    } else if (now >= holdUntil) {
      // Wait over: clear gradually. Slow scrolling during the wait doesn't shorten it.
      penalty = Math.max(0, penalty - dt / RECOVER_S);
      if (penalty === 0) holdS = 0;
    }

    // Come on quickly; clearing is already paced by the penalty.
    skim = penalty > skim ? skim + (penalty - skim) * 0.5 : penalty;
    if (Math.abs(penalty - skim) < 0.01) skim = penalty;
    paintSkim();
    return skim > 0 || scrollSpeed > 0;
  }

  function paintSkim() {
    const root = document.documentElement;
    if (skim === 0) {
      if (skimPainted !== 0) {
        root.removeAttribute('data-dr-skim');
        root.style.removeProperty('--dr-skim-blur');
        root.style.removeProperty('--dr-skim-fade');
        skimPainted = 0;
      }
      return;
    }
    if (reduceMotion.matches) {
      root.setAttribute('data-dr-skim', 'still');
      root.style.setProperty('--dr-skim-fade', (1 - (1 - MIN_FADE) * skim).toFixed(3));
    } else {
      root.setAttribute('data-dr-skim', 'move');
      root.style.setProperty('--dr-skim-blur', `${(MAX_BLUR_PX * skim).toFixed(2)}px`);
      const [noise, displace] = svg.querySelectorAll('feTurbulence, feDisplacementMap');
      displace.setAttribute('scale', (MAX_DISPLACE_PX * skim).toFixed(1));
      noise.setAttribute('seed', String(Math.floor(Math.random() * 1000)));  // new pattern each frame
    }
    skimPainted = skim;
  }

  function onScroll(e) {
    onLayoutChange();
    const scroller = e.target === document ? document.scrollingElement : e.target;
    if (!(scroller instanceof Element)) return;
    const now = performance.now();
    const pos = scroller.scrollTop;
    let state = scrollState.get(scroller);
    if (!state) {
      // Only scrolling that moves the article counts, not a sidebar or a code box.
      state = { holdsArticle: scroller === document.scrollingElement || blocks.some((b) => scroller.contains(b)) };
      scrollState.set(scroller, state);
    }
    const dt = (now - state.t) / 1000;
    // A jump of more than a screen at once (Home key, a table-of-contents link) is navigation, not skimming.
    const jumped = Math.abs(pos - state.pos) > innerHeight;
    if (state.holdsArticle && dt > 0 && dt < 0.2 && !jumped) {
      scrollSpeed += (Math.abs(pos - state.pos) / dt - scrollSpeed) * 0.35;
      lastScrollAt = now;
    }
    state.pos = pos;
    state.t = now;
  }

  // An SVG filter that slices the text into horizontal bands and shifts them sideways.
  function createScrambleFilter() {
    const ns = 'http://www.w3.org/2000/svg';
    const el = (name, attrs) => {
      const node = document.createElementNS(ns, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      return node;
    };
    const root = el('svg', { 'aria-hidden': 'true', width: '0', height: '0', style: 'position:absolute;width:0;height:0' });
    const filter = el('filter', { id: 'dr-scramble', x: '-5%', y: '-20%', width: '110%', height: '140%' });
    filter.append(
      el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.008 0.6', numOctaves: '1', seed: '1', result: 'noise' }),
      el('feDisplacementMap', { in: 'SourceGraphic', in2: 'noise', scale: '0', xChannelSelector: 'R', yChannelSelector: 'G' }),
    );
    root.append(filter);
    return root;
  }

  // ---- Settings ----

  // [setting, attribute on <html>, CSS variable, how to write the value]; content.css does the rest.
  const TYPOGRAPHY = [
    ['font', 'data-dr-font', '--dr-font', (v) => v],
    ['size', 'data-dr-size', '--dr-size', (v) => `${v}px`],
    ['lineHeight', 'data-dr-line', '--dr-line', (v) => String(v)],
    ['letterSpacing', 'data-dr-spacing', '--dr-spacing', (v) => `${v}em`],
  ];

  function applyTypography(on) {
    const root = document.documentElement;
    for (const [key, attr, prop, format] of TYPOGRAPHY) {
      const value = settings[key];
      if (on && value !== null && value !== '') {
        root.setAttribute(attr, '');
        root.style.setProperty(prop, format(value));
      } else {
        root.removeAttribute(attr);
        root.style.removeProperty(prop);
      }
    }
  }

  async function loadSettings() {
    ({ settings } = await Settings.load(host));
    if (!enabled) return;
    applyTypography(true);
    if (!settings.lift) deactivate();
    onLayoutChange();  // text may have moved
  }

  function onStorageChange(changes, area) {
    if (area === 'sync' && (changes.defaults || changes[Settings.siteKey(host)])) loadSettings();
  }

  // ---- Events ----

  function onPointerMove(e) {
    pointer = { x: e.clientX, y: e.clientY };
    const block = e.target instanceof Element ? e.target.closest('[data-dr-block]') : null;
    if (block && settings.lift) activate(block);
    pointerDirty = true;
    schedule();
  }

  function onPointerLeave() {
    pointer = null;
    pointerDirty = true;
    schedule();
  }

  function onLayoutChange() {
    if (active) active.lines = null;
    pointerDirty = true;
    schedule();
  }

  // ---- On / off ----

  // quiet: started automatically, so a page without an article isn't worth a message.
  async function enable(quiet = false) {
    if (enabled) return true;
    const found = findBlocks();
    if (!found.length) {
      if (!quiet) toast('Digital Reader: no article text found on this page');
      return false;
    }
    ({ settings } = await Settings.load(host));
    blocks = found;
    for (const b of blocks) b.setAttribute('data-dr-block', '');
    addEventListener('mousemove', onPointerMove, { passive: true });
    addEventListener('scroll', onScroll, { capture: true, passive: true });
    addEventListener('resize', onLayoutChange, { passive: true });
    document.documentElement.addEventListener('mouseleave', onPointerLeave);
    chrome.storage.onChanged.addListener(onStorageChange);
    svg = createScrambleFilter();
    document.body.append(svg);
    enabled = true;
    applyTypography(true);
    toast(`Digital Reader on · ${blocks.length} paragraphs`);
    return true;
  }

  function disable() {
    if (!enabled) return false;
    removeEventListener('mousemove', onPointerMove);
    removeEventListener('scroll', onScroll, { capture: true });
    removeEventListener('resize', onLayoutChange);
    document.documentElement.removeEventListener('mouseleave', onPointerLeave);
    chrome.storage.onChanged.removeListener(onStorageChange);
    cancelAnimationFrame(frame);
    frame = 0;
    deactivate();
    scrollSpeed = 0;
    skim = 0;
    penalty = 0;
    holdS = 0;
    holdUntil = 0;
    lastSkimTick = 0;
    paintSkim();
    scrollState = new WeakMap();
    svg.remove();
    svg = null;
    applyTypography(false);
    for (const b of blocks) b.removeAttribute('data-dr-block');
    blocks = [];
    pointer = null;
    enabled = false;
    toast('Digital Reader off');
    return false;
  }

  let toastEl = null;
  let toastTimer = 0;
  function toast(message) {
    toastEl ||= document.createElement('dr-toast');
    toastEl.textContent = message;
    document.documentElement.append(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.remove(), 2200);
  }

  // Each request waits for the previous one, so quick double-clicks can't half-enable the reader.
  function setEnabled(want, { quiet = false } = {}) {
    switching = switching.then(() => (want ? enable(quiet) : disable()), () => enabled);
    return switching;
  }

  window.__digitalReader = {
    setEnabled,
    toggle: () => setEnabled(!enabled),
    get enabled() { return enabled; },
  };
})();
