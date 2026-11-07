/* ============================================================
   LexaOS 1.2.1 — Desktop Manager  (performance + bug-fix edition)

   PERFORMANCE:
   - DocumentFragment batch render (no per-icon reflow)
   - Selection rubber-band uses cached icon rects (read ONCE per mousedown)
   - Icon position map never read inside mousemove
   - Throttled mousemove via requestAnimationFrame
   - will-change:transform on ghost & icons

   BUGS FIXED:
   - _creating guard reset AFTER rAF so no concurrent creates
   - No drag-into-folder / drag-into-self at all
   - Snap collision-free (usedSet from saved + DOM)
   - Single-commit guard on rename (done flag)
   ============================================================ */
'use strict';

window.LexaDesktop = (function () {

  const GRID_W = 88, GRID_H = 98, PAD = 16;

  let _deskId    = null;
  let _ghost     = null;
  let _justDragged = false;   // suppress click after drag
  let _dragging = false;     // true while an icon is being dragged
  let _selBox    = null, _selSX = 0, _selSY = 0, _selActive = false;
  let _selIconRects = []; // cached once per selection-start, never in mousemove
  let _selection = [];
  let _lastClick = { id: null, t: 0 };
  let _creating  = false;
  let _raf       = null;  // for throttling selection mousemove

  /* .......................................................
     INIT
     ....................................................... */
  function init() {
    const df = LexaFS.getDesktopFolder();
    if (df) _deskId = df.id;
    renderDesktop();
    _bindSelection();
  }

  /* .......................................................
     DISPLAY NAME  (hide .app/.exe/.cmf extension)
     ....................................................... */
  function _displayName(item) {
    if (item.isFolder) return item.name;
    const ext = LexaFS.getExtension(item.name);
    if (['app','exe','cmf'].includes(ext)) {
      const dot = item.name.lastIndexOf('.');
      return dot > 0 ? item.name.slice(0, dot) : item.name;
    }
    return item.name;
  }

  /* .......................................................
     POSITION PERSISTENCE
     ....................................................... */
  // In-memory cache so we never JSON-parse inside hot loops
  let _posCache = null;

  function _loadPos() {
    if (_posCache) return _posCache;
    try { _posCache = JSON.parse(localStorage.getItem('lexaos_icon_pos') || '{}'); }
    catch { _posCache = {}; }
    return _posCache;
  }

  function _savePos(id, x, y) {
    const s = _loadPos();
    s[id] = { x, y };
    // Flush async so we never block the main thread
    queueMicrotask(() => {
      try { localStorage.setItem('lexaos_icon_pos', JSON.stringify(s)); } catch {}
    });
  }

  function _deletePos(id) {
    const s = _loadPos();
    if (!s[id]) return;
    delete s[id];
    queueMicrotask(() => {
      try { localStorage.setItem('lexaos_icon_pos', JSON.stringify(s)); } catch {}
    });
  }

  /* .......................................................
     FREE POSITION FINDER  (column-major, fast)
     ....................................................... */
  function _findFreePos(usedSet) {
    const area  = document.getElementById('desktop-area');
    const areaH = Math.max(400, area?.clientHeight ?? window.innerHeight - 52) - PAD;
    const maxR  = Math.max(1, Math.floor(areaH / GRID_H));

    for (let c = 0; c < 60; c++) {
      for (let r = 0; r < maxR; r++) {
        const x = PAD + c * GRID_W, y = PAD + r * GRID_H;
        if (!usedSet.has(`${x},${y}`)) return { x, y };
      }
    }
    // fallback: extend downward
    for (let r = 0; r < 500; r++) {
      const x = PAD, y = PAD + r * GRID_H;
      if (!usedSet.has(`${x},${y}`)) return { x, y };
    }
    return { x: PAD, y: PAD };
  }

  function _buildUsedSet(excludeId) {
    const saved = _loadPos();
    const used  = new Set();
    Object.entries(saved).forEach(([id, p]) => {
      if (id !== excludeId) used.add(`${p.x},${p.y}`);
    });
    // Also read live DOM in case some positions aren't yet persisted
    document.querySelectorAll('#desktop-area .desktop-icon').forEach(el => {
      if (el.dataset.id === excludeId) return;
      const x = parseInt(el.style.left), y = parseInt(el.style.top);
      if (!isNaN(x) && !isNaN(y)) used.add(`${x},${y}`);
    });
    return used;
  }

  /* .......................................................
     RENDER  (DocumentFragment batch — single reflow)
     ....................................................... */
  function renderDesktop() {
    const area = document.getElementById('desktop-area');
    if (!area || !_deskId) return;

    // Invalidate pos cache so we re-read from localStorage
    _posCache = null;

    area.innerHTML = '';
    _selection = [];

    const items   = LexaFS.getChildren(_deskId);
    const saved   = _loadPos();
    const usedPos = new Set();

    // Pass 1 — seed usedPos from all saved positions
    items.forEach(item => {
      if (saved[item.id]) usedPos.add(`${saved[item.id].x},${saved[item.id].y}`);
    });

    // Pass 2 — build all icons into a DocumentFragment (one DOM insertion)
    const frag = document.createDocumentFragment();
    items.forEach(item => {
      let pos = saved[item.id];
      if (!pos) {
        pos = _findFreePos(usedPos);
        usedPos.add(`${pos.x},${pos.y}`);
        _savePos(item.id, pos.x, pos.y);
      }
      frag.appendChild(_createIconEl(item, pos.x, pos.y));
    });
    area.appendChild(frag); // ONE reflow

    // Event delegation: 3 listeners on the container instead of 4 per icon
    _bindIconDelegation(area);

    _updateTrashIcon();
  }

  /* .......................................................
     EVENT DELEGATION  (replaces per-icon listeners — O(1) bind)
     ....................................................... */
  let _delegated = new WeakSet();   // containers already delegated (renderDesktop re-entry safe)

  function _bindIconDelegation(area) {
    if (_delegated.has(area)) return;
    _delegated.add(area);

    area.addEventListener('click', e => {
      const el = e.target.closest('.desktop-icon');
      if (!el) return;
      e.stopPropagation();
      if (_justDragged) { _justDragged = false; return; }   // no click after drag
      const item = LexaFS.getNode(el.dataset.id);
      if (!item) return;
      const now = Date.now();
      const dbl = _lastClick.id === item.id && now - _lastClick.t < 380;
      _lastClick = { id: item.id, t: now };
      if (dbl) { _openItem(item); return; }
      _selectOne(el, e.ctrlKey || e.metaKey || e.shiftKey);
    });

    area.addEventListener('contextmenu', e => {
      const el = e.target.closest('.desktop-icon');
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      const item = LexaFS.getNode(el.dataset.id);
      if (!item) return;
      if (!_selection.includes(item.id)) _selectOne(el, false);
      LexaContextMenu.show(e.clientX, e.clientY, _iconMenu(item, el));
    });

    area.addEventListener('touchend', e => {
      const el = e.target.closest('.desktop-icon');
      if (!el) return;
      const item = LexaFS.getNode(el.dataset.id);
      if (!item) return;
      const now = Date.now();
      if (now - _lastTouch < 350) { e.preventDefault(); _openItem(item); }
      _lastTouch = now;
    }, { passive: false });

    // Drag: start drag directly from delegation (no per-icon binding)
    area.addEventListener('mousedown', e => {
      const el = e.target.closest('.desktop-icon');
      if (!el || e.button !== 0) return;
      e.preventDefault();   // CRITICAL: prevent native drag & text selection
      _startDrag(el, e);
    });

    // Prevent native text selection & drag during icon drag
    area.addEventListener('selectstart', e => {
      if (_dragging) e.preventDefault();
    });
  }
  let _lastTouch = 0;

  /* .......................................................
     CREATE ICON ELEMENT  (no event binding — done after append)
     ....................................................... */
  function _createIconEl(item, x, y) {
    const iconDef = _getAppIcon(item);
    const el = document.createElement('div');
    el.className  = 'desktop-icon';
    el.dataset.id = item.id;
    el.style.cssText = `left:${x}px;top:${y}px;will-change:transform;`;

    const img = document.createElement('div');
    img.className = 'icon-img';
    img.style.background = iconDef.bg;
    img.innerHTML = iconDef.svg;

    const lbl = document.createElement('div');
    lbl.className   = 'icon-label';
    lbl.textContent = _displayName(item);

    el.appendChild(img);
    el.appendChild(lbl);
    return el;
  }

  /* .......................................................
     APP ICON DEFINITIONS
     ....................................................... */
  const APP_ICONS = {
    explorer:   { bg:'linear-gradient(145deg,#1a5fb4,#3584e4)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="4" y="10" width="28" height="20" rx="3" fill="rgba(255,255,255,.25)" stroke="rgba(255,255,255,.5)" stroke-width="1.2"/><rect x="4" y="6" width="14" height="6" rx="2" fill="rgba(255,255,255,.4)"/><rect x="8" y="18" width="20" height="2" rx="1" fill="rgba(255,255,255,.7)"/><rect x="8" y="22" width="14" height="2" rx="1" fill="rgba(255,255,255,.5)"/></svg>` },
    terminal:   { bg:'linear-gradient(145deg,#1b1b1b,#2d2d2d)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="3" y="6" width="30" height="24" rx="4" fill="#0d0d0d" stroke="#3c3c3c" stroke-width="1"/><rect x="3" y="6" width="30" height="8" rx="4" fill="#2d2d2d"/><circle cx="9" cy="10" r="2" fill="#ff5f57"/><circle cx="15" cy="10" r="2" fill="#febc2e"/><circle cx="21" cy="10" r="2" fill="#28c840"/><polyline points="7,20 12,23 7,26" stroke="#00ff88" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="14" y1="26" x2="22" y2="26" stroke="#00ff88" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    browser:    { bg:'linear-gradient(145deg,#4285f4,#34a853)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><circle cx="18" cy="18" r="13" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.6)" stroke-width="1.5"/><line x1="5" y1="18" x2="31" y2="18" stroke="rgba(255,255,255,.6)" stroke-width="1.2"/><path d="M18 5 C13 11 13 25 18 31" stroke="rgba(255,255,255,.6)" stroke-width="1.2" fill="none"/><path d="M18 5 C23 11 23 25 18 31" stroke="rgba(255,255,255,.6)" stroke-width="1.2" fill="none"/></svg>` },
    settings:   { bg:'linear-gradient(145deg,#5e5c64,#77767b)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><circle cx="18" cy="18" r="5.5" fill="rgba(255,255,255,.9)"/><path d="M18 4 L20 9 L25 7 L23 12 L28 13 L24 16 L27 21 L22 20 L21 26 L18 22 L15 26 L14 20 L9 21 L12 16 L8 13 L13 12 L11 7 L16 9 Z" fill="rgba(255,255,255,.35)" stroke="rgba(255,255,255,.7)" stroke-width="1" stroke-linejoin="round"/></svg>` },
    calculator: { bg:'linear-gradient(145deg,#e67e22,#f39c12)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="5" y="4" width="26" height="28" rx="4" fill="rgba(255,255,255,.2)" stroke="rgba(255,255,255,.5)" stroke-width="1.2"/><rect x="8" y="7" width="20" height="8" rx="2" fill="rgba(255,255,255,.4)"/><circle cx="10" cy="22" r="2" fill="white" opacity=".8"/><circle cx="18" cy="22" r="2" fill="white" opacity=".8"/><circle cx="26" cy="22" r="2" fill="white" opacity=".8"/><circle cx="10" cy="28" r="2" fill="white" opacity=".8"/><circle cx="18" cy="28" r="2" fill="white" opacity=".8"/><circle cx="26" cy="28" r="2" fill="#ff453a" opacity=".9"/></svg>` },
    texteditor: { bg:'linear-gradient(145deg,#2b7de9,#5ac8fa)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="5" y="4" width="26" height="28" rx="3" fill="rgba(255,255,255,.9)"/><line x1="9" y1="12" x2="27" y2="12" stroke="#2b7de9" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="17" x2="27" y2="17" stroke="#2b7de9" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="22" x2="21" y2="22" stroke="#2b7de9" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="27" x2="18" y2="27" stroke="#2b7de9" stroke-width="1" stroke-linecap="round"/></svg>` },
    clock:      { bg:'linear-gradient(145deg,#1a1a2a,#2d2d4e)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><circle cx="18" cy="18" r="13" stroke="rgba(255,255,255,.6)" stroke-width="1.5" fill="rgba(255,255,255,.08)"/><line x1="18" y1="9" x2="18" y2="18" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="18" x2="24" y2="21" stroke="#0a84ff" stroke-width="1.5" stroke-linecap="round"/><circle cx="18" cy="18" r="1.5" fill="white"/></svg>` },
    taskmanager:{ bg:'linear-gradient(145deg,#0a3020,#30a060)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="4" y="4" width="28" height="28" rx="3" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.3)" stroke-width="1.2"/><rect x="7" y="20" width="4" height="10" rx="1" fill="#30d158"/><rect x="13" y="14" width="4" height="16" rx="1" fill="#0a84ff"/><rect x="19" y="17" width="4" height="13" rx="1" fill="#ffd60a"/><rect x="25" y="10" width="4" height="20" rx="1" fill="#ff453a"/></svg>` },
    calendar:   { bg:'linear-gradient(145deg,#c0392b,#e74c3c)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="3" y="6" width="30" height="26" rx="3" fill="white"/><rect x="3" y="6" width="30" height="10" rx="3" fill="#e74c3c"/><rect x="3" y="12" width="30" height="4" fill="#e74c3c"/><circle cx="10" cy="5" r="2.5" fill="#c0392b"/><circle cx="26" cy="5" r="2.5" fill="#c0392b"/><rect x="7" y="20" width="4" height="3" rx="1" fill="#e74c3c"/><rect x="13" y="20" width="4" height="3" rx="1" fill="#e74c3c"/><rect x="19" y="20" width="4" height="3" rx="1" fill="#e74c3c"/><rect x="25" y="20" width="4" height="3" rx="1" fill="#e74c3c"/><rect x="7" y="26" width="4" height="3" rx="1" fill="#aaa"/><rect x="13" y="26" width="4" height="3" rx="1" fill="#aaa"/><rect x="19" y="26" width="4" height="3" rx="1" fill="#aaa"/></svg>` },
    notes:      { bg:'linear-gradient(145deg,#f39c12,#f1c40f)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="4" y="3" width="28" height="30" rx="3" fill="#fef9e7"/><rect x="4" y="3" width="28" height="7" rx="3" fill="#f39c12"/><line x1="9" y1="17" x2="27" y2="17" stroke="#e67e22" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="21" x2="27" y2="21" stroke="#e67e22" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="25" x2="20" y2="25" stroke="#e67e22" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="13" x2="15" y2="13" stroke="rgba(243,156,18,.5)" stroke-width="1" stroke-linecap="round"/></svg>` },
    store:      { bg:'linear-gradient(145deg,#8e44ad,#9b59b6)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="3" y="14" width="30" height="19" rx="3" fill="rgba(255,255,255,.2)" stroke="rgba(255,255,255,.5)" stroke-width="1.2"/><path d="M8 14 L10 8 Q12 4 18 4 Q24 4 26 8 L28 14" stroke="rgba(255,255,255,.6)" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="13" cy="20" r="2.5" fill="rgba(255,255,255,.8)"/><circle cx="23" cy="20" r="2.5" fill="rgba(255,255,255,.8)"/><rect x="11" y="26" width="14" height="3" rx="1.5" fill="rgba(255,255,255,.5)"/></svg>` },
    folder:     { bg:'linear-gradient(145deg,#1c3a70,#3070df)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="4" y="12" width="28" height="18" rx="3" fill="rgba(255,255,255,.2)"/><rect x="4" y="9" width="14" height="5" rx="2" fill="rgba(255,255,255,.35)"/><rect x="4" y="12" width="28" height="18" rx="3" stroke="rgba(255,255,255,.5)" stroke-width="1.2" fill="rgba(255,255,255,.12)"/></svg>` },
    txt:        { bg:'linear-gradient(145deg,#2c2c3a,#4a4a6e)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="6" y="3" width="24" height="30" rx="3" fill="rgba(255,255,255,.9)"/><path d="M21 3 L30 12 L21 12 Z" fill="#c0c0d0"/><rect x="21" y="3" width="9" height="9" fill="#e8e8f0"/><line x1="10" y1="17" x2="26" y2="17" stroke="#6666aa" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="21" x2="26" y2="21" stroke="#6666aa" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="25" x2="20" y2="25" stroke="#6666aa" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    cmf:        { bg:'linear-gradient(145deg,#381010,#c03030)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="4" y="4" width="28" height="28" rx="4" fill="#0d0d0d"/><polyline points="7,16 13,20 7,24" stroke="#ff453a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="15" y1="24" x2="25" y2="24" stroke="#ff453a" stroke-width="2" stroke-linecap="round"/></svg>` },
    image:      { bg:'linear-gradient(145deg,#281438,#8030c0)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="4" y="6" width="28" height="24" rx="3" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.4)" stroke-width="1.2"/><circle cx="12" cy="14" r="3" fill="#ffd60a"/><path d="M4 24 L11 17 L17 23 L22 19 L32 28" stroke="rgba(255,255,255,.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
    studio:      { bg:'linear-gradient(145deg,#0d1117,#161b22)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="3" y="3" width="30" height="30" rx="4" fill="#0d1117" stroke="#58a6ff" stroke-width="1.2"/><rect x="3" y="3" width="30" height="8" rx="4" fill="#161b22"/><circle cx="9" cy="7" r="1.8" fill="#ff5f57"/><circle cx="15" cy="7" r="1.8" fill="#febc2e"/><circle cx="21" cy="7" r="1.8" fill="#28c840"/><polyline points="7,17 11,20 7,23" stroke="#58a6ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="14" y1="23" x2="29" y2="23" stroke="#58a6ff" stroke-width="1" stroke-linecap="round" stroke-dasharray="2 2"/><line x1="14" y1="17" x2="24" y2="17" stroke="#3fb950" stroke-width="1.5" stroke-linecap="round"/><line x1="14" y1="20" x2="21" y2="20" stroke="#e3b341" stroke-width="1.5" stroke-linecap="round"/></svg>` },
    music:       { bg:'linear-gradient(145deg,#0a1a0f,#1db954)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><circle cx="18" cy="18" r="14" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.2)" stroke-width="1"/><circle cx="18" cy="18" r="6" fill="#1db954"/><circle cx="18" cy="18" r="2" fill="white"/><path d="M18 4 L22 14 L28 10 L24 22 L30 20 L22 32 L16 22 L10 28 L14 16 L8 18 L14 6 Z" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1"/></svg>` },
    videoplayer: { bg:'linear-gradient(145deg,#1a0a0a,#c0392b)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="3" y="7" width="24" height="18" rx="3" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.3)" stroke-width="1.2"/><polygon points="14,13 22,18 14,23" fill="white"/><rect x="29" y="10" width="4" height="6" rx="1" fill="rgba(255,255,255,.6)"/><rect x="29" y="20" width="4" height="6" rx="1" fill="rgba(255,255,255,.6)"/></svg>` },
    _fallback:   { bg:'linear-gradient(145deg,#222,#444)', svg:`<svg viewBox="0 0 36 36" fill="none" width="32" height="32"><rect x="6" y="3" width="24" height="30" rx="3" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.3)" stroke-width="1.2"/></svg>` },
  };

  function _getAppIcon(item) {
    if (item.isFolder) return APP_ICONS.folder;
    const ext = LexaFS.getExtension(item.name);
    if (ext === 'app' || ext === 'exe') {
      try {
        const d = JSON.parse(item.content || '{}');
        if (d.appId && APP_ICONS[d.appId]) return APP_ICONS[d.appId];
      } catch {}
    }
    if (ext === 'txt')  return APP_ICONS.txt;
    if (ext === 'cmf')  return APP_ICONS.cmf;
    if (['png','jpg','jpeg','gif','webp','svg','bmp','ico'].includes(ext)) return APP_ICONS.image;
    // Always return a valid icon — never undefined
    return APP_ICONS._fallback || { bg:'linear-gradient(145deg,#222,#444)', svg:'<svg viewBox="0 0 36 36" width="32" height="32"></svg>' };
  }

  /* .......................................................
     ICON EVENTS  (legacy — replaced by delegation in renderDesktop;
     kept for API compat if anything binds single icons externally)
     ....................................................... */
  function _bindIcon(el, item) {
    // Click / double-click
    el.addEventListener('click', e => {
      e.stopPropagation();
      const now = Date.now();
      const dbl = _lastClick.id === item.id && now - _lastClick.t < 380;
      _lastClick = { id: item.id, t: now };
      if (dbl) { _openItem(item); return; }
      _selectOne(el, e.ctrlKey || e.metaKey || e.shiftKey);
    });

    // Touch double-tap
    let _lt = 0;
    el.addEventListener('touchend', e => {
      const now = Date.now();
      if (now - _lt < 350) { e.preventDefault(); _openItem(item); }
      _lt = now;
    }, { passive: false });

    // Right-click
    el.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      if (!_selection.includes(item.id)) _selectOne(el, false);
      LexaContextMenu.show(e.clientX, e.clientY, _iconMenu(item, el));
    });

    // Drag is handled by delegation in _bindIconDelegation
  }

  /* ......................................................
     DRAG  (robust: threshold-based, no click interference)
     ....................................................... */
  function _startDrag(el, e) {
    if (e.button !== 0) return;
    const item = LexaFS.getNode(el.dataset.id);
    if (!item) return;

    const sx = e.clientX, sy = e.clientY;
    let dragging = false;
    let _trashRect = null, _areaRect = null, _areaW = 0;
    let _rafId = null;
    let _pendingX = 0, _pendingY = 0;

    // Cache rects ONCE at drag start
    const area = document.getElementById('desktop-area');
    if (!area) return;
    _areaRect  = area.getBoundingClientRect();
    _areaW     = area.clientWidth;
    const tz   = document.getElementById('trash-zone');
    _trashRect = tz ? tz.getBoundingClientRect() : null;

    function _applyGhostPos() {
      _rafId = null;
      if (_ghost) {
        _ghost.style.transform = `translate(${_pendingX - _ghost._ox}px,${_pendingY - _ghost._oy}px)`;
      }
      if (_trashRect) {
        const ot = _pendingX >= _trashRect.left && _pendingX <= _trashRect.right &&
                   _pendingY >= _trashRect.top  && _pendingY <= _trashRect.bottom;
        document.getElementById('trash-zone')?.classList.toggle('drag-over', ot);
      }
    }

    function onMove(ev) {
      if (!dragging) {
        if (Math.abs(ev.clientX - sx) < 6 && Math.abs(ev.clientY - sy) < 6) return;
        dragging = true;
        _dragging = true;
        el.style.opacity = '0.3';
        el.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'move';
        _ghost = _mkGhost(item, ev.clientX, ev.clientY);
      }
      _pendingX = ev.clientX;
      _pendingY = ev.clientY;
      if (!_rafId) _rafId = requestAnimationFrame(_applyGhostPos);
    }

    function onUp(ev) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }

      if (!dragging) {
        // Simple click — handle selection/opening manually (preventDefault on mousedown blocks click)
        const now = Date.now();
        const dbl = _lastClick.id === item.id && now - _lastClick.t < 380;
        _lastClick = { id: item.id, t: now };
        if (dbl) { _openItem(item); return; }
        _selectOne(el, ev.ctrlKey || ev.metaKey || ev.shiftKey);
        return;
      }

      dragging = false;
      _dragging = false;
      _justDragged = true;
      el.style.opacity = '';
      el.style.pointerEvents = '';
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (_ghost) { _ghost.remove(); _ghost = null; }
      document.getElementById('trash-zone')?.classList.remove('drag-over');

      // TRASH check
      if (_trashRect &&
          ev.clientX >= _trashRect.left && ev.clientX <= _trashRect.right &&
          ev.clientY >= _trashRect.top  && ev.clientY <= _trashRect.bottom) {
        _deleteIcon(item.id);
        return;
      }

      // Grid reposition — snap to grid, avoid collisions
      const nx = ev.clientX - _areaRect.left - 26;
      const ny = ev.clientY - _areaRect.top  - 26;
      const sn = _snapToGrid(nx, ny, _areaW);

      const targetKey = `${sn.x},${sn.y}`;
      const saved = _loadPos();
      const occupied = new Set(
        Object.entries(saved)
          .filter(([id]) => id !== item.id)
          .map(([, p]) => `${p.x},${p.y}`)
      );

      let finalPos = sn;
      if (occupied.has(targetKey)) {
        finalPos = _findNearestFree(sn, occupied, _areaW) || sn;
      }

      el.style.left = finalPos.x + 'px';
      el.style.top  = finalPos.y + 'px';
      _savePos(item.id, finalPos.x, finalPos.y);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }
  // Find nearest free grid cell to a target position
  function _findNearestFree(target, occupied, areaW) {
    const maxCols = Math.max(1, Math.floor((areaW - PAD) / GRID_W));
    const tc = Math.round((target.x - PAD) / GRID_W);
    const tr = Math.round((target.y - PAD) / GRID_H);
    // Spiral outward: distance 1, 2, 3...
    for (let d = 1; d < 20; d++) {
      for (let dc = -d; dc <= d; dc++) {
        for (let dr = -d; dr <= d; dr++) {
          if (Math.abs(dc) !== d && Math.abs(dr) !== d) continue; // only perimeter
          const c = tc + dc, r = tr + dr;
          if (c < 0 || r < 0 || c >= maxCols) continue;
          const x = PAD + c * GRID_W, y = PAD + r * GRID_H;
          if (!occupied.has(`${x},${y}`)) return { x, y };
        }
      }
    }
    return null;
  }

  function _mkGhost(item, cx, cy) {
    const g = document.createElement('div');
    g.style.cssText = [
      'position:fixed','top:0','left:0',
      'pointer-events:none','z-index:10000',
      'will-change:transform','transform:translate(0,0)',
      'display:flex','flex-direction:column','align-items:center','gap:3px',
      'padding:6px 10px',
      'background:rgba(10,132,255,0.20)',
      'border:1px solid rgba(10,132,255,0.50)',
      'border-radius:8px','opacity:0.90',
    ].join(';');
    g.innerHTML =
      `<span style="font-size:26px;line-height:1">${LexaFS.getMimeIcon(item.name, item.isFolder)}</span>` +
      `<span style="font-size:10px;color:rgba(255,255,255,.85);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_displayName(item)}</span>`;
    g._ox = 26; g._oy = 26;
    g.style.transform = `translate(${cx - g._ox}px,${cy - g._oy}px)`;
    document.getElementById('desktop').appendChild(g);
    return g;
  }

  function _snapToGrid(x, y, areaW) {
    const maxCols = Math.max(1, Math.floor((areaW - PAD) / GRID_W));
    const col = Math.min(maxCols - 1, Math.max(0, Math.round((x - PAD) / GRID_W)));
    const row = Math.max(0, Math.round((y - PAD) / GRID_H));
    return { x: PAD + col * GRID_W, y: PAD + row * GRID_H };
  }

  /* .......................................................
     SELECTION  (rects cached once per mousedown, no hot-loop getBCR)
     ....................................................... */
  function _selectOne(el, multi) {
    if (!multi) {
      document.querySelectorAll('.desktop-icon.selected').forEach(e => e.classList.remove('selected'));
      _selection = [];
    }
    el.classList.add('selected');
    if (!_selection.includes(el.dataset.id)) _selection.push(el.dataset.id);
  }

  function _clearSel() {
    document.querySelectorAll('.desktop-icon.selected').forEach(e => e.classList.remove('selected'));
    _selection = [];
  }

  function _bindSelection() {
    const desk = document.getElementById('desktop');
    if (!desk) return;

    desk.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest(
        '.desktop-icon,.taskbar,.start-menu,.quick-settings,.notification-center,.context-menu,.window,.trash-zone'
      )) return;

      _clearSel();
      _selActive = true;
      _selSX = e.clientX;
      _selSY = e.clientY;

      // Cache all icon rects ONCE here — never in mousemove
      _selIconRects = [];
      document.querySelectorAll('#desktop-area .desktop-icon').forEach(ic => {
        _selIconRects.push({ el: ic, r: ic.getBoundingClientRect() });
      });

      _selBox = document.createElement('div');
      _selBox.className = 'selection-box';
      _selBox.style.cssText = `left:${_selSX}px;top:${_selSY}px;width:0;height:0;`;
      desk.appendChild(_selBox);
    });

    // RAF-throttled selection update
    let _selRaf = null;
    let _selMX = 0, _selMY = 0;

    document.addEventListener('mousemove', e => {
      if (!_selActive || !_selBox) return;
      _selMX = e.clientX; _selMY = e.clientY;
      if (_selRaf) return; // already queued
      _selRaf = requestAnimationFrame(() => {
        _selRaf = null;
        if (!_selBox) return;
        const x = Math.min(_selMX, _selSX), y = Math.min(_selMY, _selSY);
        const w = Math.abs(_selMX - _selSX), h = Math.abs(_selMY - _selSY);
        _selBox.style.left = x+'px'; _selBox.style.top = y+'px';
        _selBox.style.width = w+'px'; _selBox.style.height = h+'px';

        // Use cached rects — zero getBoundingClientRect calls here
        _selection = [];
        _selIconRects.forEach(({ el: ic, r }) => {
          const inside = r.left < x+w && r.right > x && r.top < y+h && r.bottom > y;
          ic.classList.toggle('selected', inside);
          if (inside) _selection.push(ic.dataset.id);
        });
      });
    }, { passive: true });

    document.addEventListener('mouseup', () => {
      if (_selBox) { _selBox.remove(); _selBox = null; }
      _selActive = false;
      _selIconRects = [];
      if (_selRaf) { cancelAnimationFrame(_selRaf); _selRaf = null; }
    });
  }

  /* .......................................................
     OPEN / LAUNCH
     ....................................................... */
  function _openItem(item) {
    if (item.isFolder) { LexaApps.openExplorer(item.id); return; }
    const ext = LexaFS.getExtension(item.name);
    const openers = {
      txt:  () => LexaApps.openTextEditor(item.id),
      exe:  () => _launchApp(item),
      app:  () => _launchApp(item),
      cmf:  () => LexaApps.openTerminalWithScript(item),
      png:  () => LexaApps.openImageViewer(item.id),
      jpg:  () => LexaApps.openImageViewer(item.id),
      jpeg: () => LexaApps.openImageViewer(item.id),
      gif:  () => LexaApps.openImageViewer(item.id),
      webp: () => LexaApps.openImageViewer(item.id),
      svg:  () => LexaApps.openImageViewer(item.id),
      bmp:  () => LexaApps.openImageViewer(item.id),
      ico:  () => LexaApps.openImageViewer(item.id),
      mp4:  () => LexaApps.openVideoPlayer?.(item.id),
      webm: () => LexaApps.openVideoPlayer?.(item.id),
      avi:  () => LexaApps.openVideoPlayer?.(item.id),
      mov:  () => LexaApps.openVideoPlayer?.(item.id),
      mp3:  () => LexaApps.openMusic?.(),
      ogg:  () => LexaApps.openMusic?.(),
      wav:  () => LexaApps.openMusic?.(),
    };
    (openers[ext] || (() => LexaApps.openTextEditor(item.id)))();
  }

  function _launchApp(item) {
    try {
      const d = JSON.parse(item.content || '{}');
      const map = {
        explorer:    () => LexaApps.openExplorer(),
        terminal:    () => LexaApps.openTerminal(),
        texteditor:  () => LexaApps.openTextEditor(),
        settings:    () => LexaApps.openSettings(),
        browser:     () => LexaApps.openBrowser(),
        calculator:  () => LexaApps.openCalculator(),
        clock:       () => LexaApps.openClock(),
        taskmanager: () => LexaApps.openTaskManager(),
        calendar:    () => LexaApps.openCalendar(),
        notes:       () => LexaApps.openNotes(),
        store:       () => LexaApps.openStore(),
        studio:      () => LexaOS.toast('Lexa Studio','Zurzeit nicht verfügbar','ℹ️'),
        music:       () => LexaApps.openMusic?.(),
        videoplayer: () => LexaApps.openVideoPlayer?.(),
        systemcontrol: () => LexaApps.openSystemControl?.(),
        officelink:   () => LexaApps.openOfficeLink?.(),
      };
      if (d.appId && map[d.appId]) map[d.appId]();
      else LexaOS.toast(d.displayName || item.name, 'Wird gestartet…', '🚀');
    } catch { LexaOS.toast(item.name, 'Ausführen…', '⚙'); }
  }

  /* .......................................................
     CONTEXT MENU
     ....................................................... */
  function _iconMenu(item, el) {
    const m    = window._i18nMenuStrings || {};
    const menu = [];
    const ext  = LexaFS.getExtension(item.name);
    const imgExts  = ['png','jpg','jpeg','gif','webp','svg','bmp','ico'];
    const codeExts = ['cmf','txt','js','json','html','css','py','xml','md','csv'];

    menu.push({ icon: item.isFolder ? '📁' : '📝', label: m.open || '-ffnen', action: () => _openItem(item) });

    // Image ?' set as wallpaper
    if (imgExts.includes(ext))
      menu.push({ icon:'🗑', label:'Als Hintergrund setzen', action: () => _setAsWallpaper(item) });

    // Code / text files ?' open in Notepad
    if (codeExts.includes(ext) && ext !== 'txt')
      menu.push({ icon:'📁', label:'Im Notepad bearbeiten', action: () => LexaApps.openTextEditor(item.id) });

    // All non-image files ?' open in Lexa Studio if installed
    if (!imgExts.includes(ext) && !item.isFolder && ext !== 'app' && ext !== 'exe') {
      const storeInstalled = (() => { try { return JSON.parse(localStorage.getItem('lexaos_store_installed')||'[]'); } catch { return []; } })();
      if (storeInstalled.includes('studio'))
        menu.push({ icon:'💻', label:'In Lexa Studio öffnen', action: () => LexaOS.toast('Lexa Studio','Zurzeit nicht verfügbar','ℹ️') });
    }

    menu.push({ separator: true });
    menu.push({ icon:'✏', label: m.rename || 'Umbenennen', shortcut:'F2', action: () => _renameInline(item, el) });
    menu.push({ separator: true });
        menu.push({ icon:'🗑', label: m.delete || 'Löschen', cls:'danger', shortcut:'Entf', action: () => _deleteIcon(item.id) });
    return menu;
  }

  /* .......................................................
     INLINE RENAME  (single done-flag prevents double-render)
     ....................................................... */
  function _renameInline(item, iconEl, isNew = false) {
    const lblEl = iconEl.querySelector('.icon-label');
    if (!lblEl) return;

    const inp = document.createElement('input');
    inp.className = 'icon-label-input';
    inp.value = item.name;
    lblEl.replaceWith(inp);
    inp.focus();

    if (isNew) {
      inp.select();
    } else {
      const dot = item.name.lastIndexOf('.');
      if (dot > 0 && !item.isFolder) inp.setSelectionRange(0, dot);
      else inp.select();
    }

    let done = false;
    const commit = (save) => {
      if (done) return;
      done = true;
      const newName = inp.value.trim();
      if (save && newName && newName !== item.name) {
        LexaFS.renameNode(item.id, newName);
        if (!isNew) LexaOS.toast('Umbenannt', `"${item.name}" ?' "${newName}"`, '✏');
      } else if (!save && isNew) {
        LexaFS.deleteNode(item.id, true);
        _deletePos(item.id);
      }
      // Invalidate cache so next renderDesktop reads fresh data
      _posCache = null;
      renderDesktop();
    };

    inp.addEventListener('blur',    ()  => commit(true));
    inp.addEventListener('keydown', e  => {
      if (e.key === 'Enter')  { e.preventDefault(); if (!done) commit(true); }
      if (e.key === 'Escape') { e.preventDefault(); if (!done) commit(false); }
    });
    inp.addEventListener('click',    e => e.stopPropagation());
    inp.addEventListener('dblclick', e => e.stopPropagation());
  }

  /* .......................................................
     SET AS WALLPAPER
     ....................................................... */
  function _setAsWallpaper(item) {
    if (!item.content) { LexaOS.toast('Hintergrund', 'Keine Bilddaten', 'O'); return; }
    const wp = document.getElementById('desktop-wallpaper');
    if (wp) {
      wp.style.backgroundImage    = `url("${item.content}")`;
      wp.style.backgroundSize     = 'cover';
      wp.style.backgroundPosition = 'center';
    }
    try { localStorage.setItem('lexaos_wallpaper_custom', item.content); } catch {}
    LexaOS.state.customWallpaper = item.content;
    LexaOS.toast('Hintergrund', `"${item.name}" gesetzt`, '🗑');
  }

  /* .......................................................
     DELETE
     ....................................................... */
  function _deleteIcon(id) {
    const node = LexaFS.getNode(id);
    if (!node) return;
    LexaFS.deleteNode(id, false);
    _deletePos(id);
    LexaOS.toast('Papierkorb', `"${node.name}" gelöscht`, '🗑');
    _posCache = null;
    renderDesktop();
  }

  /* .......................................................
     DESKTOP CONTEXT MENU
     ....................................................... */
  function showDesktopContextMenu(x, y) {
    const m = window._i18nMenuStrings || {};
    LexaContextMenu.show(x, y, [
      { icon:'📁', label: m.newFolder  || 'Neuer Ordner',    action: () => _newItemDirect(true,  '', x, y) },
      { icon:'🔄', label: m.newFile    || 'Neue Textdatei',  action: () => _newItemDirect(false, 'txt', x, y) },
      { icon:'✏', label: 'Neue CMF-Datei',                  action: () => _newItemDirect(false, 'cmf', x, y) },
      { separator: true },
      { icon:'🗑', label: m.wallpaper  || 'Hintergrund ändern', action: () => LexaApps.openSettings('wallpaper') },
      { icon:'⚙', label: m.settings   || 'Einstellungen',       action: () => LexaApps.openSettings() },
      { separator: true },
      { icon:'🔄', label: m.refresh    || 'Aktualisieren',        action: () => { _posCache = null; renderDesktop(); } },
    ]);
  }

  /* .......................................................
     NEW ITEM DIRECT — created at click position, not random free slot
     ....................................................... */
  function _newItemDirect(isFolder, ext = '', clickX, clickY) {
    if (_creating) return;
    _creating = true;

    const area = document.getElementById('desktop-area');
    if (!area || !_deskId) { _creating = false; return; }

    // 1. Unique name
    const base = isFolder ? 'Neuer Ordner' : `Neue Datei${ext ? '.'+ext : ''}`;
    const existingNames = new Set(LexaFS.getChildren(_deskId).map(c => c.name));
    let finalName = base, n = 2;
    while (existingNames.has(finalName)) {
      finalName = isFolder ? `Neuer Ordner (${n})` : `Neue Datei (${n})${ext ? '.'+ext : ''}`;
      n++;
    }

    // 2. Create ONCE in FS
    const node = LexaFS.createFile({ name: finalName, isFolder, content: '', parentId: _deskId });
    if (!node) { _creating = false; return; }

    // 3. Position: snap the click coordinates to grid, or find free slot
    let pos;
    if (clickX !== undefined && clickY !== undefined) {
      // Convert screen coords to area-local coords
      const areaRect = area.getBoundingClientRect();
      const lx = clickX - areaRect.left;
      const ly = clickY - areaRect.top;
      // Snap to grid
      const snapped = _snapToGrid(lx, ly, area.clientWidth);
      // Check if that slot is already occupied
      const usedPos = _buildUsedSet(node.id);
      const key = `${snapped.x},${snapped.y}`;
      if (!usedPos.has(key)) {
        pos = snapped;
      } else {
        // Find nearest free slot to click position
        pos = _findNearestFree(snapped, usedPos, area.clientWidth) || _findFreePos(usedPos);
      }
    } else {
      // Fallback: first free slot
      const usedPos = _buildUsedSet(node.id);
      pos = _findFreePos(usedPos);
    }

    _savePos(node.id, pos.x, pos.y);
    _posCache = null;

    // 4. Render once
    renderDesktop();

    // 5. Inline rename
    requestAnimationFrame(() => {
      _creating = false;
      const iconEl = area.querySelector(`.desktop-icon[data-id="${node.id}"]`);
      if (iconEl) {
        _selectOne(iconEl, false);
        _renameInline(node, iconEl, true);
      }
    });
  }

  /* .......................................................
     TRASH ICON
     ....................................................... */
  function _updateTrashIcon() {
    const tz = document.getElementById('trash-zone');
    if (!tz) return;
    const n = LexaFS.getTrashCount();
    tz.title = n > 0 ? `Papierkorb (${n})` : 'Papierkorb (leer)';
  }

  function bindTrash() {
    const tz = document.getElementById('trash-zone');
    if (!tz) return;
    tz.addEventListener('click', () => LexaApps.openExplorer(LexaFS.findTrash()?.id));
    tz.addEventListener('contextmenu', e => {
      e.preventDefault();
      LexaContextMenu.show(e.clientX, e.clientY, [
        { icon:'📁', label:'Papierkorb öffnen', action: () => LexaApps.openExplorer(LexaFS.findTrash()?.id) },
        { icon:'🗑', label:'Papierkorb leeren',  cls:'danger', action: async () => {
          const ok = await LexaOS.dialog({
            icon:'🗑', title:'Papierkorb leeren', message:'Alle Objekte dauerhaft löschen?',
            buttons:[{label:'Leeren',cls:'danger',value:true},{label:'Abbrechen',cls:'secondary',value:false}],
          });
          if (ok === true) {
            LexaFS.emptyTrash();
            _updateTrashIcon();
            LexaOS.toast('Papierkorb','Papierkorb geleert','🗑');
          }
        }},
      ]);
    });
  }

  /* .......................................................
     KEYBOARD  F2=rename, Del=delete
     ....................................................... */
  function initKeyEvents() {
    document.addEventListener('keydown', e => {
      if (document.activeElement?.tagName === 'INPUT'    ) return;
      if (document.activeElement?.tagName === 'TEXTAREA' ) return;
      if (e.key === 'F2' && _selection.length === 1) {
        const id   = _selection[0];
        const el   = document.querySelector(`.desktop-icon[data-id="${id}"]`);
        const node = LexaFS.getNode(id);
        if (el && node) _renameInline(node, el);
      }
      if (e.key === 'Delete' && _selection.length > 0) {
        [..._selection].forEach(id => _deleteIcon(id));
      }
    });
  }

  /* .......................................................
     PUBLIC API
     ....................................................... */
  return { init, renderDesktop, refresh: renderDesktop, showDesktopContextMenu, bindTrash, initKeyEvents, APP_ICONS };

})();

