# Lingua AI — CEFR & IELTS Preparation

Lingua AI is a Node.js + vanilla HTML/CSS/JavaScript learning platform.

## Features
- Public learning pages: Reading, Listening, Writing AI, Speaking AI and dashboard. Visitors can use the learning area without creating an account.
- Optional profile creation with email and password.
- Friends chat and group chat require a profile.
- Persistent sign-in: an HttpOnly, SameSite=Lax cookie keeps the profile signed in after closing and reopening the browser. Sessions are stored in `data/sessions.json` and survive server restarts when the host has persistent storage.
- Passwords are stored as scrypt hashes. The browser does not store the password or session token in localStorage.
- Gemini API key stays on the server.

## Run on Windows
1. Install Node.js 18 or newer.
2. Extract this ZIP and open a terminal inside the `lingua-ai-platform` folder (the folder containing `package.json`).
3. Copy `.env.example` to `.env`.
4. Put your Gemini API key in `.env` as `GEMINI_API_KEY=...` (needed for Writing AI and Speaking AI).
5. Run `npm start`.
6. Open `http://localhost:3000`.

No npm packages are required.

## Deploy online
This app needs a Node.js host, not a static-only host. Create a Node web service from this project folder and use:
- Build command: `npm install` (there are no external dependencies)
- Start command: `npm start`
- Environment variables: `GEMINI_API_KEY`, optionally `GEMINI_MODEL=gemini-2.5-flash`, `SESSION_DAYS=30`, `NODE_ENV=production`
- Attach a persistent disk/volume mounted at the app's `data` directory. User profiles, chat messages and remembered sessions are stored there. Without persistent storage, host restarts or redeploys can lose this JSON data.
- Use HTTPS. The server sets the Secure cookie attribute automatically when the host forwards `x-forwarded-proto: https`.

After the host gives you a public URL such as `https://your-app.example-host.com`, anyone can open that link without a `.uz` domain. Later, buy a `.uz` domain from an accredited registrar and add it in the hosting provider's custom-domain settings, then follow the provider's DNS instructions. Do not change DNS until the host has verified the domain.

## Important notes
- Browser sign-in is remembered for 30 days by default (`SESSION_DAYS` can be changed). Closing the browser does not sign the user out. Clearing cookies, using another browser/device, or waiting for expiry requires signing in again.
- Password recovery by email is not yet implemented. Keep the account email and password safe; a future release should add verified email reset before public launch.
- Reading and Listening sample exercises are included. Listening uses the browser's English text-to-speech voice, not an official IELTS recording.
- Speaking transcription depends on browser support (Chrome is recommended; HTTPS is generally required online).
- AI feedback is an educational estimate, not an official IELTS/CEFR score.
- Before a public launch, add rate limiting, database-backed storage, backups, abuse controls and a privacy policy. JSON files are suitable for a small prototype, not high traffic.

## Gemini
The backend calls the Gemini `generateContent` API. Default model: `gemini-2.5-flash`.
