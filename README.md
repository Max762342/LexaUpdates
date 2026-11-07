# LexaUpdates

Hier werden die Update-Pakete für LexaOS bereitgestellt.

## Ordner-Struktur

```
UpdateLexaOS/
  Update1/          ← Update-Paket Nr. 1 (höchste Nummer gewinnt)
    update.json     ← Update-Metadaten & Systemdaten
    systemcontrol.js ← Neue App
    README.md       ← Beschreibung
  Update2/          ← (künftige Updates)
  Update3/
  ...
```

## So funktioniert's

1. **LexaOS prüft automatisch** alle 30 Minuten dieses Repository auf neue Update-Ordner
2. Es wird immer der **Ordner mit der höchsten Nummer** genommen (Update1, Update2, …)
3. In **Einstellungen → Updates** kann man auf „Jetzt prüfen“ drücken (sofort, mit 30s Abklingzeit)
4. Mit **„Update herunterladen“** wird das Paket geladen und die Systemdaten werden angewendet
5. Neue Dateien werden ins LexaFS gelegt (mit echter Ordnerstruktur)

## Neues Update erstellen

1. Neuen Ordner anlegen: `UpdateLexaOS/Update<N>/`
2. `update.json` mit Metadaten erstellen (siehe Update1 als Vorlage)
3. Neue Dateien/Apps in den Ordner legen
4. Auf GitHub hochladen

## Aktuelle Updates

| Nr. | Version | Titel | Datum |
|-----|---------|-------|-------|
| 1 | 3.1.0 | Systemsteuerung & Geräte-Einstellungen | 2026-11-07 |
