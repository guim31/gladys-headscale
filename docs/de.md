# Headscale

Verfolge die Geräte deines [Headscale](https://headscale.net)-Servers in
Gladys: ein Gerät pro Maschine (online oder nicht, zuletzt gesehen, Tage bis
zum Ablauf ihres Schlüssels, angekündigte und aktivierte Routen), ein Gerät
„Headscale“ mit den Geräten online und insgesamt, ein Dashboard-Widget und
Szenen-Auslöser, wenn ein Gerät offline geht, zurückkommt oder sein Schlüssel
bald abläuft.

Headscale ist der freie, selbst gehostete Koordinationsserver, der mit den
Tailscale-Clients kompatibel ist. Diese Integration richtet sich an alle, die
**ihren eigenen Headscale-Server betreiben**; den Cloud-Dienst von Tailscale
liest sie nicht. Getestet wurde sie mit echten Headscale-Servern 0.22.3, 0.23.0, 0.26.1
und 0.29.5 in Docker, mit registrierten und danach gestoppten
Tailscale-Clients. Rückmeldungen sind im
[Gladys-Forum](https://community.gladysassistant.com) oder in den
[Issues](https://github.com/guim31/gladys-headscale/issues) willkommen.

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Einen Headscale-Server, Version 0.22 oder neuer, den Gladys erreicht: seine
  öffentliche Adresse (`server_url`) oder seine Adresse und sein Port in deinem
  Netzwerk (standardmäßig 8080).
- Einen API-Schlüssel dieses Servers. Gladys liest nur und ändert nichts an
  Headscale.

## Einrichtung

1. Erstelle auf dem Headscale-Server einen API-Schlüssel (siehe unten) und
   kopiere ihn: Er wird nur einmal angezeigt.
2. Installiere die Integration in Gladys und öffne dann ihre Seite
   **Konfiguration**.
3. **Serveradresse**: die `server_url` von Headscale
   (`https://headscale.example.com`) oder seine IP-Adresse und sein Port
   (`192.168.1.2:8080`). Eine Adresse ohne `http://` oder `https://` wird als
   http gelesen, mit Port 8080, wenn keiner angegeben ist.
4. **API-Schlüssel**: der in Schritt 1 erstellte Schlüssel.
5. **Selbstsigniertes Zertifikat akzeptieren**: nur für eine https-Adresse,
   deren Zertifikat nicht von einer bekannten Stelle signiert ist.
6. **Zu verfolgende Benutzer**: Headscale-Benutzernamen, durch Kommas getrennt.
   Leer: die Geräte aller Benutzer.
7. **IP-Adressen veröffentlichen**: standardmäßig aus. Eingeschaltet erhält
   jedes Gerät eine Funktion **IP-Adressen** mit seinen Tailnet-Adressen.
8. **Aktualisierungsintervall**: standardmäßig 1 Minute. Jede Abfrage kostet
   eine Anfrage (zwei vor Headscale 0.26).
9. **Sprache der Namen**: die Sprache der Funktionsnamen und der Daten,
   standardmäßig Französisch.
10. Speichere und klicke dann auf **Verbindung testen**: Der Test zeigt, wie viele
    Geräte verfolgt werden und online sind. Die Geräte erscheinen danach im Tab
    **Entdecken** der Integration: Füge die gewünschten hinzu.

### Der API-Schlüssel

Auf dem Headscale-Server (oder in seinem Container):

```sh
headscale apikeys create --expiration 365d
```

Ohne `--expiration` läuft der Schlüssel nach 90 Tagen ab, und Gladys zeigt dann
„API-Schlüssel abgelehnt“. `headscale apikeys list` listet die Schlüssel und
ihren Ablauf auf, `headscale apikeys expire --prefix <Präfix>` widerruft einen.
Der Schlüssel gibt vollen Zugriff auf die Headscale-API: Behalte ihn für dich.
Die Integration liest nur die Liste der Geräte (und der Routen vor 0.26).

### Welche Adresse?

Gladys ruft Headscale aus ihrem Docker-Container auf. Läuft Headscale auf
demselben Rechner, gib die Adresse des Rechners in deinem Netzwerk an, nie
`127.0.0.1`. Hinter einem Reverse Proxy funktioniert auch die öffentliche
`https://`-Adresse.

## Die Geräte

**Headscale** (ein Gerät):

| Funktion      | Was sie zeigt                                    |
| ------------- | ------------------------------------------------ |
| Geräte online | Geräte, die gerade mit dem Server verbunden sind |
| Geräte        | Verfolgte Geräte (nach dem Benutzerfilter)       |

**Jedes Gerät** (sein Name in Headscale, gefolgt von `(Headscale)`):

| Funktion              | Was sie zeigt                                                                       |
| --------------------- | ----------------------------------------------------------------------------------- |
| Online                | Ja, solange das Gerät seine Verbindung zum Server hält                              |
| Zuletzt gesehen       | Wann es offline ging; online, wann es sich verbunden hat                            |
| Schlüssel läuft ab in | Tage bis zum Ablauf des Geräteschlüssels, 0 nach dem Ablauf                         |
| Angekündigte Routen   | Subnetz-Routen, die das Gerät ankündigt (der Exit-Node zählt als eine)              |
| Aktivierte Routen     | Davon die auf dem Server genehmigten                                                |
| IP-Adressen           | Seine Tailnet-Adressen, nur mit **IP-Adressen veröffentlichen** (standardmäßig aus) |

**Schlüssel läuft ab in** gibt es nur für ein Gerät, dessen Schlüssel abläuft:
Headscale kann den Ablauf pro Gerät deaktivieren
(`headscale nodes expire --disable` in neueren Versionen), und Geräte mit Tags
haben oft keinen. Läuft ein Schlüssel später doch ab, schlägt Gladys im Tab
Entdecken **Aktualisieren** vor. Ein Gerät, das sich abmeldet (Logout), erhält
in Headscale einen abgelaufenen Schlüssel: Es zeigt 0.

Ein Gerät wird über seine Headscale-ID erkannt: Löschst du es in Headscale und
registrierst es neu, entsteht in Gladys ein neues Gerät.

## Dashboard

Das Widget **Headscale-Geräte** zeigt die Geräte online und insgesamt, dann
eine Zeile pro Gerät: zuerst die, deren Schlüssel innerhalb von 7 Tagen abläuft
(orange, rot nach dem Ablauf), dann die Geräte online, dann die übrigen mit dem
Zeitpunkt, an dem sie zuletzt gesehen wurden.

## Szenen

### Auslöser

- **Headscale-Gerät offline**: Ein Gerät hat den Server verlassen
  (ausgeschaltet, außer Reichweite, abgemeldet).
- **Headscale-Gerät wieder online**: Ein Gerät hat sich wieder verbunden.
- **Geräteschlüssel läuft bald ab**: Der Schlüssel eines Geräts läuft in 30, 14,
  7, 3 oder 1 Tag(en) ab oder ist gerade abgelaufen. Sein Filter
  **Verbleibende Tage (leer: beliebig)** wählt eine dieser Stufen.

Jeder Auslöser lässt sich auf ein Gerät (**Gerät (leer: beliebig)**) oder auf
die Geräte eines Benutzers (**Headscale-Benutzer (leer: beliebig)**, der genaue
Name) beschränken. Die Auslöser liefern die Variablen **Name des Geräts** und
**Headscale-Benutzer**, für den Schlüssel dazu **Verbleibende Tage** und
**Ablaufdatum**. Bei der ersten Abfrage nach einem Start oder einer Änderung
der Konfiguration wird kein Ereignis gesendet, auch nicht für ein gerade
aufgetauchtes Gerät: Der vorherige Zustand ist unbekannt. Die Stufen des
Schlüssels werden erkannt, während die Integration läuft: Eine Stufe, die
überschritten wurde, während sie gestoppt war, wird nicht nachträglich
gesendet.

### Szenen-Ideen

- Wenn der Schlüssel eines Geräts in 7 Tagen abläuft, schick dir eine Nachricht
  mit seinem **Name des Geräts** und dem **Ablaufdatum**, um ihn rechtzeitig zu
  erneuern.
- Wenn das entfernte NAS mit deinen Backups offline geht, schick eine
  Nachricht.
- Wenn das Handy eines Familienmitglieds abends wieder im Tailnet online ist,
  schalte das Licht im Eingang ein.

## Fehlerbehebung

- **„API-Schlüssel abgelehnt“**: Der Schlüssel ist falsch kopiert, widerrufen
  oder abgelaufen (standardmäßig nach 90 Tagen): Erstelle einen neuen.
- **„Headscale antwortet nicht“**: Prüfe Adresse und Port und ob Gladys sie
  erreicht (Firewall, `127.0.0.1` aus einem Container).
- **„Zertifikat abgelehnt“**: Das https-Zertifikat ist nicht von einer
  bekannten Stelle signiert. Wenn es deines ist, aktiviere
  **Selbstsigniertes Zertifikat akzeptieren**.
- **„Keine Headscale-API unter dieser Adresse“**: Die Adresse führt zu einem
  anderen Dienst (Anmeldeseite des Reverse Proxys, Metrik-Port…) oder zu einem
  Headscale vor 0.22.
- **Kein Gerät im Tab Entdecken**: Klicke auf **Verbindung testen**; gehört
  kein Gerät zu den Benutzern der Konfiguration, prüfe ihre Namen (oder leere
  das Feld).

## Grenzen

- Ein Headscale-Server pro Installation der Integration.
- Nur Lesen: Die Integration genehmigt keine Routen, erneuert keine Schlüssel
  und löscht keine Geräte. Das bleibt Sache des Befehls `headscale` oder deiner
  Weboberfläche.
- **Online** ist, was Headscale meldet: Ein Gerät ist online, solange seine
  Verbindung zum Server offen ist; über den Verkehr zwischen Geräten sagt das
  nichts.
- Die Stufen von **Geräteschlüssel läuft bald ab** werden nicht gespeichert:
  Eine Stufe, die überschritten wurde, während die Integration gestoppt war,
  geht verloren.
- Nicht verbunden mit dem Headscale-Projekt oder mit Tailscale Inc. Tailscale
  ist eine Marke von Tailscale Inc.
