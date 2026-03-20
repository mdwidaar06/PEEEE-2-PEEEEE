import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import {
  createRoomWithPeer,
  joinRoomWithPeer,
  removePeer,
  startCleanupLoop
} from './rooms';

const app = express();
const allowedOrigins = (process.env.CLIENT_URL ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Node-based Socket.io clients may not send an Origin header.
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  return callback(null, false);
};

app.use(
  cors({
    origin: corsOrigin,
    credentials: false
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: false
  }
});

io.on('connection', (socket) => {
  socket.on('create-room', () => {
    try {
      const room = createRoomWithPeer(socket.id);
      socket.emit('room-created', { code: room.code });
    } catch (_err) {
      socket.emit('error', { message: 'Failed to create room. Please try again.' });
    }
  });

  socket.on('join-room', (payload: { code?: string }) => {
    const code = (payload.code ?? '').trim().toUpperCase();
    if (!code) {
      socket.emit('error', { message: 'Missing room code.' });
      return;
    }

    try {
      const { room, role } = joinRoomWithPeer(code, socket.id);

      const otherPeerId = room.peers.find((id) => id !== socket.id);
      if (!otherPeerId) {
        // Room exists but only this peer is present; we still treat it as a receiver retry.
        socket.emit('error', { message: 'Waiting for the other person to connect.' });
        return;
      }

      const initiatorId = role === 'initiator' ? socket.id : otherPeerId;
      const receiverId = role === 'receiver' ? socket.id : otherPeerId;

      io.to(initiatorId).emit('peer-joined', { role: 'initiator', peerId: receiverId });
      io.to(receiverId).emit('peer-joined', { role: 'receiver', peerId: initiatorId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'That code does not exist or has expired.';

      if (message === 'Room full') {
        socket.emit('error', { message: 'This session is already in use.' });
      } else if (message === 'Room not found') {
        socket.emit('error', { message: "That code doesn't exist or has expired. Check the code and try again." });
      } else {
        socket.emit('error', { message: 'Could not join room. Please try again.' });
      }
    }
  });

  socket.on(
    'signal',
    (payload: { to?: string; data?: RTCSessionDescriptionInit | RTCIceCandidateInit }) => {
      const to = payload.to;
      const data = payload.data;
      if (!to || !data) return;

      // Blind relay between the two room members.
      io.to(to).emit('signal', { from: socket.id, data });
    }
  );

  socket.on('leave-room', () => {
    const { remainingPeerId } = removePeer(socket.id);
    if (remainingPeerId) {
      io.to(remainingPeerId).emit('peer-left');
    }
  });

  socket.on('disconnect', () => {
    const { remainingPeerId } = removePeer(socket.id);
    if (remainingPeerId) {
      io.to(remainingPeerId).emit('peer-left');
    }
  });
});

const port = Number(process.env.PORT ?? 3001);
startCleanupLoop();
httpServer.listen(port, () => {
  console.log(`[server] Listening on :${port}`);
});

