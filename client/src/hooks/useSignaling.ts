import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export type RoomRole = 'initiator' | 'receiver';

type PeerJoinedPayload = {
  role: RoomRole;
  peerId: string;
};

type SignalPayload = {
  from: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

type SignalingErrorPayload = {
  message?: string;
};

export function useSignaling() {
  const signalingUrl = useMemo(() => {
    const url = import.meta.env.VITE_SIGNALING_URL;
    if (!url || typeof url !== 'string') {
      throw new Error('VITE_SIGNALING_URL is not set');
    }
    return url;
  }, []);

  const socketRef = useRef<Socket | null>(null);

  const signalHandlerRef = useRef<((payload: SignalPayload) => void) | null>(null);

  const [socketConnected, setSocketConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [role, setRole] = useState<RoomRole | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(signalingUrl, {
      transports: ['websocket'],
      autoConnect: true
    });

    socketRef.current = socket;

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => {
      setSocketConnected(false);
      setPeerConnected(false);
      setRole(null);
      setPeerId(null);
    });

    socket.on('room-created', (payload: { code?: string }) => {
      const code = (payload.code ?? '').toUpperCase();
      if (code) setRoomCode(code);
    });

    socket.on('peer-joined', (payload: PeerJoinedPayload) => {
      setPeerConnected(true);
      setRole(payload.role);
      setPeerId(payload.peerId);
      setErrorMessage(null);
    });

    socket.on('peer-left', () => {
      setPeerConnected(false);
      setRole(null);
      setPeerId(null);
    });

    socket.on('error', (payload: SignalingErrorPayload) => {
      setErrorMessage(payload.message ?? 'Something went wrong.');
    });

    socket.on('signal', (payload: SignalPayload) => {
      signalHandlerRef.current?.(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [signalingUrl]);

  const setOnSignal = useCallback((handler: (payload: SignalPayload) => void) => {
    signalHandlerRef.current = handler;
  }, []);

  const createRoom = useCallback(() => {
    setErrorMessage(null);
    setRoomCode(null);
    setPeerConnected(false);
    setRole(null);
    setPeerId(null);
    socketRef.current?.emit('create-room');
  }, []);

  const joinRoom = useCallback((code: string) => {
    setErrorMessage(null);
    setRoomCode(code.trim().toUpperCase());
    setPeerConnected(false);
    setRole(null);
    setPeerId(null);
    socketRef.current?.emit('join-room', { code: code.trim().toUpperCase() });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('leave-room');
    setPeerConnected(false);
    setRole(null);
    setPeerId(null);
  }, []);

  const sendSignal = useCallback(
    (data: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
      if (!peerId) return;
      socketRef.current?.emit('signal', { to: peerId, data });
    },
    [peerId]
  );

  return {
    socketConnected,
    peerConnected,
    roomCode,
    role,
    peerId,
    errorMessage,
    createRoom,
    joinRoom,
    leaveRoom,
    sendSignal,
    setOnSignal
  };
}

