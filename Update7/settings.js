/* ============================================================
   LexaOS v2 - Settings App
   ============================================================ */

'use strict';

(function () {

  function openSettings(page = 'system') {
    const layout = document.createElement('div');
    layout.className = 'settings-layout';

    const pages = [
      { id:'system',    icon:'💻', label:'System' },
      { id:'wallpaper', icon:'🖼️', label:'Hintergrund' },
      { id:'taskbar',   icon:'📌', label:'Taskleiste' },
      { id:'display',   icon:'☀️', label:'Anzeige' },
      { id:'network',   icon:'📶', label:'Netzwerk' },
      { id:'bluetooth', icon:'🔵', label:'Bluetooth' },
      { id:'sound',     icon:'🔊', label:'Ton' },
      { id:'updates',   icon:'🔄', label:'Updates' },
      { id:'about',     icon:'ℹ️', label:'Über LexaOS' },
    ];

    const sidebar = document.createElement('div');
    sidebar.className = 'settings-sidebar';
    pages.forEach(p => {
      const item = document.createElement('div');
      item.className = 'settings-nav-item' + (p.id === page ? ' active' : '');
      item.dataset.page = p.id;
      item.innerHTML = `<span>${p.icon}</span><span>${p.label}</span>`;
      sidebar.appendChild(item);
    });

    const content = document.createElement('div');
    content.className = 'settings-content';

    /* ── PAGE RENDERERS ────────────────────────────────────── */
    const render = {

      system() {
        content.innerHTML = '<div class="settings-section-title">System</div>';
        content.appendChild(makeTitle('Allgemein'));

        const user = LexaInstaller.getUser();
        const allLangs = Object.keys(LexaI18n.LANG_MAP); // all 10 language names
        const currentLang = user.lang || 'Deutsch';

        const langSelect = makeSelect(LexaI18n.t('language'), allLangs, currentLang, (selectedLangName) => {
          // Apply immediately and fully
          LexaI18n.setLang(selectedLangName);
          try {
            const u = JSON.parse(localStorage.getItem('lexaos_user') || '{}');
            u.lang = selectedLangName;
            localStorage.setItem('lexaos_user', JSON.stringify(u));
          } catch {}
          LexaI18n.applyToDOM();
          // Repopulate start menu if open
          if (typeof LexaTaskbar !== 'undefined') {
            const grid = document.getElementById('start-apps-grid');
            if (grid) {
              // force re-populate
              const filter = document.getElementById('start-search')?.value || '';
              LexaTaskbar.APP_LIST && grid.querySelectorAll('.start-app-name').forEach(el => {
                // names are already lazy via t() — just trigger repopulation
              });
            }
          }
          LexaOS.toast(LexaI18n.t('language'), selectedLangName, '🌐');
        });

        // Restart note
        const noteEl = document.createElement('div');
        noteEl.style.cssText = 'font-size:11px;color:rgba(255,255,255,.32);margin:6px 0 0 0;padding:0 2px;';
        noteEl.textContent = LexaI18n.t('lang_restart_note');

        content.appendChild(makeGroup([
          makeToggle('Animationen', 'Fenster- und Übergangsanimationen', true, () => {}),
          makeToggle('Glaseffekte', 'Transparente Fenster', true, v => {
            document.querySelectorAll('.window').forEach(w => {
              w.style.backdropFilter = v ? '' : 'none';
            });
          }),
          langSelect,
        ]));
        content.appendChild(noteEl);
      },

      wallpaper() {
        content.innerHTML = '<div class="settings-section-title">Hintergrund</div>';

        /* ── Source switcher: LexaOS vs. Gerät ─────────────── */
        const srcRow = document.createElement('div');
        srcRow.style.cssText = 'display:flex;gap:8px;margin:0 0 14px;';

        let activeSource = 'lexaos'; // 'lexaos' | 'device'

        const btnLexaOS = document.createElement('button');
        const btnDevice = document.createElement('button');

        function styleSourceBtn(btn, active) {
          btn.style.cssText = `flex:1;padding:9px 0;border-radius:8px;border:1.5px solid ${active?'#0a84ff':'rgba(255,255,255,.12)'};background:${active?'rgba(10,132,255,.15)':'rgba(255,255,255,.05)'};color:${active?'#409cff':'rgba(255,255,255,.6)'};cursor:pointer;font-size:13px;font-weight:${active?'600':'400'};font-family:var(--font);transition:all .15s;`;
        }

        btnLexaOS.innerHTML = '⬡ LexaOS';
        btnDevice.innerHTML = '📱 Gerät';
        styleSourceBtn(btnLexaOS, true);
        styleSourceBtn(btnDevice, false);

        srcRow.appendChild(btnLexaOS);
        srcRow.appendChild(btnDevice);
        content.appendChild(srcRow);

        /* ── LexaOS panel: gradient presets ──────────────────── */
        const lexaosPanel = document.createElement('div');
        const labels = ['Aurora','Sonnenuntergang','Smaragd','Lila','Tiefsee','Wald'];
        const grid = document.createElement('div');
        grid.className = 'wallpaper-grid';
        LexaOS.WALLPAPERS.forEach((wp, i) => {
          const el = document.createElement('div');
          el.className = 'wallpaper-option' + (LexaOS.state.wallpaper === i && !LexaOS.state.customWallpaper ? ' selected' : '');
          el.style.background = wp;
          el.innerHTML = `<div class="wallpaper-label">${labels[i]}</div>`;
          el.addEventListener('click', () => {
            grid.querySelectorAll('.wallpaper-option').forEach(o => o.classList.remove('selected'));
            el.classList.add('selected');
            LexaOS.applyWallpaper(i);
            LexaOS.toast('Hintergrund', labels[i] + ' gesetzt', '🖼️');
          });
          grid.appendChild(el);
        });
        lexaosPanel.appendChild(grid);

        /* ── Device panel: native file picker ────────────────── */
        const devicePanel = document.createElement('div');
        devicePanel.style.display = 'none';

        const uploadBox = document.createElement('div');
        uploadBox.style.cssText = 'margin:0 0 14px;padding:26px 20px;background:rgba(255,255,255,.04);border:2px dashed rgba(255,255,255,.12);border-radius:12px;text-align:center;cursor:pointer;transition:all .15s;';
        uploadBox.innerHTML = `
          <div style="font-size:38px;margin-bottom:10px;">📂</div>
          <div style="font-size:14px;font-weight:500;color:rgba(255,255,255,.75);margin-bottom:4px;">Bild vom Gerät wählen</div>
          <div style="font-size:12px;color:rgba(255,255,255,.32);">PNG, JPG, GIF, WebP — vom PC oder Handy</div>
        `;
        uploadBox.onmouseenter = () => { uploadBox.style.background='rgba(255,255,255,.08)'; uploadBox.style.borderColor='rgba(255,255,255,.25)'; };
        uploadBox.onmouseleave = () => { uploadBox.style.background='rgba(255,255,255,.04)'; uploadBox.style.borderColor='rgba(255,255,255,.12)'; };

        const previewBox = document.createElement('div');
        previewBox.style.cssText = 'display:none;margin-top:12px;border-radius:10px;overflow:hidden;position:relative;aspect-ratio:16/9;background:rgba(0,0,0,.3);';
        previewBox.innerHTML = `
          <img id="wp-preview-img" style="width:100%;height:100%;object-fit:cover;" />
          <div style="position:absolute;bottom:0;left:0;right:0;padding:10px 14px;background:linear-gradient(transparent,rgba(0,0,0,.8));display:flex;justify-content:space-between;align-items:center;">
            <span id="wp-preview-name" style="font-size:12px;color:rgba(255,255,255,.8);"></span>
            <button id="wp-apply-btn" style="padding:5px 14px;background:#0a84ff;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-family:var(--font);">Anwenden</button>
          </div>
        `;

        devicePanel.appendChild(uploadBox);
        devicePanel.appendChild(previewBox);

        let _selectedFile = null;

        uploadBox.addEventListener('click', () => {
          const inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = 'image/*';
          inp.addEventListener('change', () => {
            const file = inp.files[0];
            if (!file) return;
            _selectedFile = file;
            const reader = new FileReader();
            reader.onload = ev => {
              const img = previewBox.querySelector('#wp-preview-img');
              const nm  = previewBox.querySelector('#wp-preview-name');
              if (img) img.src = ev.target.result;
              if (nm)  nm.textContent = file.name;
              previewBox.style.display = 'block';
            };
            reader.readAsDataURL(file);
          });
          inp.click();
        });

        previewBox.querySelector('#wp-apply-btn')?.addEventListener('click', () => {
          if (!_selectedFile) return;
          const reader = new FileReader();
          reader.onload = ev => {
            const dataUrl = ev.target.result;
            const wp = document.getElementById('desktop-wallpaper');
            if (wp) {
              wp.style.backgroundImage    = `url("${dataUrl}")`;
              wp.style.backgroundSize     = 'cover';
              wp.style.backgroundPosition = 'center';
            }
            const lw = document.querySelector('.lock-wallpaper');
            if (lw) {
              lw.style.backgroundImage    = `url("${dataUrl}")`;
              lw.style.backgroundSize     = 'cover';
              lw.style.backgroundPosition = 'center';
            }
            try { localStorage.setItem('lexaos_wallpaper_custom', dataUrl); } catch {}
            LexaOS.state.customWallpaper = dataUrl;
            LexaOS.toast('Hintergrund', `"${_selectedFile.name}" als Hintergrund gesetzt`, '🖼️');
            grid.querySelectorAll('.wallpaper-option').forEach(o => o.classList.remove('selected'));
          };
          reader.readAsDataURL(_selectedFile);
        });

        content.appendChild(lexaosPanel);
        content.appendChild(devicePanel);

        /* ── Source switcher events ───────────────────────────── */
        btnLexaOS.addEventListener('click', () => {
          activeSource = 'lexaos';
          styleSourceBtn(btnLexaOS, true);
          styleSourceBtn(btnDevice, false);
          lexaosPanel.style.display = 'block';
          devicePanel.style.display  = 'none';
        });
        btnDevice.addEventListener('click', () => {
          activeSource = 'device';
          styleSourceBtn(btnLexaOS, false);
          styleSourceBtn(btnDevice, true);
          lexaosPanel.style.display = 'none';
          devicePanel.style.display  = 'block';
        });
      },

      taskbar() {
        content.innerHTML = '<div class="settings-section-title">Taskleiste</div>';

        const saved = (() => { try { return JSON.parse(localStorage.getItem('lexaos_taskbar_pos')||'{}'); } catch { return {}; } })();
        const currentPos   = saved.position   || 'bottom';
        const currentStyle = saved.style      || 'windows11';
        const currentSize  = saved.size       || 'normal';

        // Position picker
        content.appendChild(makeTitle('Position'));
        const posGroup = document.createElement('div');
        posGroup.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;';

        const positions = [
          { id:'bottom', label:'Unten',  icon:'⬇', preview:'████\n████\n▬▬▬▬' },
          { id:'left',   label:'Links',  icon:'⬅', preview:'▌███\n▌███\n▌███' },
          { id:'right',  label:'Rechts', icon:'➡', preview:'███▐\n███▐\n███▐' },
        ];

        positions.forEach(p => {
          const card = document.createElement('div');
          const isActive = currentPos === p.id;
          card.style.cssText = `padding:12px;background:${isActive?'rgba(10,132,255,.2)':'rgba(255,255,255,.05)'};border:1.5px solid ${isActive?'#0a84ff':'rgba(255,255,255,.1)'};border-radius:10px;cursor:pointer;text-align:center;transition:all .15s;`;
          card.innerHTML = `<div style="font-size:22px;margin-bottom:4px;">${p.icon}</div><div style="font-size:12px;font-weight:${isActive?'700':'400'};color:${isActive?'#409cff':'rgba(255,255,255,.7)'};">${p.label}</div>`;
          card.onmouseover = () => { if(!isActive) card.style.background='rgba(255,255,255,.09)'; };
          card.onmouseout  = () => { if(!isActive) card.style.background='rgba(255,255,255,.05)'; };
          card.addEventListener('click', () => {
            _applyTaskbarPos(p.id, saved.style||'windows11', saved.size||'normal');
            content.innerHTML=''; render.taskbar();
          });
          posGroup.appendChild(card);
        });
        content.appendChild(posGroup);

        // Style picker
        content.appendChild(makeTitle('Desktop-Stil'));
        const styleGroup = document.createElement('div');
        styleGroup.className = 'settings-group';

        const styles = [
          { id:'windows11', label:'Windows 11',   sub:'Zentrierte Taskleiste, moderne Icons', icon:'🪟' },
          { id:'macos',     label:'macOS',         sub:'Dock unten, macOS-Menüleiste oben',   icon:'🍎' },
          { id:'classic',   label:'Klassisch',     sub:'Taskleiste links, kompaktes Design',  icon:'🖥️' },
        ];

        styles.forEach(s => {
          const isActive = currentStyle === s.id;
          const row = document.createElement('div');
          row.className = 'settings-row';
          row.style.cursor = 'pointer';
          row.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:18px;">${s.icon}</span>
              <div><div class="settings-row-label">${s.label}</div><div class="settings-row-sub">${s.sub}</div></div>
            </div>
            <div style="width:18px;height:18px;border-radius:50%;border:2px solid ${isActive?'#0a84ff':'rgba(255,255,255,.2)'};background:${isActive?'#0a84ff':'transparent'};display:flex;align-items:center;justify-content:center;">
              ${isActive?'<div style="width:8px;height:8px;border-radius:50%;background:white;"></div>':''}
            </div>`;
          row.addEventListener('click', () => {
            _applyTaskbarPos(saved.position||'bottom', s.id, saved.size||'normal');
            content.innerHTML=''; render.taskbar();
          });
          styleGroup.appendChild(row);
        });
        content.appendChild(styleGroup);

        // Size picker
        content.appendChild(makeTitle('Größe'));
        content.appendChild(makeGroup([
          makeSelect('Taskleisten-Größe', ['Klein','Normal','Groß'], {'small':'Klein','normal':'Normal','large':'Groß'}[currentSize]||'Normal', v => {
            const sizeMap = {'Klein':'small','Normal':'normal','Groß':'large'};
            _applyTaskbarPos(saved.position||'bottom', saved.style||'windows11', sizeMap[v]||'normal');
          }),
        ]));

        // Auto-hide toggle
        content.appendChild(makeGroup([
          makeToggle('Automatisch ausblenden', 'Taskleiste verbirgt sich wenn nicht benutzt', saved.autohide||false, v => {
            saved.autohide = v;
            try { localStorage.setItem('lexaos_taskbar_pos', JSON.stringify({...saved, autohide:v})); } catch {}
            _applyAutoHide(v);
          }),
        ]));

        // Taskbar color picker
        content.appendChild(makeTitle('Taskleisten-Farbe'));
        const colorGroup = document.createElement('div');
        colorGroup.className = 'settings-group';
        const currentColor = saved.color || '#1c1c28';
        
        // Predefined colors
        const colors = [
          { hex:'#1c1c28', label:'Standard (Dunkel)' },
          { hex:'#0a84ff', label:'Blau' },
          { hex:'#30d158', label:'Grün' },
          { hex:'#ff453a', label:'Rot' },
          { hex:'#ff9f0a', label:'Orange' },
          { hex:'#bf5af2', label:'Lila' },
          { hex:'#5ac8fa', label:'Hellblau' },
          { hex:'#ff375f', label:'Pink' },
          { hex:'#ffffff', label:'Weiß' },
          { hex:'#000000', label:'Schwarz' },
        ];
        
        // Color swatches grid
        const swatchGrid = document.createElement('div');
        swatchGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px;';
        colors.forEach(c => {
          const swatch = document.createElement('div');
          const isActive = currentColor.toLowerCase() === c.hex.toLowerCase();
          swatch.style.cssText = `width:36px;height:36px;border-radius:8px;background:${c.hex};cursor:pointer;border:2px solid ${isActive?'#0a84ff':'rgba(255,255,255,.2)'};transition:transform .12s;`;
          swatch.title = c.label;
          swatch.onmouseenter = () => swatch.style.transform = 'scale(1.1)';
          swatch.onmouseleave = () => swatch.style.transform = 'scale(1)';
          swatch.addEventListener('click', () => {
            saved.color = c.hex;
            try { localStorage.setItem('lexaos_taskbar_pos', JSON.stringify({...saved, color:c.hex})); } catch {}
            _applyTaskbarColor(c.hex);
            content.innerHTML=''; render.taskbar();
          });
          swatchGrid.appendChild(swatch);
        });
        colorGroup.appendChild(swatchGrid);
        
        // Custom color input
        const customRow = document.createElement('div');
        customRow.className = 'settings-row';
        customRow.innerHTML = '<div class="settings-row-label">Eigene Farbe</div>';
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = currentColor;
        colorInput.style.cssText = 'width:50px;height:32px;border:none;border-radius:6px;cursor:pointer;background:transparent;';
        colorInput.addEventListener('input', (e) => {
          saved.color = e.target.value;
          try { localStorage.setItem('lexaos_taskbar_pos', JSON.stringify({...saved, color:e.target.value})); } catch {}
          _applyTaskbarColor(e.target.value);
        });
        customRow.appendChild(colorInput);
        colorGroup.appendChild(customRow);
        content.appendChild(colorGroup);

        content.appendChild(makeTitle('Vorschau'));
        const preview = document.createElement('div');
        preview.style.cssText = 'height:80px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;position:relative;overflow:hidden;margin-top:4px;';
        const previewBar = document.createElement('div');
        const pos = currentPos;
        previewBar.style.cssText = `position:absolute;background:rgba(10,132,255,.3);border:1px solid rgba(10,132,255,.5);
          ${pos==='bottom'?'bottom:0;left:0;right:0;height:12px;':
            pos==='left'?'left:0;top:0;bottom:0;width:12px;':
            'right:0;top:0;bottom:0;width:12px;'}`;
        preview.appendChild(previewBar);
        preview.innerHTML += `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:rgba(255,255,255,.2);">Vorschau</div>`;
        content.appendChild(preview);
      },

      display() {
        content.innerHTML = '<div class="settings-section-title">Anzeige</div>';
        content.appendChild(makeGroup([
          makeLabel('Fensterbreite', window.innerWidth + ' px'),
          makeLabel('Fensterhöhe',   window.innerHeight + ' px'),
          makeSlider('Helligkeit', 30, 100, LexaOS.state.brightness, v => LexaOS.applyBrightness(v)),
          makeToggle('Vollbild', 'Vollbild-Modus', !!document.fullscreenElement, v => {
            if (v) document.documentElement.requestFullscreen?.().catch(()=>{});
            else   document.exitFullscreen?.().catch(()=>{});
          }),
        ]));
      },

      network() {
        content.innerHTML = '<div class="settings-section-title">Netzwerk & Internet</div>';

        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const online = navigator.onLine;

        content.appendChild(makeGroup([
          makeToggle('WLAN', online ? 'Verbunden' : 'Nicht verbunden', LexaOS.state.wlan, v => {
            LexaOS.state.wlan = v;
            LexaOS.toast('WLAN', v ? 'Aktiviert':'Deaktiviert', '📶');
            LexaTaskbar.bindGlobalClose && window.LexaTaskbar?.init();
          }),
          makeToggle('Flugmodus', 'Alle Verbindungen deaktivieren', LexaOS.state.flightMode, v => {
            LexaOS.state.flightMode = v;
            if (v) { LexaOS.state.wlan = false; LexaOS.state.bluetooth = false; }
            LexaOS.toast('Flugmodus', v ? 'Ein':'Aus', '✈️');
          }),
        ]));

        // Live network info
        const info = document.createElement('div');
        info.className = 'settings-group';
        info.style.marginTop = '14px';
        const rows = [
          ['Status',    navigator.onLine ? '🟢 Online' : '🔴 Offline'],
          ['Verbindungstyp', conn?.type || (online ? 'WiFi/Ethernet' : 'Keine')],
          ['Eff. Typ',  conn?.effectiveType || '—'],
          ['Downlink',  conn?.downlink ? conn.downlink + ' Mbit/s' : '—'],
          ['Latenz (RTT)', conn?.rtt ? conn.rtt + ' ms' : '—'],
          ['Save-Data', conn?.saveData ? 'Ja' : 'Nein'],
        ];
        rows.forEach(([k,v]) => info.appendChild(makeLabel(k, v)));
        content.appendChild(info);
      },

      bluetooth() {
        content.innerHTML = '<div class="settings-section-title">Bluetooth</div>';
        content.appendChild(makeGroup([
          makeToggle('Bluetooth', 'Bluetooth aktivieren', LexaOS.state.bluetooth, v => {
            LexaOS.state.bluetooth = v;
            LexaOS.toast('Bluetooth', v ? 'Aktiviert':'Deaktiviert', '🔵');
          }),
          makeLabel('Gerätename', 'LexaOS'),
          makeLabel('Status',     LexaOS.state.bluetooth ? 'Aktiv (keine Geräte)' : 'Aus'),
        ]));

        const btn = document.createElement('button');
        btn.className = 'editor-btn';
        btn.style.cssText = 'margin:14px 0 0;padding:10px 20px;font-size:13px;';
        btn.textContent = '🔍 Geräte suchen';
        btn.addEventListener('click', () => {
          LexaOS.toast('Bluetooth','Suche nach Geräten…','🔵');
          setTimeout(() => LexaOS.toast('Bluetooth','Keine Geräte in Reichweite','ℹ️'), 2600);
        });
        content.appendChild(btn);
      },

      sound() {
        content.innerHTML = '<div class="settings-section-title">Ton</div>';
        content.appendChild(makeGroup([
          makeToggle('Systemtöne', 'Töne für Ereignisse', true, ()=>{}),
          makeSlider('Lautstärke', 0, 100, LexaOS.state.volume || 100, v => { LexaOS.state.volume = v; }),
        ]));
      },

      updates() {
        content.innerHTML = '<div class="settings-section-title">Updates</div>';

        // Status-Anzeige
        const statusWrap = document.createElement('div');
        statusWrap.className = 'settings-group';
        content.appendChild(statusWrap);

        // Aktion
        const actionWrap = document.createElement('div');
        actionWrap.style.marginTop = '14px';
        content.appendChild(actionWrap);

        let _attached = true;
        let _lastRenderKey = '';   // verhindert Re-Render-Flackern bei unverändertem Status

        function renderStatus() {
          if (!_attached) return;   // Fenster wurde geschlossen → nicht mehr rendern
          const up = window.LexaUpdater;
          if (!up) {
            statusWrap.innerHTML = '<div class="settings-row"><div class="settings-row-label">Updater nicht verfügbar</div></div>';
            return;
          }
          const st = up.status;
          const latest = up.latest;

          // Nur bei Status-/Version-Änderung neu rendern (kein Flackern des Buttons)
          const renderKey = st + '|' + (latest ? latest.name : '') + '|' + up.installed;
          if (renderKey === _lastRenderKey) return;
          _lastRenderKey = renderKey;

          statusWrap.innerHTML = '';
          statusWrap.appendChild(makeLabel('Installierte Version', up.installed !== null ? String(up.installed) : '3.0.0'));
          statusWrap.appendChild(makeLabel('Neuestes Update', latest ? latest.name + ' (Nr. ' + latest.num + ')' : 'Keine Updates verfügbar'));

          // Button „Update herunterladen“
          actionWrap.innerHTML = '';
          const canDownload = (st === 'available') && !!latest;
          const isUpToDate = st === 'up-to-date' || !latest;
          const btn = document.createElement('button');
          btn.className = 'editor-btn';
          btn.style.cssText = 'padding:10px 20px;font-size:13px;';
          btn.textContent = st === 'downloading' ? '⬇️ Wird heruntergeladen…'
                          : st === 'applying'    ? '⚙️ Wird angewendet…'
                          : isUpToDate           ? '✅ Keine Updates verfügbar'
                          : '⬇️ Update herunterladen';
          btn.disabled = !canDownload;
          btn.style.opacity = canDownload ? '1' : '.45';
          btn.style.cursor  = canDownload ? 'pointer' : 'default';
          btn.addEventListener('click', () => { up.download(); });
          actionWrap.appendChild(btn);

          // „Jetzt prüfen“ — etwas mehr Abstand zum Download-Button
          const checkBtn = document.createElement('button');
          checkBtn.className = 'editor-btn';
          checkBtn.style.cssText = 'margin:18px 0 0;padding:8px 16px;font-size:12px;';
          checkBtn.textContent = '🔄 Jetzt prüfen';
          checkBtn.addEventListener('click', () => up.check());
          actionWrap.appendChild(checkBtn);

          // Hinweis
          const hint = document.createElement('div');
          hint.style.cssText = 'font-size:11px;color:rgba(255,255,255,.32);margin:16px 2px 0;line-height:1.6;';
          hint.textContent = 'Es wird alle 30 Minuten automatisch nach neuen Update-Ordnern gesucht. '
                           + 'Der Ordner mit der höchsten Nummer gewinnt. Beim Installieren werden die Systemdaten '
                           + 'des Updates (update.json) übernommen und weitere Dateien in /System/Updates abgelegt.';
          actionWrap.appendChild(hint);
        }

        // Live-Updates: UI bei Status-Änderung aktualisieren; beim Schließen des Settings-Fensters abmelden
        const up = window.LexaUpdater;
        if (up) up.onChange(renderStatus);
        renderStatus();
        const _onWinClosed = () => {
          if (layout.isConnected) return;          // anderes Fenster geschlossen
          _attached = false;                       // dieses Fenster ist weg → nicht mehr rendern
          if (up) up.onChange(null);               // UI-Callback abmelden
        };
        LexaOS.on('window-closed', _onWinClosed);
        // zusätzliche Absicherung falls das Event verpasst wird
        const _cleanupTimer = setInterval(() => {
          if (!layout.isConnected) { clearInterval(_cleanupTimer); _onWinClosed(); }
        }, 2000);
      },

      about() {
        const user = LexaInstaller.getUser();
        content.innerHTML = `
          <div class="settings-section-title">Über LexaOS</div>
          <div style="text-align:center;padding:18px 0 22px;">
            <div style="margin-bottom:10px;">${_svgLogo(58)}</div>
            <div style="font-size:22px;font-weight:200;letter-spacing:5px;margin-bottom:5px;">LexaOS</div>
            <div style="color:rgba(255,255,255,.4);font-size:13px;">Version 3.0.0 • Browser Edition</div>
          </div>
        `;
        content.appendChild(makeGroup([
          makeLabel('OS-Name',    'LexaOS 3.0'),
          makeLabel('Benutzer',   user.username || '—'),
          makeLabel('Sprache',    user.lang || 'Deutsch'),
          makeLabel('Tastatur',   user.keyboard || '—'),
          makeLabel('Plattform',  'Web Browser'),
          makeLabel('Engine',     'JavaScript ES2022'),
          makeLabel('Fenster',    LexaWM.getAllWindows().length + ' offen'),
        ]));

        content.appendChild(makeTitle('System zurücksetzen'));
        content.appendChild(makeGroup([
          (() => {
            const row = document.createElement('div');
            row.className = 'settings-row';
            row.style.flexDirection = 'column';
            row.style.gap = '10px';
            row.innerHTML = `
              <div>
                <div class="settings-row-label">LexaOS zurücksetzen</div>
                <div class="settings-row-sub">Alle Daten, Dateien, Apps und Einstellungen werden gelöscht. Der Installer wird beim nächsten Start erneut ausgeführt.</div>
              </div>`;
            const btn = document.createElement('button');
            btn.textContent = '⚠️ LexaOS zurücksetzen';
            btn.style.cssText = 'padding:9px 18px;background:rgba(255,69,58,.15);color:#ff453a;border:1px solid rgba(255,69,58,.3);border-radius:7px;font-size:13px;font-family:var(--font);cursor:pointer;align-self:flex-start;transition:background .12s;';
            btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,69,58,.25)');
            btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(255,69,58,.15)');
            btn.addEventListener('click', async () => {
              const ok = await LexaOS.dialog({
                icon: '⚠️', title: 'LexaOS zurücksetzen',
                message: 'Alle Daten werden dauerhaft gelöscht und LexaOS wird neu eingerichtet. Fortfahren?',
                buttons: [
                  { label: 'Zurücksetzen', cls: 'danger', value: true },
                  { label: 'Abbrechen', cls: 'secondary', value: false },
                ],
              });
              if (ok === true) {
                // Show fullscreen 60-second reset animation
                _showResetScreen();
              }
            });
            row.appendChild(btn);
            return row;
          })(),
        ]));
      },
    };

    /* ── RESET SCREEN (60 seconds with progress) ──────────── */
    function _showResetScreen() {
      const TOTAL = 60000;

      const screen = document.createElement('div');
      screen.style.cssText = [
        'position:fixed','inset:0','z-index:99998',
        'background:#000','color:white',
        'display:flex','flex-direction:column','align-items:center','justify-content:center','gap:0',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
      ].join(';');

      screen.innerHTML = `
        <div style="position:absolute;inset:0;overflow:hidden;">
          <div style="position:absolute;width:500px;height:500px;border-radius:50%;
            background:radial-gradient(circle,rgba(234,67,53,.15) 0%,transparent 70%);
            top:50%;left:50%;transform:translate(-50%,-50%);
            animation:reset-pulse 3s ease-in-out infinite;"></div>
        </div>

        <!-- Spinning ring -->
        <div style="position:relative;width:100px;height:100px;margin-bottom:36px;">
          <svg style="position:absolute;inset:0;animation:spin .9s linear infinite;" width="100" height="100" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,.08)" stroke-width="5"/>
            <path d="M50 6 A44 44 0 0 1 94 50" stroke="#ea4335" stroke-width="5" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:30px;">🔄</div>
        </div>

        <div style="font-size:26px;font-weight:300;margin-bottom:8px;">LexaOS wird zurückgesetzt</div>
        <div id="rst-msg" style="font-size:14px;color:rgba(255,255,255,.45);margin-bottom:36px;min-height:20px;">Daten werden gelöscht…</div>

        <div style="width:320px;display:flex;flex-direction:column;align-items:center;gap:10px;">
          <div style="width:100%;height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;">
            <div id="rst-bar" style="height:100%;width:0%;background:#ea4335;border-radius:2px;transition:width .5s ease;"></div>
          </div>
          <div id="rst-pct" style="font-size:12px;color:rgba(255,255,255,.28);">0%</div>
        </div>

        <style>
          @keyframes spin { to { transform:rotate(360deg); } }
          @keyframes reset-pulse { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.15)} }
        </style>
      `;

      document.body.appendChild(screen);

      const bar    = screen.querySelector('#rst-bar');
      const pctEl  = screen.querySelector('#rst-pct');
      const msgEl  = screen.querySelector('#rst-msg');
      const start  = Date.now();

      const msgs = [
        { at:  0, m: 'Benutzerdaten werden gelöscht…' },
        { at: 15, m: 'Dateisystem wird bereinigt…' },
        { at: 30, m: 'Einstellungen werden zurückgesetzt…' },
        { at: 50, m: 'System wird vorbereitet…' },
        { at: 75, m: 'Fast fertig…' },
        { at: 95, m: 'Wird neu gestartet…' },
      ];
      let msgIdx = 0;

      function tick() {
        const elapsed = Date.now() - start;
        const pct = Math.min(100, (elapsed / TOTAL) * 100);

        bar.style.width  = pct + '%';
        pctEl.textContent = Math.floor(pct) + '%';

        const nextMsg = msgs[msgIdx];
        if (nextMsg && pct >= nextMsg.at) {
          msgEl.style.opacity = '0';
          setTimeout(() => { if (screen.parentNode) { msgEl.textContent = nextMsg.m; msgEl.style.opacity = '1'; } }, 200);
          msgIdx++;
        }

        if (elapsed < TOTAL) {
          requestAnimationFrame(tick);
        } else {
          // Actually do the reset now
          LexaInstaller.factoryReset();
          pctEl.textContent = '100%';
          msgEl.textContent = 'Neu starten…';
          setTimeout(() => location.reload(), 600);
        }
      }

      // Perform data deletion in background during the animation
      setTimeout(() => LexaInstaller.factoryReset(), 2000);

      screen.style.opacity = '0';
      screen.style.transition = 'opacity .4s';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          screen.style.opacity = '1';
          setTimeout(() => requestAnimationFrame(tick), 50);
        });
      });
    }

    /* ── HELPERS ───────────────────────────────────────────── */
    function _svgLogo(size) {
      return `<svg width="${size}" height="${size}" viewBox="0 0 80 80" fill="none" style="display:inline-block;">
        <polygon points="40,4 76,62 4,62" stroke="url(#lg)" stroke-width="3.5" fill="rgba(10,132,255,0.12)"/>
        <circle cx="40" cy="44" r="8" fill="#0a84ff"/>
        <line x1="40" y1="20" x2="40" y2="36" stroke="#0a84ff" stroke-width="3" stroke-linecap="round"/>
        <defs><linearGradient id="lg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0a84ff"/><stop offset=".5" stop-color="#30d158"/><stop offset="1" stop-color="#bf5af2"/>
        </linearGradient></defs>
      </svg>`;
    }

    function makeTitle(t) {
      const el = document.createElement('div');
      el.style.cssText = 'font-size:11px;font-weight:700;color:rgba(255,255,255,.32);text-transform:uppercase;letter-spacing:.7px;margin:14px 0 6px;';
      el.textContent = t;
      return el;
    }

    function makeGroup(rows) {
      const el = document.createElement('div');
      el.className = 'settings-group';
      rows.forEach(r => el.appendChild(r));
      return el;
    }

    function makeToggle(label, sub, initial, cb) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      const tog = document.createElement('div');
      tog.className = 'toggle' + (initial ? ' on' : '');
      tog.addEventListener('click', () => { tog.classList.toggle('on'); cb(tog.classList.contains('on')); });
      row.innerHTML = `<div><div class="settings-row-label">${label}</div><div class="settings-row-sub">${sub}</div></div>`;
      row.appendChild(tog);
      return row;
    }

    function makeLabel(label, value) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      row.innerHTML = `<div class="settings-row-label">${label}</div><div style="color:rgba(255,255,255,.38);font-size:13px;">${value}</div>`;
      return row;
    }

    function makeSlider(label, min, max, value, cb) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      row.style.flexDirection = 'column'; row.style.gap = '8px';
      const valEl = document.createElement('span');
      valEl.textContent = value + '%';
      valEl.style.color = 'rgba(255,255,255,.4)';
      row.innerHTML = `<div style="display:flex;justify-content:space-between;"><div class="settings-row-label">${label}</div></div><input type="range" min="${min}" max="${max}" value="${value}" style="width:100%;accent-color:#0a84ff;" />`;
      row.querySelector('div').appendChild(valEl);
      row.querySelector('input').addEventListener('input', e => { valEl.textContent = e.target.value+'%'; cb(parseInt(e.target.value)); });
      return row;
    }

    function makeSelect(label, options, current, cb) {
      const row = document.createElement('div'); row.className = 'settings-row';
      const sel = document.createElement('select');
      sel.style.cssText = 'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:white;padding:4px 8px;font-size:12px;font-family:var(--font);outline:none;cursor:pointer;';
      options.forEach(o => { const opt=document.createElement('option'); opt.value=o; opt.textContent=o; opt.style.background='#1c1c28'; if(o===current)opt.selected=true; sel.appendChild(opt); });
      sel.addEventListener('change', () => cb(sel.value));
      row.innerHTML = `<div class="settings-row-label">${label}</div>`;
      row.appendChild(sel); return row;
    }

    /* ── WIRING ────────────────────────────────────────────── */
    sidebar.querySelectorAll('.settings-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        sidebar.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        content.innerHTML = '';
        render[item.dataset.page]?.();
      });
    });

    layout.appendChild(sidebar);
    layout.appendChild(content);

    LexaWM.createWindow({
      title:'Einstellungen', icon:'⚙️', content:layout,
      width:700, height:520, appId:'settings',
    });

    // Render initial page
    render[page]?.();
  }

  window.LexaApps = window.LexaApps || {};
  LexaApps.openSettings = openSettings;

  /* ── UPDATER (task_0004) ────────────────────────────────────
     Prüft alle 30 Minuten https://github.com/Max762342/LexaUpdates
     auf neue Update-Ordner (höchste Nummer gewinnt).
     „Jetzt prüfen“ prüft sofort (30s-Abklingzeit).
     Der Ordner wird heruntergeladen und die Systemdaten
     (update.json → localStorage-Schlüssel) werden angewendet. */
  const Updater = (function () {
    const REPO_API  = 'https://api.github.com/repos/Max762342/LexaUpdates/contents/';
    const REPO_RAW  = 'https://raw.githubusercontent.com/Max762342/LexaUpdates/main/';
    const INSTALLED_KEY = 'lexaos_update_version';
    const DATA_FILE = 'update.json';

    let _latest    = null;   // { num, name, url, tree }
    let _installed = null;   // zuletzt installierte Update-Nummer
    let _status    = 'idle'; // idle | checking | available | downloading | applying | up-to-date | error
    let _busy      = false;
    let _tickTimer = null;
    let _onChange  = null;
    let _errorStreak = 0;    // aufeinanderfolgende Check-Fehler → Backoff
    let _resumeAt  = 0;      // Timestamp: vorher kein erneuter Check (Rate-Limit-Schutz)
    let _updateNotified = false;   // nur einmal pro Update benachrichtigen

    try {
      const stored = localStorage.getItem(INSTALLED_KEY);
      _installed = stored !== null ? parseFloat(stored) : null;   // null = nicht installiert
    } catch {}

    /* extrahiert die erste Zahl aus einem Ordnernamen → „3“ aus "3" / "Update 3" / "v3.2" */
    function _numOf(name) {
      const m = String(name).match(/\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : NaN;
    }

    /* Nur Update-Ordner (type=dir) mit Nummer; höchste Nummer gewinnt.
       Unterstützt sowohl direkte Ordner (Update1) als auch verschachtelte
       (UpdateLexaOS/Update1). */
    function _pickLatest(list) {
      let best = null;
      list.forEach(e => {
        if (e.type !== 'dir') return;
        const num = _numOf(e.name);
        if (isNaN(num)) return;
        if (!best || num > best.num) best = { num, name: e.name, url: e.url };
      });
      return best;
    }

    /* Sucht auch eine Ebene tiefer (z.B. UpdateLexaOS/Update1) */
    async function _findDeep(list) {
      let best = _pickLatest(list);
      if (best) return best;
      for (const e of list) {
        if (e.type !== 'dir') continue;
        if (!isNaN(_numOf(e.name))) continue;   // eigener Update-Ordner → ignorieren
        try {
          const sub = await _listJSON(e.url);
          if (Array.isArray(sub)) {
            const b = _pickLatest(sub);
            if (b && (!best || b.num > best.num)) best = b;
          }
        } catch {}
      }
      return best;
    }

    async function _listJSON(url) {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }

    async function _text(url) {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }

    /* rekursiver Download eines GitHub-Ordners (tree via contents-API) */
    async function _downloadTree(dirUrl) {
      const entries = await _listJSON(dirUrl);
      const out = [];
      for (const e of entries) {
        if (e.type === 'dir') {
          out.push({ path: e.path, dir: true, children: await _downloadTree(e.url) });
        } else {
          out.push({ path: e.path, dir: false, content: await _text(encodeURI(REPO_RAW + e.path)) });
        }
      }
      return out;
    }

    /* wendet update.json (Schlüssel → localStorage-Wert) an */
    function _applyData(tree) {
      const file = tree.find(f => !f.dir && f.path.split('/').pop().toLowerCase() === DATA_FILE);
      if (!file) return 0;
      let data;
      try { data = JSON.parse(file.content); } catch { throw new Error(DATA_FILE + ' ist kein gültiges JSON'); }
      if (!data || typeof data !== 'object') throw new Error(DATA_FILE + ' ist leer');
      let n = 0;
      Object.keys(data).forEach(k => {
        if (k === INSTALLED_KEY) return;   // NIEMALS update.json die Install-Nummer setzen lassen
        const v = data[k];
        try {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
          n++;
        } catch {}
      });
      return n;
    }

    async function check(force) {
      if (_busy || _status === 'downloading' || _status === 'applying') return;
      if (!force && Date.now() < _resumeAt) return;   // Backoff nach Fehlern → kein Polling im Fehlerfall
      if (force) { _resumeAt = 0; _errorStreak = 0; }  // manueller Check ignoriert Backoff
      _status = 'checking';
      _notify();
      try {
        const list = await _listJSON(REPO_API);
        const best = await _findDeep(Array.isArray(list) ? list : []);
        _errorStreak = 0;   // Erfolg → Backoff zurücksetzen
        if (!best) {
          _latest = null;
          _status = 'idle';
        } else if (_installed !== null && best.num <= _installed) {
          // Update wurde bereits heruntergeladen → nicht anzeigen
          _latest = null;
          _status = 'up-to-date';
        } else {
          _latest = best;
          _status = 'available';
          // Benachrichtigung sofort anzeigen: "Update verfügbar – Jetzt herunterladen"
          if (!_updateNotified) {
            _updateNotified = true;
            LexaOS.toast('Update verfügbar', 'Neues Update: ' + best.name + ' – Jetzt herunterladen', '⬆️', 10000);
          }
        }
      } catch (e) {
        if (_status === 'checking') _status = 'error';
        /* nach 3 Fehlern in Folge 60s pausieren (GitHub Rate-Limit: 60 req/h unauthentifiziert) */
        _errorStreak++;
        if (_errorStreak >= 3) _resumeAt = Date.now() + 60000;
      }
      _notify();
    }

    async function download() {
      if (_busy || !_latest || _status === 'downloading' || _status === 'applying') return;
      _busy = true;
      _status = 'downloading';
      _notify();
      try {
        const tree = await _downloadTree(_latest.url);
        _status = 'applying';
        _notify();
        const applied = _applyData(tree);
        const files = _applySystemFiles(tree);
        _installed = _latest.num;
        try { localStorage.setItem(INSTALLED_KEY, String(_installed)); } catch {}
        _latest = null;   // Update aus der Liste entfernen (wurde installiert)
        _updateNotified = false;
        _status = 'up-to-date';
        _notify();
        LexaOS.toast('Update', `Update installiert (${applied} Systemdaten, ${files} Dateien übernommen)`, '⬆️');
      } catch (e) {
        _status = 'error';
        _notify();
        LexaOS.toast('Update', 'Fehler: ' + (e && e.message ? e.message : 'Download fehlgeschlagen'), '⚠️');
      }
      _busy = false;
    }

    /* legt heruntergeladene System-Dateien ins LexaFS
       (Unterordner-Pfade werden als LexaFS-Ordner angelegt, Dateien mit passendem parentId abgelegt) */
    function _applySystemFiles(tree) {
      /* Update-Dateien NICHT auf dem Desktop ablegen — in /System/Updates */
      let root = null;
      if (window.LexaFS) {
        const sysFolder = LexaFS.findByName('System', LexaFS.getRootId());
        const sysId = sysFolder ? sysFolder.id : LexaFS.getRootId();
        let updFolder = LexaFS.findByName('Updates', sysId);
        if (!updFolder || !updFolder.isFolder) {
          updFolder = LexaFS.createFile({ name: 'Updates', isFolder: true, content: '', parentId: sysId });
        }
        root = updFolder ? updFolder.id : LexaFS.getRootId();
      }
      if (root === null) return 0;

      let n = 0;
      (function walk(list, parentId) {
        list.forEach(f => {
          const name = f.path.split('/').pop();
          if (f.dir) {
            /* Ordner pro Pfad-Ebene anlegen (oder vorhandenen wiederverwenden) */
            let folder = LexaFS.findByName(name, parentId);
            if (!folder || !folder.isFolder) {
              folder = LexaFS.createFile({ name, isFolder: true, content: '', parentId });
            }
            if (folder) walk(f.children || [], folder.id);
          } else {
            if (name.toLowerCase() === DATA_FILE) return;   // update.json ist die Datenquelle, keine Ablage
            const existing = LexaFS.findByName(name, parentId);
            if (existing && !existing.isFolder) {
              LexaFS.updateContent(existing.id, f.content);
            } else {
              LexaFS.createFile({ name, isFolder: false, content: f.content, parentId });
            }
            n++;
          }
        });
      })(tree, root);

      if (n > 0 && window.LexaDesktop) LexaDesktop.refresh();
      return n;
    }

    function _notify() { if (_typeofFn(_onChange)) { try { _onChange(); } catch {} } }
    function _typeofFn(f) { return typeof f === 'function'; }

    /* 30-Minuten-Intervall (BrowserOS-Standard); läuft im Hintergrund ab Boot.
       „Jetzt prüfen“ prüft sofort, mit 30-Sekunden-Abklingzeit
       zwischen manuellen Checks. */
    const AUTO_INTERVAL = 30 * 60 * 1000;   // 30 Minuten
    const MANUAL_COOLDOWN = 30 * 1000;      // 30 Sekunden Abklingzeit für „Jetzt prüfen“
    let _lastManualCheck = 0;

    function _startTick() {
      if (_tickTimer) return;
      _tickTimer = setInterval(check, AUTO_INTERVAL);   // Hintergrund-Polling alle 30 Min
      check();   // erster Check direkt beim Start
    }

    /* Manueller Check mit 30s-Abklingzeit; gibt true zurück wenn ausgeführt */
    function checkNow() {
      check(true);   // jederzeit prüfen — keine Abklingzeit
      return true;
    }

    function stop() {
      if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
    }

    return {
      get latest()    { return _latest; },
      get installed() { return _installed; },
      get status()    { return _status; },
      check: checkNow, download, stop, _startTick,   // „check“ = manueller Check (30s-Abklingzeit)
      onChange(cb)    { _onChange = cb; },
    };
  })();

  window.LexaUpdater = Updater;
  Updater._startTick();   // Hintergrund-Polling ab Boot (alle 30 Minuten)

})();

