# CozyQuiz Frontend Deployment (Vercel)

## Quick Deploy
1. Push nach GitHub (erledigt).
2. Vercel -> New Project -> `cozyquiz-frontend` auswählen.
3. Einstellungen prüfen:
   - Framework: Vite (Auto)
   - Build Command: `npm run build`
   - Output: `dist`
4. Environment Variable anlegen:
   - Name: `VITE_SOCKET_URL`
   - Value: `https://api.cozyquiz.app`
   - Targets: Production + Preview
5. Deploy klicken.

## Root-Monorepo Fall
Falls du später das Root-Repo (`cozyquizapp`) verwendest:
- Beim Import unter "Advanced" -> Root Directory: `frontend`

## Lokale Entwicklung
```
npm install
npm run dev
```

## Socket / Backend URL Logik
Reihenfolge in `src/socket.js` und `src/socket.v2.js`:
1. Wenn `VITE_SOCKET_URL` gesetzt und kein trycloudflare Preview → wird benutzt.
2. Wenn lokal (`localhost`, `127.*`, `192.168.*`) → `http://localhost:3001`.
3. Sonst Fallback: `https://api.cozyquiz.app`.

## Änderst du später die API-Domain?
Einfach in Vercel die Variable `VITE_SOCKET_URL` anpassen und neu deployen (oder Re-Deploy auslösen).

## Häufige Probleme
| Problem | Lösung |
|---------|--------|
| Weißer Bildschirm | Prüfen, ob Build ok: `npm run build` lokal. Console auf Fehler checken. |
| Socket verbindet nicht | Network-Tab -> WebSocket. Prüfen CORS / HTTPS / richtige Domain. |
| 404 bei tiefer Route | Vercel kümmert sich (Single Page App), sonst `vite.config.js` unverändert lassen. |
| Mixed Content (HTTP/HTTPS) | Backend unbedingt über HTTPS bereitstellen. |

## Optional Performance
- Bilder bereits optimiert (Script `npm run optimize:images`).
- Bei neuen großen Images: Script erneut ausführen vor `git commit`.

## Redeploy auslösen
- Neue Commits auf `main` → auto.
- Oder Vercel UI: "Deploy" → "Redeploy".

## Nächste Schritte
- Custom Domain verbinden (Project Settings -> Domains).
- Analytics (optional) aktivieren.
- Preview Deployments für Feature-Branches nutzen.

