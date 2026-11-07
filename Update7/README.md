# LexaOS Update-Paket – Update7

## Inhalt

Dieses Update bringt **Klangqualitäts-Einstellungen** in die Systemsteuerung und behebt **Drag & Drop** und die **Update-Logik**.

### 1. 🔊 NEU: Klangqualität (Systemsteuerung → Ton)

**Nicht vorinstalliert** — erst nach Download dieses Updates verfügbar!

| Einstellung | Optionen |
|---|---|
| **Audio-Qualität** | Niedrig (22 kHz, 8 Bit) · Mittel (44 kHz, 16 Bit) · Hoch (48 kHz, 24 Bit) · Verlustfrei (96 kHz, 32 Bit) |
| **Sample-Rate** | 22.05 kHz · 44.1 kHz · 48 kHz · 96 kHz |
| **Bit-Tiefe** | 8 Bit · 16 Bit · 24 Bit · 32 Bit |
| **Rauschunterdrückung** | An/Aus |
| **Equalizer** | An/Aus |
| **Bass-Verstärkung** | −10 bis +10 |
| **Höhen-Verstärkung** | −10 bis +10 |

### 2. 🖱️ Drag & Drop repariert

- `e.preventDefault()` im `mousedown` verhindert native Browser-Drag/Selection
- Click-Verhalten wird manuell in `onUp` verarbeitet
- Ghost-Element, Grid-Snap, Papierkorb funktionieren zuverlässig

### 3. 🔄 Update-Logik korrigiert

- `update.json` kann **nicht mehr** `lexaos_update_version` setzen
- Update wird **nur nach echtem Download** als installiert markiert
- `_applyData` überspringt `INSTALLED_KEY` automatisch

## Installation

1. `Update7`-Ordner auf GitHub hochladen nach `Max762342/LexaUpdates`
2. LexaOS → Einstellungen → Updates
3. „Update herunterladen" drücken
4. **Danach** erscheint „Klangqualität" in Systemsteuerung → Ton

## Versions-Info

- **Update-Nummer:** 7
- **LexaOS-Version:** 3.7.0
- **Datum:** 2026-11-07