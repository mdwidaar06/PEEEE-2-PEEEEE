"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const rooms_1 = require("./rooms");
const app = (0, express_1.default)();
const allowedOrigins = (process.env.CLIENT_URL ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const corsOrigin = (origin, callback) => {
    // Node-based Socket.io clients may not send an Origin header.
    if (!origin)
        return callback(null, true);
    if (allowedOrigins.includes(origin))
        return callback(null, true);
    return callback(null, false);
};
app.use((0, cors_1.default)({
    origin: corsOrigin,
    credentials: false
}));
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
const httpServer = http_1.default.createServer(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: corsOrigin,
        credentials: false
    }
});
io.on('connection', (socket) => {
    socket.on('create-room', () => {
        try {
            const room = (0, rooms_1.createRoomWithPeer)(socket.id);
            socket.emit('room-created', { code: room.code });
        }
        catch (_err) {
            socket.emit('error', { message: 'Failed to create room. Please try again.' });
        }
    });
    socket.on('join-room', (payload) => {
        const code = (payload.code ?? '').trim().toUpperCase();
        if (!code) {
            socket.emit('error', { message: 'Missing room code.' });
            return;
        }
        try {
            const { room, role } = (0, rooms_1.joinRoomWithPeer)(code, socket.id);
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
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'That code does not exist or has expired.';
            if (message === 'Room full') {
                socket.emit('error', { message: 'This session is already in use.' });
            }
            else if (message === 'Room not found') {
                socket.emit('error', { message: "That code doesn't exist or has expired. Check the code and try again." });
            }
            else {
                socket.emit('error', { message: 'Could not join room. Please try again.' });
            }
        }
    });
    socket.on('signal', (payload) => {
        const to = payload.to;
        const data = payload.data;
        if (!to || !data)
            return;
        // Blind relay between the two room members.
        io.to(to).emit('signal', { from: socket.id, data });
    });
    socket.on('leave-room', () => {
        const { remainingPeerId } = (0, rooms_1.removePeer)(socket.id);
        if (remainingPeerId) {
            io.to(remainingPeerId).emit('peer-left');
        }
    });
    socket.on('disconnect', () => {
        const { remainingPeerId } = (0, rooms_1.removePeer)(socket.id);
        if (remainingPeerId) {
            io.to(remainingPeerId).emit('peer-left');
        }
    });
});
const port = Number(process.env.PORT ?? 3001);
(0, rooms_1.startCleanupLoop)();
httpServer.listen(port, () => {
    console.log(`[server] Listening on :${port}`);
});
