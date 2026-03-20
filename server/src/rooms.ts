import crypto from 'crypto';
import { Room, RoomRole, SocketId } from './types';

const CODE_LENGTH = 6;
const MAX_PEERS = 2;
const ROOM_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // every 60s

// Uppercase letters + digits, no ambiguous characters.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const rooms = new Map<string, Room>(); // roomCode -> Room

function randomInt(maxExclusive: number) {
  // crypto.randomInt is available in modern Node; ensures better distribution than Math.random.
  return crypto.randomInt(0, maxExclusive);
}

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export function createRoomWithPeer(socketId: SocketId): Room {
  // Collision-safe generation: retry until we find an unused code.
  for (let attempts = 0; attempts < 10_000; attempts++) {
    const code = generateRoomCode();
    if (!rooms.has(code)) {
      const room: Room = { code, peers: [socketId], createdAt: Date.now() };
      rooms.set(code, room);
      return room;
    }
  }

  throw new Error('Could not generate a unique room code');
}

export function joinRoomWithPeer(code: string, socketId: SocketId): { room: Room; role: RoomRole } {
  const room = rooms.get(code);
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
  const role: RoomRole = room.peers.length === 1 ? 'receiver' : 'initiator';
  room.peers.push(socketId);
  return { room, role };
}

export function findRoomByPeer(socketId: SocketId): Room | undefined {
  for (const room of rooms.values()) {
    if (room.peers.includes(socketId)) return room;
  }
  return undefined;
}

export function removePeer(socketId: SocketId): { roomCode?: string; remainingPeerId?: SocketId } {
  const room = findRoomByPeer(socketId);
  if (!room) return {};

  room.peers = room.peers.filter((id) => id !== socketId);

  const remainingPeerId = room.peers[0];
  const roomCode = room.code;

  if (room.peers.length === 0) {
    rooms.delete(roomCode);
  } else {
    // Keep room until it times out (or partner disconnects).
    rooms.set(roomCode, room);
  }

  return { roomCode, remainingPeerId };
}

export function cleanupExpiredRooms() {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const isExpired = now - room.createdAt > ROOM_TTL_MS;
    const hasSpace = room.peers.length < MAX_PEERS;
    if (isExpired && hasSpace) {
      rooms.delete(code);
    }
  }
}

export function startCleanupLoop() {
  // Avoid multiple loops if server hot reloads.
  if ((startCleanupLoop as unknown as { _timer?: NodeJS.Timeout })._timer) return;

  const timer = setInterval(() => {
    cleanupExpiredRooms();
  }, CLEANUP_INTERVAL_MS);

  (startCleanupLoop as unknown as { _timer: NodeJS.Timeout })._timer = timer;
}

