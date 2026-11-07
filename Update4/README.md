# LexaOS Update-Paket – Update4

## Inhalt

Dieses Update behebt den **Drag & Drop Bug** auf dem Desktop.

### Was war kaputt?

- **Doppelte Event-Bindung**: Sowohl der Delegations-`mousedown` als auch `_bindDrag`'s eigener `mousedown`-Handler feuerten → doppeltes Drag-Verhalten
- **Text-Auswahl während Drag**: Browser hat Text ausgewählt statt Icon zu bewegen
- **Ghost-Element abgeschnitten**: z-index zu niedrig, wurde von anderen Elementen überdeckt
- **Legacy-Aufruf**: `_bindDrag(el, item)` in `_bindIcon` hat Drag doppelt gebunden

### Was wurde gefixt?

1. **Doppelte Bindung entfernt** — Drag wird jetzt nur noch über Event-Delegation gestartet (`_startDrag`)
2. **`e.preventDefault()`** verhindert native Text-Auswahl und Browser-Drag
3. **`user-select:none` + `cursor:move`** während des Drags
4. **`selectstart`-Event blockiert** auf Desktop-Icons
5. **Ghost z-index 10000** — nicht mehr abgeschnitten
6. **Legacy `_bindDrag`-Aufruf entfernt** — Delegation übernimmt

### Installation

1. `Update4`-Ordner auf GitHub hochladen nach `Max762342/LexaUpdates`
2. LexaOS → Einstellungen → Updates
3. „Update herunterladen" drücken

## Versions-Info

- **Update-Nummer:** 4
- **LexaOS-Version:** 3.4.0
- **Datum:** 2026-11-07