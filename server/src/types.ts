export type SocketId = string;

export type RoomRole = 'initiator' | 'receiver';

export interface Room {
  code: string;
  peers: SocketId[]; // up to 2 socket IDs
  createdAt: number; // epoch ms
}

