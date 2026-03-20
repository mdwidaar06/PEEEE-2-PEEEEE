# DropCode setup (local)

This guide runs DropCode on your machine (signaling server + frontend) for development/testing.

## Requirements
- Node.js (recommended v20+)
- npm
- Two terminals (or tabs)

## 1) Open the project
Open the folder that contains these subfolders:
- `client/`
- `server/`

## 2) Create environment files

### Client (`client/.env`)
Create `client/.env` from `client/.env.example`.

Example:
```bash
VITE_SIGNALING_URL=http://localhost:3001
```

### Server (`server/.env`)
Create `server/.env` from `server/.env.example`.

Example:
```bash
PORT=3001
CLIENT_URL=http://localhost:5173
```

## 3) Install dependencies
Run both commands:
```bash
cd server
npm install

cd ../client
npm install
```

## 4) Start the signaling server
In a terminal:
```bash
cd server
npm run dev
```
You should see something like:
`[server] Listening on :3001`

Leave this terminal running.

## 5) Start the frontend
In another terminal:
```bash
cd client
npm run dev
```
Open the URL shown by Vite (typically `http://localhost:5173/`).

## 6) Smoke test (manual)
1. Open the frontend in **two tabs** (or two devices).
2. In Tab A, click **“Send a file”**.
3. Copy the 6-character room code from the Waiting screen.
4. In Tab B, enter the room code and click **“Connect”**.
5. Tab A: click **Choose file** and upload a small file.
6. Confirm Tab B reaches **“Transfer complete!”**.

## Optional: TURN (coturn)
If P2P connections fail on some networks, you can deploy coturn and add it to:
`client/src/hooks/useWebRTC.ts` (inside `ICE_SERVERS`).
The README includes a basic coturn config example.

