import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomRole } from './useSignaling';

type SignalPayload = {
  from: string;
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

type TransferState =
  | 'idle'
  | 'connecting'
  | 'sending'
  | 'receiving'
  | 'completed'
  | 'error'
  | 'cancelled';

type FileMeta = {
  type: 'file-meta';
  name: string;
  size: number;
  mimeType: string;
};

type TransferCompleteMsg = { type: 'transfer-complete' };

const CHUNK_SIZE_BYTES = 64 * 1024; // 64KB

// Keep these as free STUN servers. TURN is optional and can be added later.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
  // { urls: 'turn:YOUR_TURN_SERVER_IP:3478', username: 'dropcode', credential: 'YOUR_SECRET' }
];

type SignalingApi = {
  peerConnected: boolean;
  role: RoomRole | null;
  sendSignal: (data: RTCSessionDescriptionInit | RTCIceCandidateInit) => void;
  setOnSignal: (handler: (payload: SignalPayload) => void) => void;
  leaveRoom: () => void;
};

export function useWebRTC(signaling: SignalingApi) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const [transferState, setTransferState] = useState<TransferState>('idle');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0); // MB/s

  const transferStateRef = useRef<TransferState>(transferState);
  useEffect(() => {
    transferStateRef.current = transferState;
  }, [transferState]);

  const [fileStats, setFileStats] = useState<{
    fileName?: string;
    fileSizeBytes?: number;
    durationMs?: number;
    avgSpeedMbPerS?: number;
  }>({});

  const [currentFileMeta, setCurrentFileMeta] = useState<{
    name: string;
    size: number;
    mimeType: string;
  } | null>(null);

  // Track bytes received/sent in the last 1s window.
  const slidingWindowRef = useRef<Array<{ t: number; bytes: number }>>([]);
  const totalBytesRef = useRef(0);
  const transferredBytesRef = useRef(0);
  const transferStartMsRef = useRef<number | null>(null);
  const transferChunksRef = useRef<ArrayBuffer[]>([]);
  const receivedMimeTypeRef = useRef<string>('application/octet-stream');
  const receivedFileNameRef = useRef<string>('download');

  const resetTransferState = useCallback(() => {
    setTransferState('idle');
    setProgress(0);
    setSpeed(0);
    slidingWindowRef.current = [];
    totalBytesRef.current = 0;
    transferredBytesRef.current = 0;
    transferStartMsRef.current = null;
    transferChunksRef.current = [];
    receivedMimeTypeRef.current = 'application/octet-stream';
    receivedFileNameRef.current = 'download';
    setFileStats({});
    setCurrentFileMeta(null);
  }, []);

  const updateSpeedAndProgress = useCallback(() => {
    const now = Date.now();
    const windowMs = 1000;
    const windowEntries = slidingWindowRef.current;

    // Keep only the last 1s of data.
    while (windowEntries.length && now - windowEntries[0].t > windowMs) {
      windowEntries.shift();
    }

    const bytesInWindow = windowEntries.reduce((sum, e) => sum + e.bytes, 0);
    const mbPerS = bytesInWindow / (1024 * 1024); // since window is ~1s

    const total = totalBytesRef.current || 1;
    const pct = Math.min(100, (transferredBytesRef.current / total) * 100);

    setSpeed(Number.isFinite(mbPerS) ? mbPerS : 0);
    setProgress(Math.max(0, pct));
  }, []);

  const setupDataChannel = useCallback(
    (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;
      channel.binaryType = 'arraybuffer';

      channel.onopen = () => {
        // Only initiator actively sends, but receiver can start receiving immediately after 'file-meta'.
        if (signaling.peerConnected && signaling.role) {
          setTransferState((s) => (s === 'idle' ? 'connecting' : s));
        }
      };

      channel.onmessage = (event) => {
        const data = event.data;

        if (typeof data === 'string') {
          let msg: FileMeta | TransferCompleteMsg | null = null;
          try {
            msg = JSON.parse(data);
          } catch {
            return;
          }
          if (!msg || !('type' in msg)) return;

          if (msg.type === 'file-meta') {
            const meta = msg as FileMeta;
            resetTransferState();
            setTransferState(signaling.role === 'initiator' ? 'sending' : 'receiving');

            receivedFileNameRef.current = meta.name;
            receivedMimeTypeRef.current = meta.mimeType;
            totalBytesRef.current = meta.size;
            transferredBytesRef.current = 0;
            transferStartMsRef.current = Date.now();
            setCurrentFileMeta({ name: meta.name, size: meta.size, mimeType: meta.mimeType });
            slidingWindowRef.current = [];
            transferChunksRef.current = [];
            setProgress(0);
            setSpeed(0);
            return;
          }

          if (msg.type === 'transfer-complete') {
            // Only receiver will meaningfully complete; sender also sends this marker.
            const durationMs = transferStartMsRef.current ? Date.now() - transferStartMsRef.current : undefined;
            const fileSizeBytes = totalBytesRef.current || transferredBytesRef.current;

            const durationS = durationMs ? Math.max(0.0001, durationMs / 1000) : undefined;
            const avgSpeedMbPerS =
              durationS && fileSizeBytes
                ? (fileSizeBytes / (1024 * 1024)) / durationS
                : undefined;

            setTransferState('completed');
            setProgress(100);
            setSpeed((prev) => (prev >= 0 ? prev : 0));
            setFileStats({
              fileName: receivedFileNameRef.current,
              fileSizeBytes,
              durationMs,
              avgSpeedMbPerS
            });

            // Receiver triggers download here.
            const blob = new Blob(transferChunksRef.current, { type: receivedMimeTypeRef.current });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = receivedFileNameRef.current || 'download';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
            return;
          }
        } else if (data instanceof ArrayBuffer) {
          // Receiver side chunk handling.
          transferChunksRef.current.push(data);
          transferredBytesRef.current += data.byteLength;

          // If we are sending side, this branch can also run if we loopback; keep it generic.
          slidingWindowRef.current.push({ t: Date.now(), bytes: data.byteLength });
          updateSpeedAndProgress();
        }
      };

      channel.onerror = () => {
        setTransferState('error');
      };

      channel.onclose = () => {
        if (transferStateRef.current !== 'completed') {
          setTransferState('cancelled');
        }
      };
    },
    [resetTransferState, signaling.peerConnected, signaling.role, updateSpeedAndProgress]
  );

  // Create the RTCPeerConnection + DataChannel when peer connects.
  useEffect(() => {
    if (!signaling.peerConnected || !signaling.role) {
      // Tear down if disconnected.
      const prev = transferStateRef.current;
      pcRef.current?.close();
      pcRef.current = null;
      dataChannelRef.current = null;

      // If we were actively transferring, keep a user-visible "cancelled" state.
      if (prev === 'sending' || prev === 'receiving') {
        setTransferState('cancelled');
        setProgress(0);
        setSpeed(0);
        slidingWindowRef.current = [];
        totalBytesRef.current = 0;
        transferredBytesRef.current = 0;
        transferStartMsRef.current = null;
        transferChunksRef.current = [];
        setCurrentFileMeta(null);
        setFileStats({});
      } else {
        resetTransferState();
      }
      return;
    }

    resetTransferState();
    setTransferState('connecting');

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        signaling.sendSignal(ev.candidate.toJSON());
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed' || state === 'disconnected') {
        setTransferState('error');
      }
    };

    if (signaling.role === 'initiator') {
      const channel = pc.createDataChannel('file-transfer', { ordered: true });
      setupDataChannel(channel);

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          const local = pc.localDescription;
          if (local) signaling.sendSignal(local);
        })
        .catch(() => setTransferState('error'));
    } else {
      pc.ondatachannel = (ev) => {
        setupDataChannel(ev.channel);
      };
    }

    return () => {
      pc.onicecandidate = null;
      pc.ondatachannel = null;
      pc.close();
      pcRef.current = null;
      dataChannelRef.current = null;
    };
  }, [resetTransferState, signaling.peerConnected, signaling.role, signaling.sendSignal, setupDataChannel]);

  // Handle incoming SDP/ICE messages from the signaling server.
  useEffect(() => {
    signaling.setOnSignal(async (payload: SignalPayload) => {
      const pc = pcRef.current;
      if (!pc) return;
      const dataAny = payload.data as any;

      // SDP offer/answer.
      if (dataAny && typeof dataAny === 'object' && 'type' in dataAny) {
        const type = dataAny.type as string;
        if (type === 'offer') {
          await pc.setRemoteDescription(dataAny as RTCSessionDescriptionInit);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signaling.sendSignal(answer);
          return;
        }
        if (type === 'answer') {
          await pc.setRemoteDescription(dataAny as RTCSessionDescriptionInit);
          return;
        }
      }

      // ICE candidate.
      if (dataAny && typeof dataAny === 'object' && 'candidate' in dataAny) {
        try {
          await pc.addIceCandidate(dataAny as RTCIceCandidateInit);
        } catch {
          // Some browsers may reject candidates if state isn't ready; ignore for robustness.
        }
      }
    });
  }, [signaling.sendSignal, signaling.setOnSignal]);

  const sendFile = useCallback(
    async (file: File) => {
      if (!dataChannelRef.current) throw new Error('Data channel not ready');
      if (signaling.role !== 'initiator') throw new Error('Only the initiator can send');

      const channel = dataChannelRef.current;
      if (channel.readyState !== 'open') throw new Error('Data channel is not open yet');

      resetTransferState();
      setTransferState('sending');

      receivedFileNameRef.current = file.name;
      receivedMimeTypeRef.current = file.type || 'application/octet-stream';
      totalBytesRef.current = file.size;
      transferredBytesRef.current = 0;
      transferStartMsRef.current = Date.now();
      setCurrentFileMeta({ name: file.name, size: file.size, mimeType: receivedMimeTypeRef.current });
      slidingWindowRef.current = [];
      transferChunksRef.current = [];
      setProgress(0);
      setSpeed(0);

      const meta: FileMeta = {
        type: 'file-meta',
        name: file.name,
        size: file.size,
        mimeType: receivedMimeTypeRef.current
      };

      channel.send(JSON.stringify(meta));

      for (let offset = 0; offset < file.size; offset += CHUNK_SIZE_BYTES) {
        const chunk = file.slice(offset, offset + CHUNK_SIZE_BYTES);
        const arrayBuffer = await chunk.arrayBuffer();
        channel.send(arrayBuffer);

        transferredBytesRef.current += arrayBuffer.byteLength;
        slidingWindowRef.current.push({ t: Date.now(), bytes: arrayBuffer.byteLength });
        updateSpeedAndProgress();
      }

      const completeMsg: TransferCompleteMsg = { type: 'transfer-complete' };
      channel.send(JSON.stringify(completeMsg));

      const durationMs = transferStartMsRef.current ? Date.now() - transferStartMsRef.current : undefined;
      const durationS = durationMs ? Math.max(0.0001, durationMs / 1000) : undefined;
      const avgSpeedMbPerS =
        durationS && file.size ? (file.size / (1024 * 1024)) / durationS : undefined;

      setTransferState('completed');
      setProgress(100);
      setFileStats({
        fileName: file.name,
        fileSizeBytes: file.size,
        durationMs,
        avgSpeedMbPerS
      });
    },
    [resetTransferState, setFileStats, signaling.role, updateSpeedAndProgress]
  );

  return {
    sendFile,
    transferState,
    progress,
    speed,
    peerConnected: signaling.peerConnected,
    role: signaling.role,
    fileStats,
    resetTransfer: resetTransferState,
    currentFileMeta
  };
}

