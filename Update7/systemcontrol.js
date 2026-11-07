/* ============================================================
   LexaOS – Systemsteuerung
   Zentrale Geraete-Einstellungen
   ============================================================ */

'use strict';

(function () {

  const KEY = 'lexaos_syscontrol';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
  let S = Object.assign({
    brightness: 100, nightLight: false, nightLightIntensity: 60,
    autoLock: '5', screenTimeout: '10',
    volume: 100, systemSounds: true, notificationSound: true, micVolume: 80,
    wifi: true, wifiVisible: true, hotspot: false, vpn: false, dataSaver: false,
    batterySaver: false, batteryThreshold: '20', powerMode: 'balanced', sleepAfter: '15',
    location: true, camera: true, microphone: true, ads: false, diagnostics: 'basic',
    bluetooth: true, autoBluetooth: true, printer: true, usb: true,
    highContrast: false, colorFilter: 'none', fontSize: '100', narrator: false, stickyKeys: false,
    autoTime: true, autoTimezone: true, format24h: true, showSeconds: false,
    audioQuality: 'medium', sampleRate: '44100', bitDepth: '16', noiseReduction: false, equalizer: false, bassBoost: 0, trebleBoost: 0,
  }, load());

  function persist() {
    save(S);
    if (typeof LexaOS.applyBrightness === 'function') LexaOS.applyBrightness(S.brightness);
    LexaOS.state.volume = S.volume;
    LexaOS.state.brightness = S.brightness;
    applyNightLight(); applyColorFilter(); applyHighContrast();
  }

  function applyNightLight() {
    let el = document.getElementById('_sysc_nightlight');
    if (!S.nightLight) { el && el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = '_sysc_nightlight';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99998;';
      document.body.appendChild(el);
    }
    el.style.background = 'rgba(255,150,50,' + ((S.nightLightIntensity/100)*0.25) + ')';
    el.style.mixBlendMode = 'multiply';
  }

  function applyColorFilter() {
    const map = { none:'none', grayscale:'grayscale(1)', invert:'invert(1) hue-rotate(180deg)' };
    if (S.colorFilter === 'none') { document.documentElement.style.filter = ''; return; }
    if (map[S.colorFilter]) { document.documentElement.style.filter = map[S.colorFilter]; return; }
    _ensureCB();
    document.documentElement.style.filter = 'url(#_sysc_' + S.colorFilter + ')';
  }

  function _ensureCB() {
    if (document.getElementById('_sysc_cb_svg')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id = '_sysc_cb_svg';
    svg.style.cssText = 'position:absolute;width:0;height:0;';
    svg.innerHTML = '<filter id="_sysc_protanopia"><feColorMatrix type="matrix" values="0.567,0.433,0,0,0  0.558,0.442,0,0,0  0,0.242,0.758,0,0  0,0,0,1,0"/></filter><filter id="_sysc_deuteranopia"><feColorMatrix type="matrix" values="0.625,0.375,0,0,0  0.7,0.3,0,0,0  0,0.3,0.7,0,0  0,0,0,1,0"/></filter><filter id="_sysc_tritanopia"><feColorMatrix type="matrix" values="0.95,0.05,0,0,0  0,0.433,0.567,0,0  0,0.475,0.525,0,0  0,0,0,1,0"/></filter>';
    document.body.appendChild(svg);
  }

  function applyHighContrast() {
    document.documentElement.classList.toggle('_sysc_highcontrast', !!S.highContrast);
  }

  /* ── UI-Helfer ───────────────────────────────────────────── */
  function makeGroup(title) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:0 0 22px 0;';
    if (title) {
      const h = document.createElement('div');
      h.style.cssText = 'font-size:12px;font-weight:600;color:rgba(255,255,255,.5);margin:0 0 10px 2px;letter-spacing:.5px;text-transform:uppercase;';
      h.textContent = title;
      wrap.appendChild(h);
    }
    const box = document.createElement('div');
    box.className = 'settings-group';
    box.style.margin = '0';
    wrap.appendChild(box);
    return { wrap, box };
  }

  function makeRow(label, sub, control) {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const left = document.createElement('div');
    left.style.flex = '1';
    left.innerHTML = '<div class="settings-row-label">' + label + '</div>' + (sub ? '<div class="settings-row-sub">' + sub + '</div>' : '');
    row.appendChild(left);
    if (control) row.appendChild(control);
    return row;
  }

  function makeToggle(label, sub, initial, cb) {
    const tog = document.createElement('div');
    tog.className = 'toggle' + (initial ? ' on' : '');
    tog.addEventListener('click', () => { tog.classList.toggle('on'); cb(tog.classList.contains('on')); });
    return makeRow(label, sub, tog);
  }

  function makeSlider(label, sub, min, max, value, cb) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:180px;';
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.value = value;
    inp.style.cssText = 'flex:1;accent-color:#0a84ff;';
    const val = document.createElement('span');
    val.style.cssText = 'font-size:11px;color:rgba(255,255,255,.5);min-width:36px;text-align:right;';
    val.textContent = value + '%';
    inp.addEventListener('input', () => { val.textContent = inp.value + '%'; cb(parseInt(inp.value, 10)); });
    wrap.appendChild(inp); wrap.appendChild(val);
    return makeRow(label, sub, wrap);
  }

  function makeSelect(label, sub, options, current, cb) {
    const sel = document.createElement('select');
    sel.style.cssText = 'background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 10px;font-size:12px;min-width:160px;';
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = o.label; opt.style.background = '#1c1c28';
      if (o.value === current) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => cb(sel.value));
    return makeRow(label, sub, sel);
  }

  function makeButton(label, sub, text, cb, danger) {
    const btn = document.createElement('button');
    btn.className = 'editor-btn';
    btn.style.cssText = 'padding:7px 14px;font-size:12px;' + (danger ? 'background:#c0392b;' : '');
    btn.textContent = text;
    btn.addEventListener('click', cb);
    return makeRow(label, sub, btn);
  }

  function makeInfo(label, value) {
    return makeRow(label, '', (() => {
      const s = document.createElement('span');
      s.style.cssText = 'font-size:12px;color:rgba(255,255,255,.6);';
      s.textContent = value;
      return s;
    })());
  }

  /* ── Kategorien ─────────────────────────────────────────── */
  const CATEGORIES = [
    { id:'display',  icon:'🖥️', label:'Anzeige & Bildschirm' },
    { id:'sound',    icon:'🔊', label:'Ton & Audio' },
    { id:'network',  icon:'📶', label:'Netzwerk & Internet' },
    { id:'privacy',  icon:'🔒', label:'Datenschutz' },
    { id:'devices',  icon:'🖨️', label:'Geräte & Zubehör' },
    { id:'access',   icon:'♿', label:'Barrierefreiheit' },
    { id:'datetime', icon:'🕒', label:'Datum & Uhrzeit' },
    { id:'system',   icon:'ℹ️', label:'System-Info' },
  ];

  const renderers = {
    display(root) {
      const g1 = makeGroup('Bildschirm');
      g1.box.appendChild(makeSlider('Helligkeit', 'Bildschirmhelligkeit anpassen', 10, 100, S.brightness, v => { S.brightness = v; persist(); }));
      g1.box.appendChild(makeToggle('Nachtlicht', 'Wärmere Farben für die Augen', S.nightLight, v => { S.nightLight = v; persist(); }));
      g1.box.appendChild(makeSlider('Nachtlicht-Intensität', 'Stärke des warmen Farbtons', 0, 100, S.nightLightIntensity, v => { S.nightLightIntensity = v; persist(); }));
      root.appendChild(g1.wrap);
      const g2 = makeGroup('Bildschirmschoner & Sperren');
      g2.box.appendChild(makeSelect('Bildschirm ausschalten nach', 'Energie sparen', [
        {value:'5',label:'5 Minuten'},{value:'10',label:'10 Minuten'},{value:'15',label:'15 Minuten'},{value:'30',label:'30 Minuten'},{value:'0',label:'Nie'}
      ], S.screenTimeout, v => { S.screenTimeout = v; persist(); }));
      g2.box.appendChild(makeSelect('Automatisch sperren nach', 'Sicherheit', [
        {value:'1',label:'1 Minute'},{value:'5',label:'5 Minuten'},{value:'10',label:'10 Minuten'},{value:'0',label:'Nie'}
      ], S.autoLock, v => { S.autoLock = v; persist(); }));
      root.appendChild(g2.wrap);
    },

    sound(root) {
      const g = makeGroup('Audio-Ausgabe');
      g.box.appendChild(makeSlider('Lautstärke', 'Systemlautstärke', 0, 100, S.volume, v => { S.volume = v; persist(); }));
      g.box.appendChild(makeToggle('Systemtöne', 'Töne für Systemereignisse', S.systemSounds, v => { S.systemSounds = v; persist(); }));
      g.box.appendChild(makeToggle('Benachrichtigungston', 'Ton bei Benachrichtigungen', S.notificationSound, v => { S.notificationSound = v; persist(); }));
      root.appendChild(g.wrap);
      const g2 = makeGroup('Audio-Eingabe');
      g2.box.appendChild(makeSlider('Mikrofon-Lautstärke', 'Empfindlichkeit des Mikrofons', 0, 100, S.micVolume, v => { S.micVolume = v; persist(); }));
      root.appendChild(g2.wrap);
      const g3 = makeGroup('Wiedergabe-Gerät');
      g3.box.appendChild(makeInfo('Standard-Lautsprecher', 'System-Default (Stereo)'));
      g3.box.appendChild(makeInfo('Ausgabeformat', '48 kHz, 24 Bit'));
      root.appendChild(g3.wrap);

      // Sound-Qualität — nur nach Update 7 verfügbar
      if (localStorage.getItem('lexaos_sound_quality_enabled') === 'true') {
        const g4 = makeGroup('Klangqualität');
        g4.box.appendChild(makeSelect('Audio-Qualität', 'Höhere Qualität = besserer Klang, mehr Datenverbrauch', [
          {value:'low',label:'Niedrig (22 kHz, 8 Bit)'},
          {value:'medium',label:'Mittel (44 kHz, 16 Bit)'},
          {value:'high',label:'Hoch (48 kHz, 24 Bit)'},
          {value:'lossless',label:'Verlustfrei (96 kHz, 32 Bit)'},
        ], S.audioQuality || 'medium', v => { S.audioQuality = v; persist(); }));
        g4.box.appendChild(makeSelect('Sample-Rate', 'Abtastrate für Audiowiedergabe', [
          {value:'22050',label:'22.05 kHz'},
          {value:'44100',label:'44.1 kHz'},
          {value:'48000',label:'48 kHz'},
          {value:'96000',label:'96 kHz'},
        ], S.sampleRate || '44100', v => { S.sampleRate = v; persist(); }));
        g4.box.appendChild(makeSelect('Bit-Tiefe', 'Auflösung der Audiowiedergabe', [
          {value:'8',label:'8 Bit'},
          {value:'16',label:'16 Bit'},
          {value:'24',label:'24 Bit'},
          {value:'32',label:'32 Bit'},
        ], S.bitDepth || '16', v => { S.bitDepth = v; persist(); }));
        g4.box.appendChild(makeToggle('Rauschunterdrückung', 'Hintergrundgeräusche entfernen', S.noiseReduction || false, v => { S.noiseReduction = v; persist(); }));
        g4.box.appendChild(makeToggle('Equalizer', 'Klangprofile anpassen', S.equalizer || false, v => { S.equalizer = v; persist(); }));
        g4.box.appendChild(makeSlider('Bass-Verstärkung', 'Tiefe Frequenzen verstärken', -10, 10, S.bassBoost || 0, v => { S.bassBoost = v; persist(); }));
        g4.box.appendChild(makeSlider('Höhen-Verstärkung', 'Hohe Frequenzen verstärken', -10, 10, S.trebleBoost || 0, v => { S.trebleBoost = v; persist(); }));
        root.appendChild(g4.wrap);
      }
    },

    network(root) {
      const g = makeGroup('WLAN');
      g.box.appendChild(makeToggle('WLAN', 'Drahtlosverbindung', S.wifi, v => { S.wifi = v; persist(); LexaOS.state.wlan = v; }));
      g.box.appendChild(makeToggle('Netzwerk sichtbar', 'Andere Geräte können dieses Netzwerk sehen', S.wifiVisible, v => { S.wifiVisible = v; persist(); }));
      root.appendChild(g.wrap);
      const g2 = makeGroup('Weitere Verbindungen');
      g2.box.appendChild(makeToggle('Mobiler Hotspot', 'Internetverbindung teilen', S.hotspot, v => { S.hotspot = v; persist(); }));
      g2.box.appendChild(makeToggle('VPN', 'Virtuelles privates Netzwerk', S.vpn, v => { S.vpn = v; persist(); }));
      g2.box.appendChild(makeToggle('Datensparmodus', 'Hintergrunddaten reduzieren', S.dataSaver, v => { S.dataSaver = v; persist(); }));
      root.appendChild(g2.wrap);
    },

    privacy(root) {
      const g = makeGroup('Berechtigungen');
      g.box.appendChild(makeToggle('Standortdienste', 'Apps dürfen den Standort nutzen', S.location, v => { S.location = v; persist(); }));
      g.box.appendChild(makeToggle('Kamera', 'Apps dürfen die Kamera nutzen', S.camera, v => { S.camera = v; persist(); }));
      g.box.appendChild(makeToggle('Mikrofon', 'Apps dürfen das Mikrofon nutzen', S.microphone, v => { S.microphone = v; persist(); }));
      root.appendChild(g.wrap);
      const g2 = makeGroup('Datenschutz');
      g2.box.appendChild(makeToggle('Personalisierte Werbung', 'Interessenbasierte Anzeigen', S.ads, v => { S.ads = v; persist(); }));
      g2.box.appendChild(makeSelect('Diagnosedaten', 'An den Entwickler senden', [
        {value:'off',label:'Aus'},{value:'basic',label:'Basis'},{value:'full',label:'Vollständig'}
      ], S.diagnostics, v => { S.diagnostics = v; persist(); }));
      root.appendChild(g2.wrap);
      const g3 = makeGroup('Verlauf');
      g3.box.appendChild(makeButton('Browser-Verlauf', 'Alle besuchten Seiten löschen', 'Verlauf löschen', () => {
        try { localStorage.removeItem('lexaos_browser_history'); } catch {}
        LexaOS.toast('Datenschutz', 'Browser-Verlauf wurde gelöscht', '🗑️');
      }));
      g3.box.appendChild(makeButton('Cookie-Daten', 'Gespeicherte Cookies entfernen', 'Cookies löschen', () => {
        LexaOS.toast('Datenschutz', 'Cookie-Daten wurden gelöscht', '🍪');
      }));
      root.appendChild(g3.wrap);
    },

    devices(root) {
      const g = makeGroup('Bluetooth-Geräte');
      g.box.appendChild(makeToggle('Bluetooth', 'Drahtlose Geräte verbinden', S.bluetooth, v => { S.bluetooth = v; persist(); LexaOS.state.bluetooth = v; }));
      g.box.appendChild(makeToggle('Automatisch verbinden', 'Bekannte Geräte automatisch koppeln', S.autoBluetooth, v => { S.autoBluetooth = v; persist(); }));
      g.box.appendChild(makeButton('Neues Gerät', 'Nach Bluetooth-Geräten suchen', 'Gerät suchen', () => {
        LexaOS.toast('Bluetooth', 'Suche nach Geräten…', '🔵');
        setTimeout(() => LexaOS.toast('Bluetooth', 'Keine neuen Geräte gefunden', 'ℹ️'), 2600);
      }));
      root.appendChild(g.wrap);
      const g2 = makeGroup('Drucker & Scanner');
      g2.box.appendChild(makeToggle('Drucker-Support', 'Drucker automatisch erkennen', S.printer, v => { S.printer = v; persist(); }));
      g2.box.appendChild(makeInfo('Standard-Drucker', 'Kein Drucker eingerichtet'));
      root.appendChild(g2.wrap);
      const g3 = makeGroup('USB & Zubehör');
      g3.box.appendChild(makeToggle('USB-Geräte', 'Externe Geräte automatisch erkennen', S.usb, v => { S.usb = v; persist(); }));
      g3.box.appendChild(makeInfo('Verbundene Geräte', 'Keine'));
      root.appendChild(g3.wrap);
    },

    access(root) {
      const g = makeGroup('Sehen');
      g.box.appendChild(makeToggle('Hoher Kontrast', 'Bessere Lesbarkeit', S.highContrast, v => { S.highContrast = v; persist(); }));
      g.box.appendChild(makeSelect('Farbfilter', 'Für Farbfehlsichtigkeit', [
        {value:'none',label:'Aus'},{value:'grayscale',label:'Graustufen'},{value:'invert',label:'Farben invertieren'},
        {value:'protanopia',label:'Rot-Grün (Protanopie)'},{value:'deuteranopia',label:'Rot-Grün (Deuteranopie)'},{value:'tritanopia',label:'Blau-Gelb (Tritanopie)'}
      ], S.colorFilter, v => { S.colorFilter = v; persist(); }));
      g.box.appendChild(makeSelect('Textgröße', 'Standardmäßige Schriftgröße', [
        {value:'85',label:'Klein'},{value:'100',label:'Normal'},{value:'115',label:'Groß'},{value:'130',label:'Sehr groß'}
      ], S.fontSize, v => { S.fontSize = v; persist(); }));
      root.appendChild(g.wrap);
      const g2 = makeGroup('Hören & Eingabe');
      g2.box.appendChild(makeToggle('Sprachausgabe (Vorlesefunktion)', 'Bildschirminhalt vorlesen', S.narrator, v => { S.narrator = v; persist(); }));
      g2.box.appendChild(makeToggle('Haftende Tasten', 'Tastenkombinationen einfacher', S.stickyKeys, v => { S.stickyKeys = v; persist(); }));
      root.appendChild(g2.wrap);
    },
    datetime(root) {
      const now = new Date();
      const g = makeGroup('Datum & Uhrzeit');
      g.box.appendChild(makeToggle('Automatisch einstellen', 'Datum & Uhrzeit per Netzwerk', S.autoTime, v => { S.autoTime = v; persist(); }));
      g.box.appendChild(makeToggle('Zeitzone automatisch', 'Zeitzone per Standort', S.autoTimezone, v => { S.autoTimezone = v; persist(); }));
      g.box.appendChild(makeInfo('Aktuelle Zeit', now.toLocaleTimeString('de-DE')));
      g.box.appendChild(makeInfo('Aktuelles Datum', now.toLocaleDateString('de-DE', { weekday:'long', year:'numeric', month:'long', day:'numeric' })));
      g.box.appendChild(makeInfo('Zeitzone', Intl.DateTimeFormat().resolvedOptions().timeZone));
      root.appendChild(g.wrap);
      const g2 = makeGroup('Anzeige-Format');
      g2.box.appendChild(makeToggle('24-Stunden-Format', 'Uhrzeit im 24h-Format', S.format24h, v => { S.format24h = v; persist(); }));
      g2.box.appendChild(makeToggle('Sekunden anzeigen', 'Sekunden in der Uhr', S.showSeconds, v => { S.showSeconds = v; persist(); }));
      root.appendChild(g2.wrap);
    },

    system(root) {
      const nav = navigator;
      const g = makeGroup('Geräte-Informationen');
      g.box.appendChild(makeInfo('Gerätename', 'LexaOS-PC'));
      g.box.appendChild(makeInfo('Prozessor', 'Virtual CPU (Browser Engine)'));
      g.box.appendChild(makeInfo('Arbeitsspeicher', '8 GB (virtuell)'));
      g.box.appendChild(makeInfo('Systemtyp', '64-Bit'));
      g.box.appendChild(makeInfo('LexaOS-Version', '3.0.0'));
      root.appendChild(g.wrap);
      const g2 = makeGroup('Software');
      g2.box.appendChild(makeInfo('Browser-Engine', nav.userAgent.indexOf('Electron') >= 0 ? 'Electron / Chromium' : (nav.userAgent.indexOf('Chrome') >= 0 ? 'Chromium' : 'Unbekannt')));
      g2.box.appendChild(makeInfo('Plattform', nav.platform || 'Unbekannt'));
      g2.box.appendChild(makeInfo('Sprache', nav.language || 'de'));
      root.appendChild(g2.wrap);
      const g3 = makeGroup('Wartung');
      g3.box.appendChild(makeButton('Speicher', 'Temporäre Daten bereinigen', 'Speicher bereinigen', () => {
        LexaOS.toast('Wartung', 'Temporäre Daten wurden bereinigt', '🧹');
      }));
      g3.box.appendChild(makeButton('System-Update', 'Nach Updates suchen', 'Updates prüfen', () => {
        if (window.LexaUpdater) { window.LexaUpdater.check(); LexaOS.toast('Update', 'Suche nach Updates…', '🔄'); }
        else LexaOS.toast('Update', 'Updater nicht verfügbar', '⚠️');
      }));
      root.appendChild(g3.wrap);
    },
  };

  /* ── App-Fenster ─────────────────────────────────────────── */
  function openSystemControl(startCat) {
    startCat = startCat || 'display';
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;height:100%;background:#17171e;color:#fff;font-family:var(--font,sans-serif);overflow:hidden;';

    const sidebar = document.createElement('div');
    sidebar.style.cssText = 'width:230px;flex-shrink:0;background:rgba(255,255,255,.03);border-right:1px solid rgba(255,255,255,.07);overflow-y:auto;padding:14px 0;';

    const title = document.createElement('div');
    title.style.cssText = 'padding:0 18px 14px;font-size:16px;font-weight:600;display:flex;align-items:center;gap:10px;';
    title.innerHTML = '<span style="font-size:20px;">🎛️</span><span>Systemsteuerung</span>';
    sidebar.appendChild(title);

    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'padding:0 14px 12px;';
    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = '🔍  Einstellungen suchen…';
    search.style.cssText = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:7px 10px;color:#fff;font-size:12px;outline:none;';
    searchWrap.appendChild(search);
    sidebar.appendChild(searchWrap);

    const content = document.createElement('div');
    content.style.cssText = 'flex:1;overflow-y:auto;padding:20px 24px;';

    const navItems = [];
    function setActive(id) {
      navItems.forEach(n => {
        n.el.style.background = n.id === id ? 'rgba(10,132,255,.18)' : 'transparent';
        n.el.style.color = n.id === id ? '#409cff' : 'rgba(255,255,255,.75)';
      });
    }

    function showCategory(id) {
      content.innerHTML = '';
      const cat = CATEGORIES.find(c => c.id === id);
      if (!cat) return;
      const heading = document.createElement('div');
      heading.style.cssText = 'font-size:20px;font-weight:600;margin:0 0 18px 0;display:flex;align-items:center;gap:10px;';
      heading.innerHTML = '<span style="font-size:24px;">' + cat.icon + '</span><span>' + cat.label + '</span>';
      content.appendChild(heading);
      (renderers[id] || function(){})(content);
      setActive(id);
      content.scrollTop = 0;
    }

    function filterNav(query) {
      const q = query.toLowerCase().trim();
      navItems.forEach(n => {
        const match = !q || n.label.toLowerCase().indexOf(q) >= 0;
        n.el.style.display = match ? 'flex' : 'none';
      });
    }

    CATEGORIES.forEach(c => {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:11px;padding:10px 18px;cursor:pointer;transition:background .12s;font-size:13px;color:rgba(255,255,255,.75);';
      item.innerHTML = '<span style="font-size:17px;width:22px;text-align:center;">' + c.icon + '</span><span>' + c.label + '</span>';
      item.addEventListener('mouseenter', () => { if (item.style.background !== 'rgba(10,132,255,.18)') item.style.background = 'rgba(255,255,255,.06)'; });
      item.addEventListener('mouseleave', () => { if (item.style.background !== 'rgba(10,132,255,.18)') item.style.background = 'transparent'; });
      item.addEventListener('click', () => showCategory(c.id));
      sidebar.appendChild(item);
      navItems.push({ id: c.id, el: item, label: c.label });
    });

    search.addEventListener('input', () => filterNav(search.value));

    root.appendChild(sidebar);
    root.appendChild(content);

    showCategory(startCat);

    LexaWM.createWindow({
      title: 'Systemsteuerung',
      icon: '🎛️',
      content: root,
      width: 920, height: 620, minW: 680, minH: 480,
      appId: 'systemcontrol',
    });
  }

  window.LexaApps = window.LexaApps || {};
  LexaApps.openSystemControl = openSystemControl;
  LexaApps.openSystemSettings = openSystemControl;

})();