/* ── Global Taskbar Position Functions ─────────────────────── */
window._applyTaskbarPos = function(position, style, size) {
  const taskbar = document.getElementById('taskbar');
  const desktop = document.getElementById('desktop-area');
  const trash   = document.getElementById('trash-zone');
  const wins    = document.getElementById('windows-container');
  if (!taskbar) return;

  const h = size==='small' ? '38px' : size==='large' ? '60px' : '48px';
  document.documentElement.style.setProperty('--taskbar-h', h);

  // Save settings
  const saved = { position, style, size };
  try { localStorage.setItem('lexaos_taskbar_pos', JSON.stringify(saved)); } catch {}

  // Remove all position classes
  taskbar.classList.remove('taskbar-bottom','taskbar-left','taskbar-right','taskbar-macos','taskbar-classic');
  document.body.classList.remove('tb-pos-bottom','tb-pos-left','tb-pos-right');

  // Apply new position
  if (position === 'left') {
    taskbar.style.cssText = `position:absolute;left:0;top:0;bottom:0;right:auto;width:${h};height:auto;flex-direction:column;padding:6px 0;border-right:1px solid rgba(255,255,255,.08);border-top:none;`;
    if (desktop) desktop.style.cssText = `position:absolute;top:0;left:${h};right:0;bottom:0;padding:16px;overflow:hidden;`;
    if (wins)    wins.style.cssText    = `position:absolute;top:0;left:${h};right:0;bottom:0;`;
    if (trash)   trash.style.cssText   = `position:absolute;bottom:10px;left:50%;transform:translateX(-50%);right:auto;`;
  } else if (position === 'right') {
    taskbar.style.cssText = `position:absolute;right:0;top:0;bottom:0;left:auto;width:${h};height:auto;flex-direction:column;padding:6px 0;border-left:1px solid rgba(255,255,255,.08);border-top:none;`;
    if (desktop) desktop.style.cssText = `position:absolute;top:0;left:0;right:${h};bottom:0;padding:16px;overflow:hidden;`;
    if (wins)    wins.style.cssText    = `position:absolute;top:0;left:0;right:${h};bottom:0;`;
    if (trash)   trash.style.cssText   = `position:absolute;bottom:10px;right:calc(${h} + 8px);left:auto;`;
  } else {
    // Bottom (default)
    taskbar.style.cssText = `position:absolute;bottom:0;left:0;right:0;top:auto;width:auto;height:${h};flex-direction:row;padding:0 6px;border-top:1px solid rgba(255,255,255,.08);border-left:none;`;
    if (desktop) desktop.style.cssText = `position:absolute;top:0;left:0;right:0;bottom:${h};padding:16px;overflow:hidden;`;
    if (wins)    wins.style.cssText    = `position:absolute;top:0;left:0;right:0;bottom:${h};`;
    if (trash)   trash.style.cssText   = `position:absolute;bottom:calc(${h} + 6px);right:10px;left:auto;`;
  }

  // Apply style (macOS adds a menu bar on top)
  _applyDesktopStyle(style, position, h);

  LexaOS.toast('Einstellungen', `Taskleiste: ${position==='bottom'?'Unten':position==='left'?'Links':'Rechts'}`, '📌');
};

