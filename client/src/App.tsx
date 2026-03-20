import { useEffect, useRef, useState } from 'react';
import { useSignaling } from './hooks/useSignaling';
import { useWebRTC } from './hooks/useWebRTC';
import DoneScreen from './components/DoneScreen';
import HomeScreen from './components/HomeScreen';
import TransferScreen from './components/TransferScreen';
import WaitingScreen from './components/WaitingScreen';

type Screen = 'home' | 'waiting' | 'transfer' | 'done';

export default function App() {
  const signaling = useSignaling();
  const rtc = useWebRTC({
    peerConnected: signaling.peerConnected,
    role: signaling.role,
    sendSignal: signaling.sendSignal,
    setOnSignal: signaling.setOnSignal,
    leaveRoom: signaling.leaveRoom
  });

  const [screen, setScreen] = useState<Screen>('home');
  const [userMessage, setUserMessage] = useState<string | null>(null);

  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const sessionTimeoutRef = useRef<number | null>(null);

  const prevSocketConnectedRef = useRef<boolean>(false);
  const [connectionLost, setConnectionLost] = useState(false);

  useEffect(() => {
    const prev = prevSocketConnectedRef.current;
    if (prev && !signaling.socketConnected) {
      setConnectionLost(true);
    }
    if (signaling.socketConnected) setConnectionLost(false);
    prevSocketConnectedRef.current = signaling.socketConnected;
  }, [signaling.socketConnected]);

  useEffect(() => {
    if (!sessionStartedAt) return;

    if (sessionTimeoutRef.current) window.clearTimeout(sessionTimeoutRef.current);

    sessionTimeoutRef.current = window.setTimeout(() => {
      setUserMessage('Your session expired. Please try again.');
      rtc.resetTransfer();
      signaling.leaveRoom();
      setSessionStartedAt(null);
      setScreen('home');
    }, 10 * 60 * 1000);

    return () => {
      if (sessionTimeoutRef.current) window.clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    };
  }, [sessionStartedAt, rtc.resetTransfer, signaling.leaveRoom]);

  useEffect(() => {
    if (rtc.transferState === 'completed') {
      setScreen('done');
    }
  }, [rtc.transferState]);

  useEffect(() => {
    if (screen === 'waiting' && signaling.peerConnected) {
      setScreen('transfer');
    }
  }, [screen, signaling.peerConnected]);

  useEffect(() => {
    if (signaling.errorMessage) setUserMessage(signaling.errorMessage);
  }, [signaling.errorMessage]);

  useEffect(() => {
    if (connectionLost) {
      setUserMessage('Connection lost. Please try again.');
    }
  }, [connectionLost]);

  const onSend = () => {
    setUserMessage(null);
    rtc.resetTransfer();
    signaling.createRoom();
    setSessionStartedAt(Date.now());
    setScreen('waiting');
  };

  const onReceive = (code: string) => {
    setUserMessage(null);
    rtc.resetTransfer();
    signaling.joinRoom(code);
    setSessionStartedAt(Date.now());
    setScreen('transfer');
  };

  const onCancelWaiting = () => {
    rtc.resetTransfer();
    signaling.leaveRoom();
    setSessionStartedAt(null);
    setUserMessage(null);
    setScreen('home');
  };

  const onBackHome = () => {
    rtc.resetTransfer();
    signaling.leaveRoom();
    setSessionStartedAt(null);
    setUserMessage(null);
    setScreen('home');
  };

  const onSendAnother = () => {
    rtc.resetTransfer();
    setUserMessage(null);
    setScreen('transfer');
  };

  const status = (() => {
    if (connectionLost) {
      return { dot: 'bg-red-500', text: 'Connection lost' };
    }
    if (!signaling.socketConnected) {
      return { dot: 'bg-gray-400', text: 'Not connected' };
    }
    if (!signaling.peerConnected) {
      return { dot: 'bg-amber-500', text: 'Connecting...' };
    }
    return { dot: 'bg-green-500', text: 'Connected · Peer ready' };
  })();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className={[
                'h-3 w-3 rounded-full',
                status.dot,
                status.text === 'Connecting...' ? 'animate-pulse' : ''
              ].join(' ')}
            />
            <div className="text-sm font-medium">{status.text}</div>
          </div>
          <div className="text-xs text-gray-500">DropCode</div>
        </div>
      </div>

      {userMessage ? (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {userMessage}
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-5xl px-4 py-8">
        {screen === 'home' ? (
          <HomeScreen onSend={onSend} onReceive={onReceive} />
        ) : null}
        {screen === 'waiting' ? (
          <WaitingScreen
            code={signaling.roomCode ?? ''}
            onCancel={onCancelWaiting}
            peerConnected={signaling.peerConnected}
          />
        ) : null}
        {screen === 'transfer' ? (
          <TransferScreen role={rtc.role} rtc={rtc} peerConnected={signaling.peerConnected} />
        ) : null}
        {screen === 'done' ? (
          <DoneScreen fileStats={rtc.fileStats} onSendAnother={onSendAnother} onBackHome={onBackHome} />
        ) : null}
      </main>
    </div>
  );
}
