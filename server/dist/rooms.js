"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rooms = void 0;
exports.generateRoomCode = generateRoomCode;
exports.createRoomWithPeer = createRoomWithPeer;
exports.joinRoomWithPeer = joinRoomWithPeer;
exports.findRoomByPeer = findRoomByPeer;
exports.removePeer = removePeer;
exports.cleanupExpiredRooms = cleanupExpiredRooms;
exports.startCleanupLoop = startCleanupLoop;
const crypto_1 = __importDefault(require("crypto"));
const CODE_LENGTH = 6;
const MAX_PEERS = 2;
const ROOM_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // every 60s
// Uppercase letters + digits, no ambiguous characters.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
exports.rooms = new Map(); // roomCode -> Room
function randomInt(maxExclusive) {
    // crypto.randomInt is available in modern Node; ensures better distribution than Math.random.
    return crypto_1.default.randomInt(0, maxExclusive);
}
function generateRoomCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += ALPHABET[randomInt(ALPHABET.length)];
    }
    return code;
}
function createRoomWithPeer(socketId) {
    // Collision-safe generation: retry until we find an unused code.
    for (let attempts = 0; attempts < 10000; attempts++) {
        const code = generateRoomCode();
        if (!exports.rooms.has(code)) {
            const room = { code, peers: [socketId], createdAt: Date.now() };
            exports.rooms.set(code, room);
            return room;
        }
    }
    throw new Error('Could not generate a unique room code');
}
function joinRoomWithPeer(code, socketId) {
    const room = exports.rooms.get(code);
    if (!room) {
        throw new Error('Room not found');
    }
    if (room.peers.length >= MAX_PEERS) {
        throw new Error('Room full');
    }
    if (room.peers.includes(socketId)) {
        // Idempotent join (can happen after reconnect).
        return { room, role: room.peers.length === 1 ? 'initiator' : 'receiver' };
    }
    // Before adding: peers length can be 0 or 1 in normal flow.
    const role = room.peers.length === 1 ? 'receiver' : 'initiator';
    room.peers.push(socketId);
    return { room, role };
}
function findRoomByPeer(socketId) {
    for (const room of exports.rooms.values()) {
        if (room.peers.includes(socketId))
            return room;
    }
    return undefined;
}
function removePeer(socketId) {
    const room = findRoomByPeer(socketId);
    if (!room)
        return {};
    room.peers = room.peers.filter((id) => id !== socketId);
    const remainingPeerId = room.peers[0];
    const roomCode = room.code;
    if (room.peers.length === 0) {
        exports.rooms.delete(roomCode);
    }
    else {
        // Keep room until it times out (or partner disconnects).
        exports.rooms.set(roomCode, room);
    }
    return { roomCode, remainingPeerId };
}
function cleanupExpiredRooms() {
    const now = Date.now();
    for (const [code, room] of exports.rooms.entries()) {
        const isExpired = now - room.createdAt > ROOM_TTL_MS;
        const hasSpace = room.peers.length < MAX_PEERS;
        if (isExpired && hasSpace) {
            exports.rooms.delete(code);
        }
    }
}
function startCleanupLoop() {
    // Avoid multiple loops if server hot reloads.
    if (startCleanupLoop._timer)
        return;
    const timer = setInterval(() => {
        cleanupExpiredRooms();
    }, CLEANUP_INTERVAL_MS);
    startCleanupLoop._timer = timer;
}