window._applyDesktopStyle = function(style, position, taskbarH) {
  // Remove existing style elements
  document.getElementById('_lexa_style_override')?.remove();

  const css = document.createElement('style');
  css.id = '_lexa_style_override';

  if (style === 'macos' && position === 'bottom') {
    // macOS: menu bar at top, dock at bottom
    css.textContent = `
      #desktop { padding-top: 26px; }
      /* macOS menu bar */
      #desktop::before {
        content: '';
        position: fixed; top: 0; left: 0; right: 0; height: 26px;
        background: rgba(20,20,26,0.88);
        backdrop-filter: blur(20px) saturate(200%);
        -webkit-backdrop-filter: blur(20px) saturate(200%);
        border-bottom: 1px solid rgba(255,255,255,.08);
        z-index: 4999;
      }
      .taskbar {
        background: rgba(30,30,40,0.72) !important;
        border-radius: 18px !important;
        margin: 0 auto !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        width: auto !important;
        max-width: 600px !important;
        bottom: 8px !important;
        padding: 4px 12px !important;
        border: 1px solid rgba(255,255,255,.15) !important;
        box-shadow: 0 8px 32px rgba(0,0,0,.5) !important;
      }
      .tb-pin-btn, .taskbar-app-btn {
        border-radius: 12px !important;
      }
      .taskbar-center { gap: 4px !important; }
      .desktop-area {
        bottom: calc(${taskbarH} + 16px) !important;
      }
      .trash-zone {
        bottom: calc(${taskbarH} + 14px) !important;
        right: 14px !important;
      }
      .start-menu {
        bottom: calc(${taskbarH} + 16px) !important;
      }
      .quick-settings {
        bottom: calc(${taskbarH} + 16px) !important;
      }
      .notification-center {
        bottom: calc(${taskbarH} + 16px) !important;
      }
    `;
  } else if (style === 'classic') {
    css.textContent = `
      .taskbar {
        background: rgba(12,12,18,0.95) !important;
        border-top: 2px solid rgba(255,255,255,.05) !important;
      }
      .taskbar-center { justify-content: flex-start !important; }
      .start-btn {
        background: linear-gradient(135deg,#0050a0,#0070c0) !important;
        border-radius: 0 4px 4px 0 !important;
        padding: 0 14px !important;
        width: auto !important;
      }
      .start-btn::after { content: 'Start'; font-size: 12px; font-weight: 700; color: white; }
      .start-icon { display: none !important; }
    `;
  }

  document.head.appendChild(css);
};

