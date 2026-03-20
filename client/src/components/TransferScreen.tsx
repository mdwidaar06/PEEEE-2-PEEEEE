import { useMemo, useState } from 'react';
import type { RoomRole } from '../hooks/useSignaling';

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const s = Math.ceil(totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

export default function TransferScreen({
  role,
  rtc,
  peerConnected
}: {
  role: RoomRole | null;
  peerConnected: boolean;
  rtc: {
    sendFile: (file: File) => Promise<void>;
    transferState: string;
    progress: number;
    speed: number;
    currentFileMeta: { name: string; size: number; mimeType: string } | null;
  };
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const meta = rtc.currentFileMeta;

  const isInitiator = role === 'initiator';

  const speedMbPerS = rtc.speed;
  const remainingSeconds = useMemo(() => {
    if (!meta) return NaN;
    if (speedMbPerS <= 0) return NaN;
    const remainingBytes = meta.size * (1 - rtc.progress / 100);
    const bytesPerS = speedMbPerS * 1024 * 1024;
    return remainingBytes / Math.max(1e-9, bytesPerS);
  }, [meta, rtc.progress, speedMbPerS]);

  const disabled =
    !peerConnected ||
    rtc.transferState === 'sending' ||
    rtc.transferState === 'receiving' ||
    rtc.transferState === 'connecting';

  const onPickFile = (f: File | null) => {
    setSendError(null);
    setSelectedFile(f);
  };

  const onSend = async () => {
    if (!selectedFile) return;
    setSendError(null);
    try {
      await rtc.sendFile(selectedFile);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not start transfer.');
    }
  };

  const ProgressBar = () => (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <div className="font-medium">{Math.round(rtc.progress)}%</div>
        <div className="text-gray-500">
          {speedMbPerS > 0 ? `${speedMbPerS.toFixed(2)} MB/s` : '—'}
        </div>
      </div>
      <div className="mt-2 h-3 w-full rounded-full bg-gray-100">
        <div
          className="h-3 rounded-full bg-gray-900 transition-[width] duration-100"
          style={{ width: `${Math.min(100, Math.max(0, rtc.progress))}%` }}
        />
      </div>
      {meta ? (
        <div className="mt-2 text-xs text-gray-500">
          ETA: {speedMbPerS > 0 ? formatSeconds(remainingSeconds) : '—'}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {rtc.transferState === 'cancelled' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          The other person disconnected. Transfer cancelled.
        </div>
      ) : null}

      {!peerConnected && rtc.transferState !== 'idle' && rtc.transferState !== 'completed' && rtc.transferState !== 'cancelled' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          The other person disconnected. Transfer cancelled.
        </div>
      ) : null}

      {isInitiator ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-lg font-medium">Send a file</div>

            <div
              className="mt-4 flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0] ?? null;
                if (f) onPickFile(f);
              }}
            >
              <div className="text-sm font-medium text-gray-900">Drag & drop</div>
              <div className="text-xs text-gray-600">or click to choose a file</div>
              <label className="mt-2 cursor-pointer rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                Choose file
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  disabled={disabled}
                />
              </label>
            </div>

            {selectedFile ? (
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                <div className="text-sm font-medium text-gray-900">{selectedFile.name}</div>
                <div className="mt-1 text-xs text-gray-600">{formatBytes(selectedFile.size)}</div>
                {selectedFile.size > 2 * 1024 * 1024 * 1024 ? (
                  <div className="mt-2 text-xs text-amber-700">
                    Warning: files &gt; 2GB may fail on some browsers.
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={onSend}
                  disabled={!selectedFile || disabled}
                  className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gray-800"
                >
                  Send File
                </button>
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">Select a file to start.</div>
            )}

            {sendError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {sendError}
              </div>
            ) : null}

            {rtc.transferState === 'error' ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Couldn't establish a direct connection. Make sure both devices have internet access.
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-lg font-medium">Transfer progress</div>

            {rtc.transferState === 'idle' ? (
              <div className="mt-3 text-sm text-gray-600">Waiting for the other person to connect...</div>
            ) : null}

            {(rtc.transferState === 'sending' || rtc.transferState === 'receiving' || rtc.transferState === 'completed' || rtc.transferState === 'connecting') ? (
              <div className="mt-4">
                <ProgressBar />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-medium">Receive a file</div>

          {rtc.transferState === 'idle' || rtc.transferState === 'connecting' ? (
            <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
              Waiting for sender to choose a file...
            </div>
          ) : null}

          {rtc.transferState === 'receiving' || rtc.transferState === 'sending' || rtc.transferState === 'completed' ? (
            <div className="mt-4">
              {meta ? (
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="text-sm font-medium text-gray-900">{meta.name}</div>
                  <div className="mt-1 text-xs text-gray-600">{formatBytes(meta.size)}</div>
                </div>
              ) : null}

              <div className="mt-4">
                <ProgressBar />
              </div>
            </div>
          ) : null}

          {rtc.transferState === 'error' ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Couldn't establish a direct connection.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

