# ASSAR Optical ERP

An optical shop management system (نظام إدارة البصريات) built with React + Vite + Firebase.

## Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite
- **Backend/DB**: Firebase Firestore (project: `assar-optical-erp`)
- **Auth**: Firebase Auth (Google + anonymous)
- **AI**: Google Gemini (`@google/genai`)
- **Mobile**: Capacitor (Android)

## Running the app

```bash
npm run dev
```

Runs on port 5000. The workflow "Start application" is pre-configured.

## Required secrets

| Secret | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini AI features |

Firebase credentials are embedded in `firebase-applet-config.json`.

## Project structure

- `src/components/` — UI components (Dashboard, Invoices, Transactions, etc.)
- `src/services/` — Business logic (auth, db, financial engine, sync)
- `src/lib/` — Utilities
- `src/firebase.ts` — Firebase initialization
- `android/` — Capacitor Android project

## User preferences

- Keep existing project structure and stack