window._applyAutoHide = function(enabled) {
  const taskbar = document.getElementById('taskbar');
  if (!taskbar) return;
  if (enabled) {
    taskbar.style.transition = 'transform .25s ease';
    const hide = () => taskbar.style.transform = 'translateY(100%)';
    const show = () => taskbar.style.transform = 'translateY(0)';
    document.addEventListener('mousemove', e => {
      if (e.clientY > window.innerHeight - 60) show(); else hide();
    });
  } else {
    taskbar.style.transform = '';
    taskbar.style.transition = '';
  }
};

window._applyTaskbarColor = function(color) {
  const taskbar = document.getElementById('taskbar');
  if (!taskbar) return;
  taskbar.style.background = color;
  // Also apply to start menu and panels for consistency
  const startMenu = document.getElementById('start-menu');
  if (startMenu) startMenu.style.background = color;
  const quickSettings = document.getElementById('quick-settings');
  if (quickSettings) quickSettings.style.background = color;
  const notifCenter = document.getElementById('notification-center');
  if (notifCenter) notifCenter.style.background = color;
};

// Apply saved taskbar position on load
(function() {
  try {
    const saved = JSON.parse(localStorage.getItem('lexaos_taskbar_pos')||'{}');
    if (saved.position || saved.style || saved.color) {
      setTimeout(() => {
        window._applyTaskbarPos?.(saved.position||'bottom', saved.style||'windows11', saved.size||'normal');
        if (saved.autohide) window._applyAutoHide?.(true);
        if (saved.color) window._applyTaskbarColor?.(saved.color);
      }, 600); // after boot
    }
  } catch {}
})();
