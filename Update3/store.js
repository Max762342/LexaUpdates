/* ============================================================
   LexaOS – Lexa Store  (vanilla JS, no Alpine bugs)
   - Echte Download-Dauer basierend auf Netzwerkgeschwindigkeit
   - Vorinstalliert: Öffnen", Nicht installiert: Download-Bar
   - Nach Download: Icon auf Desktop, Button wird Öffnen"
   ============================================================ */
'use strict';

(function () {

  const INSTALLED_KEY = 'lexaos_store_installed';

  function getInstalled() {
    try { return new Set(JSON.parse(localStorage.getItem(INSTALLED_KEY) || '[]')); }
    catch { return new Set(); }
  }
  function saveInstalled(set) {
    try { localStorage.setItem(INSTALLED_KEY, JSON.stringify([...set])); } catch {}
  }

  /* ──? Measure approximate download speed ──————————————————?── */
  // Size in bytes / speed in Mbps ──' seconds
  // If Network Information API available, use effectiveType
  function _estimateDuration(sizeBytes) {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let mbps = 10; // default: 10 Mbit/s
    if (conn) {
      if (conn.downlink && conn.downlink > 0) {
        mbps = conn.downlink; // actual measured Mbit/s
      } else {
        const map = { 'slow-2g':0.05, '2g':0.15, '3g':1.5, '4g':20 };
        mbps = map[conn.effectiveType] || 10;
      }
    }
    if (!navigator.onLine) mbps = 1; // offline fallback
    // bytes ──' bits, / Mbit ──' seconds, add 20% overhead + small random jitter
    const sec = (sizeBytes * 8) / (mbps * 1_000_000);
    const jitter = 0.8 + Math.random() * 0.4; // ±20%
    return Math.max(3, Math.min(120, sec * jitter * 1000)); // clamp 3s—120s, return ms
  }

  /* ──? App definitions ──————————————————————————————————————?── */
  const APPS = [
    // id, name, cat, pre=preinstalled, e=emoji, bg, desc, bytes, version, rating
    { id:'explorer',    name:'Explorer',       cat:'System',        pre:true,  e:'📁', bg:'#1a5fb4,#3584e4', desc:'Dateimanager mit Drag & Drop, Ordner-Navigation und Inline-Umbenennen.', bytes:2_200_000, v:'1.2.1', r:4.8 },
    { id:'terminal',    name:'Terminal',        cat:'System',        pre:true,  e:'⌨️', bg:'#1b1b1b,#2d2d2d', desc:'Vollwertiges Terminal mit 20+ Befehlen, Tab-Vervollständigung und CMF-Skripten.', bytes:1_900_000, v:'1.2.1', r:4.7 },
    { id:'browser',     name:'Browser',         cat:'Internet',      pre:true,  e:'🌐', bg:'#4285f4,#34a853', desc:'Google-basierter Browser mit Lesezeichen, Proxy-Fallback und eigener Startseite.', bytes:3_400_000, v:'1.2.1', r:4.6 },
    { id:'texteditor',  name:'Notepad',     cat:'Produktivität', pre:true,  e:'📝', bg:'#2b7de9,#5ac8fa', desc:'Schneller Texteditor mit Suche, Speichern, Zeilenumbruch und Theme-Wechsel.', bytes:1_300_000, v:'1.2.1', r:4.5 },
    { id:'settings',    name:'Einstellungen',   cat:'System',        pre:true,  e:'⚙️', bg:'#5e5c64,#77767b', desc:'Systemeinstellungen: Hintergrund, Netzwerk, Sprache, Bluetooth, Anzeige.', bytes:1_600_000, v:'1.2.1', r:4.6 },
    { id:'calculator',  name:'Rechner',     cat:'Tools',         pre:true,  e:'🧮', bg:'#e67e22,#f39c12', desc:'Wissenschaftlicher Rechner mit Tastaturunterstützung und Verlauf.', bytes:850_000,   v:'1.2.1', r:4.4 },
    { id:'clock',       name:'Uhr',             cat:'Tools',         pre:true,  e:'🕐', bg:'#1a1a2a,#2d2d4e', desc:'Uhr mit Stoppuhr, Timer (Klingelton), Weltuhr für 8 Städte mit Echtzeit-Sekunden.', bytes:1_150_000, v:'1.2.1', r:4.7 },
    { id:'taskmanager', name:'Task-Manager',    cat:'System',        pre:true,  e:'📊', bg:'#0a3020,#30a060', desc:'Echtzeit CPU/RAM-Graphen, Prozessliste, App-Kacheln, Tasks beenden.', bytes:1_400_000, v:'1.2.1', r:4.5 },
    { id:'store',       name:'Lexa Store',      cat:'System',        pre:true,  e:'🛍️', bg:'#8e44ad,#9b59b6', desc:'App-Store für LexaOS mit realem Download-Speed und automatischer Desktop-Installation.', bytes:1_500_000, v:'1.2.1', r:4.9 },
    { id:'calendar',    name:'Kalender',        cat:'Produktivität', pre:false, e:'📅', bg:'#c0392b,#e74c3c', desc:'Vollständiger Kalender mit farbigen Terminen, Datum-Auswahl und persistenter Speicherung.', bytes:1_700_000, v:'1.0.0', r:4.8 },
    { id:'notes',       name:'Notizen',         cat:'Produktivität', pre:false, e:'📝', bg:'#f39c12,#f1c40f', desc:'Rich-Text Notizen-App mit Formatierung (Fett, Kursiv, Listen), Suche und unbegrenzten Notizen.', bytes:1_450_000, v:'1.0.0', r:4.7 },
    { id:'imageviewer', name:'Bildanzeige',     cat:'Medien',        pre:false, e:'🖼️', bg:'#281438,#8030c0', desc:'Betrachter für PNG, JPG, JPEG, SVG, WebP und GIF Bilder aus dem LexaOS-Dateisystem.', bytes:950_000,   v:'1.1.0', r:4.3 },
    { id:'studio',      name:'Lexa Studio',     cat:'Entwicklung',   pre:true,  e:'💻', bg:'#0d1117,#161b22', desc:'VS Code-ähnlicher Code-Editor zum Erstellen eigener LexaOS-Apps. Syntax-Highlighting, Dateibaum, integriertes Terminal.', bytes:8_500_000, v:'1.0.0', r:4.9, unavailable:true },
    { id:'music',       name:'Lexa Music',      cat:'Medien',        pre:true,  e:'🎵', bg:'#0a1a0f,#1db954', desc:'Musik-Player mit YouTube-Music, Radio, Playlists und Suche über mehrere Plattformen.', bytes:3_200_000, v:'1.0.0', r:4.8 },
    { id:'videoplayer', name:'Video Player',    cat:'Medien',        pre:true,  e:'🎬', bg:'#1a0a0a,#c0392b', desc:'Video-Player für lokale Dateien und YouTube-Videos mit Vollbild, Geschwindigkeit und Bild-in-Bild.', bytes:2_100_000, v:'1.0.0', r:4.6 },
  ];

  const CATS = ['Alle','System','Produktivität','Internet','Tools','Medien','Entwicklung'];

  /* ──? State ──——————————————————————————————————————————————?── */
  let _installed = getInstalled();
  // { appId → { pct:number, timer:id } }
  const _dl = {};

  function openStore() {
    /* ──? Root shell ──————————————————————————————————————————?── */
    const root = document.createElement('div');
    root.style.cssText = 'height:100%;display:flex;flex-direction:column;background:#0d0d14;color:white;font-family:var(--font);overflow:hidden;contain:strict;';

    /* ──? State for this window ──——————————————————————————————?── */
    let _cat = 'Alle';
    let _q   = '';

    /* ──? Build layout ──——————————————————————————————————————?── */
    root.innerHTML = `
      <div id="st-header" style="padding:14px 18px 10px;background:linear-gradient(135deg,#160a28,#2a1848);border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
          <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#bf5af2,#0a84ff);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;box-shadow:0 4px 14px rgba(191,90,242,.4);">Y>️</div>
          <div>
            <div style="font-size:19px;font-weight:700;background:linear-gradient(135deg,#bf5af2,#0a84ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Lexa Store</div>
            <div style="font-size:11px;color:rgba(255,255,255,.38);" id="st-meta"></div>
          </div>
          <input id="st-search" type="text" placeholder="📁  Apps suchen…"
            style="margin-left:auto;padding:7px 14px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:20px;color:white;font-size:12px;font-family:var(--font);outline:none;width:190px;transition:border-color .15s;"
            onfocus="this.style.borderColor='#bf5af2'" onblur="this.style.borderColor='rgba(255,255,255,.15)'" />
        </div>
        <div id="st-cats" style="display:flex;gap:5px;overflow-x:auto;padding-bottom:1px;"></div>
      </div>
      <div id="st-grid" style="flex:1;overflow-y:auto;padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;align-content:start;"></div>
      <div id="st-footer" style="padding:6px 18px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:rgba(255,255,255,.22);flex-shrink:0;"></div>
    `;

    const searchEl = root.querySelector('#st-search');
    const catsEl   = root.querySelector('#st-cats');
    const gridEl   = root.querySelector('#st-grid');
    const metaEl   = root.querySelector('#st-meta');
    const footerEl = root.querySelector('#st-footer');

    /* ──? Seed pre-installed apps into installed set ──—————————?── */
    APPS.forEach(a => { if (a.pre) _installed.add(a.id); });
    saveInstalled(_installed);

    /* ──? Category tabs ──——————————————————————————————————————?── */
    CATS.forEach(cat => {
      const btn = document.createElement('button');
      btn.textContent = cat;
      btn.dataset.cat = cat;
      btn.style.cssText = 'padding:5px 13px;border-radius:20px;border:1px solid rgba(255,255,255,.12);cursor:pointer;font-size:12px;white-space:nowrap;font-family:var(--font);transition:all .15s;flex-shrink:0;';
      _styleCat(btn, cat === _cat);
      btn.addEventListener('click', () => {
        _cat = cat;
        catsEl.querySelectorAll('button').forEach(b => _styleCat(b, b.dataset.cat === _cat));
        render();
      });
      catsEl.appendChild(btn);
    });

    function _styleCat(btn, active) {
      btn.style.background = active ? '#bf5af2' : 'rgba(255,255,255,.07)';
      btn.style.borderColor = active ? '#bf5af2' : 'rgba(255,255,255,.12)';
      btn.style.color = active ? 'white' : 'rgba(255,255,255,.65)';
    }

    searchEl.addEventListener('input', () => { _q = searchEl.value; render(); });

    /* ──? Render grid ──————————————————————————————————————————?── */
    function render() {
      const q = _q.toLowerCase();
      const visible = APPS.filter(a =>
        (_cat === 'Alle' || a.cat === _cat) &&
        (!q || a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q) || a.cat.toLowerCase().includes(q))
      );

      // Update meta
      const installed = APPS.filter(a => _installed.has(a.id)).length;
      metaEl.textContent = `${APPS.length} Apps · ${installed} installiert`;
      footerEl.textContent = `${visible.length} Apps angezeigt`;

      // Diff render ── only update changed cards
      const existing = new Map();
      gridEl.querySelectorAll('[data-appid]').forEach(el => existing.set(el.dataset.appid, el));

      // Remove cards not in visible
      existing.forEach((el, id) => {
        if (!visible.find(a => a.id === id)) el.remove();
      });

      visible.forEach((app, i) => {
        let card = existing.get(app.id);
        if (!card) {
          card = _mkCard(app);
          gridEl.appendChild(card);
        } else {
          // Update just the action area (button/bar)
          _updateCardAction(card, app);
        }
      });

      // Ensure order matches visible array
      visible.forEach(app => {
        const el = gridEl.querySelector(`[data-appid="${app.id}"]`);
        if (el) gridEl.appendChild(el); // move to end in order
      });

      if (visible.length === 0) {
        if (!gridEl.querySelector('.st-empty')) {
          const e = document.createElement('div');
          e.className = 'st-empty';
          e.style.cssText = 'grid-column:1/-1;padding:60px;text-align:center;color:rgba(255,255,255,.2);font-size:14px;';
          e.textContent = 'Keine Apps gefunden';
          gridEl.appendChild(e);
        }
      } else {
        gridEl.querySelector('.st-empty')?.remove();
      }
    }

    /* ──? Create one app card ──————————————————————————————————?── */
    function _mkCard(app) {
      const card = document.createElement('div');
      card.dataset.appid = app.id;
      card.style.cssText = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:9px;transition:background .15s,transform .15s,box-shadow .15s;cursor:default;';
      card.onmouseenter = () => { card.style.background='rgba(255,255,255,.08)'; card.style.transform='translateY(-2px)'; card.style.boxShadow='0 8px 24px rgba(0,0,0,.4)'; };
      card.onmouseleave = () => { card.style.background='rgba(255,255,255,.04)'; card.style.transform=''; card.style.boxShadow=''; };

      // Header row: icon + name/cat/rating
      const hdr = document.createElement('div');
      hdr.style.cssText = 'display:flex;align-items:flex-start;gap:12px;';
      hdr.innerHTML = `
        <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(145deg,${app.bg});display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,.45);">${app.e}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.95);">${app.name}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.38);margin-top:2px;">${app.cat}</div>
          <div style="font-size:11px;color:#ffd60a;margin-top:3px;">${'★'.repeat(Math.floor(app.r))}${'☆'.repeat(5-Math.floor(app.r))} <span style="color:rgba(255,255,255,.4);">${app.r}</span></div>
        </div>
      `;

      // Description
      const desc = document.createElement('div');
      desc.style.cssText = 'font-size:12px;color:rgba(255,255,255,.48);line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;';
      desc.textContent = app.desc;

      // Meta row
      const meta = document.createElement('div');
      meta.style.cssText = 'display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,.28);';
      const dlTime = Math.round(_estimateDuration(app.bytes) / 1000);
      meta.innerHTML = `<span>v${app.v}</span><span>${(app.bytes/1_000_000).toFixed(1)} MB · ~${dlTime}s</span>`;

      // Action area (progress bar + button)
      const action = document.createElement('div');
      action.className = 'st-action';
      action.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:2px;';

      card.appendChild(hdr);
      card.appendChild(desc);
      card.appendChild(meta);
      card.appendChild(action);
      _updateCardAction(card, app);
      return card;
    }

    /* ──? Update action area of a card ──———————————————————————?── */
    function _updateCardAction(card, app) {
      const action = card.querySelector('.st-action');
      if (!action) return;
      action.innerHTML = '';

      const dlState = _dl[app.id];
      const installed = _installed.has(app.id);

      if (app.unavailable) {
        const badge = document.createElement('div');
        badge.style.cssText = 'padding:8px 0;width:100%;border-radius:8px;text-align:center;font-size:12px;font-weight:600;color:rgba(255,255,255,.4);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);';
        badge.textContent = 'Nicht Verfügbar';
        action.appendChild(badge);
        return;
      }

      if (dlState !== undefined) {
        // Downloading: show progress bar + cancel
        const barWrap = document.createElement('div');
        barWrap.style.cssText = 'width:100%;height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;';
        const bar = document.createElement('div');
        bar.style.cssText = 'height:100%;border-radius:3px;background:linear-gradient(90deg,#bf5af2,#0a84ff);transition:width .25s ease;';
        bar.style.width = (dlState.pct || 0) + '%';
        barWrap.appendChild(bar);
        action.setAttribute('data-bar', ''); // marker

        const info = document.createElement('div');
        info.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
        const pctSpan = document.createElement('span');
        pctSpan.style.cssText = 'font-size:11px;color:rgba(255,255,255,.45);';
        pctSpan.textContent = Math.round(dlState.pct || 0) + '% ── Wird geladen…';

        const cancel = document.createElement('button');
        cancel.textContent = 'o.';
        cancel.style.cssText = 'background:none;border:none;color:rgba(255,255,255,.3);cursor:pointer;font-size:13px;padding:0;transition:color .12s;';
        cancel.onmouseenter = () => cancel.style.color='#ff453a';
        cancel.onmouseleave = () => cancel.style.color='rgba(255,255,255,.3)';
        cancel.onclick = () => {
          clearInterval(_dl[app.id]?.timer);
          delete _dl[app.id];
          render();
        };

        info.appendChild(pctSpan);
        info.appendChild(cancel);
        action.appendChild(barWrap);
        action.appendChild(info);

        // Store refs for live update
        action._bar  = bar;
        action._span = pctSpan;

      } else if (installed) {
        // Installed: show green badge + Open button
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;';
        const badge = document.createElement('div');
        badge.style.cssText = 'padding:8px 0;flex:1;border-radius:8px;text-align:center;font-size:12px;font-weight:600;color:#30d158;background:rgba(48,209,88,.1);border:1px solid rgba(48,209,88,.25);';
        badge.textContent = 'o" Installiert';
        const openBtn = document.createElement('button');
        openBtn.textContent = '-ffnen';
        openBtn.style.cssText = 'flex:1;padding:8px;border:none;border-radius:8px;background:rgba(255,255,255,.12);color:rgba(255,255,255,.9);cursor:pointer;font-size:13px;font-weight:600;font-family:var(--font);transition:background .12s;';
        openBtn.onmouseenter = () => openBtn.style.background='rgba(255,255,255,.2)';
        openBtn.onmouseleave = () => openBtn.style.background='rgba(255,255,255,.12)';
        openBtn.onclick = () => _launch(app.id);
        row.appendChild(badge);
        row.appendChild(openBtn);
        action.appendChild(row);

      } else {
        // Not installed: show download button
        const btn = document.createElement('button');
        btn.textContent = 'Laden';
        btn.style.cssText = 'width:100%;padding:9px;border:none;border-radius:9px;background:linear-gradient(135deg,#bf5af2,#0a84ff);color:white;cursor:pointer;font-size:13px;font-weight:700;font-family:var(--font);transition:filter .15s;letter-spacing:.3px;box-shadow:0 3px 12px rgba(191,90,242,.3);';
        btn.onmouseenter = () => btn.style.filter='brightness(1.15)';
        btn.onmouseleave = () => btn.style.filter='';
        btn.onclick = () => _startDownload(app);
        action.appendChild(btn);
      }
    }

    /* ──? Start download ──—————————————————————————————————————?── */
    function _startDownload(app) {
      // Guard: never download already installed app
      if (_installed.has(app.id)) { _launch(app.id); return; }
      // Guard: never start duplicate download
      if (_dl[app.id]) return;

      const durationMs = _estimateDuration(app.bytes);
      _dl[app.id] = { pct: 0, timer: null };

      // Update card action immediately
      const card = gridEl.querySelector(`[data-appid="${app.id}"]`);
      if (card) _updateCardAction(card, app);

      const start = Date.now();
      _dl[app.id].timer = setInterval(() => {
        const elapsed = Date.now() - start;
        const raw = Math.min(99, (elapsed / durationMs) * 100);
        // Slightly non-linear: slow near 100%
        const visual = raw < 80 ? raw : 80 + (raw - 80) * 0.35;
        _dl[app.id].pct = visual;

        // Live-update bar without full re-render
        const card2 = gridEl.querySelector(`[data-appid="${app.id}"]`);
        const action = card2?.querySelector('.st-action');
        if (action?._bar)  action._bar.style.width  = visual + '%';
        if (action?._span) action._span.textContent  = Math.round(visual) + '% ── Wird geladen…';

        if (elapsed >= durationMs) {
          clearInterval(_dl[app.id].timer);
          delete _dl[app.id];

          // Mark installed
          _installed.add(app.id);
          saveInstalled(_installed);

          // Add to Desktop if not already there
          const desk = LexaFS.getDesktopFolder();
          if (desk && !LexaFS.getChildren(desk.id).find(c => c.name === app.name + '.app')) {
            LexaFS.createFile({
              name: app.name + '.app',
              isFolder: false,
              content: JSON.stringify({ appId: app.id, displayName: app.name }),
              parentId: desk.id,
            });
            LexaDesktop.renderDesktop();
          }

          LexaOS.toast('Lexa Store', `${app.name} wurde installiert! o.`, 'Y>️');
          render(); // full re-render to show "Installiert + -ffnen"
        }
      }, 150);
    }

    /* ──? Launch app ──—————————————————————————————————————————?── */
    function _launch(appId) {
      const launchers = {
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
        imageviewer: () => LexaOS.toast('Bildanzeige','-ffne eine Bilddatei aus dem Explorer','"️'),
        store:       () => LexaApps.openStore(),
        studio:      () => LexaApps.openStudio?.(),
        music:       () => LexaApps.openMusic?.(),
        videoplayer: () => LexaApps.openVideoPlayer?.(),
        systemcontrol: () => LexaApps.openSystemControl?.(),
      };
      launchers[appId]?.();
    }

    /* ──? Create window ──——————————————————————————————————————?── */
    LexaWM.createWindow({
      title:'Lexa Store', icon:'🛍️', content: root,
      width:820, height:580, minW:600, minH:420, appId:'store',
      onClose: () => {
        // Cancel all active downloads when window closes
        Object.values(_dl).forEach(d => clearInterval(d.timer));
      },
    });

    render();
  }

  window.LexaApps = window.LexaApps || {};
  LexaApps.openStore = openStore;

})();

