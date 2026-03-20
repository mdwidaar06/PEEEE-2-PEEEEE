function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(ms?: number) {
  if (!ms || !Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.max(0, ms / 1000);
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toFixed(0)}s`;
}

export default function DoneScreen({
  fileStats,
  onSendAnother,
  onBackHome
}: {
  fileStats: {
    fileName?: string;
    fileSizeBytes?: number;
    durationMs?: number;
    avgSpeedMbPerS?: number;
  };
  onSendAnother: () => void;
  onBackHome: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
      <div className="w-full rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <div className="text-3xl font-semibold tracking-tight">Transfer complete!</div>
        <div className="mt-3 text-sm text-gray-600">
          {fileStats.fileName ? `Downloaded: ${fileStats.fileName}` : 'Your file has been transferred.'}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-xs text-gray-500">File size</div>
            <div className="mt-1 text-sm font-medium">
              {fileStats.fileSizeBytes ? formatBytes(fileStats.fileSizeBytes) : '—'}
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Time</div>
            <div className="mt-1 text-sm font-medium">{formatDuration(fileStats.durationMs)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Avg speed</div>
            <div className="mt-1 text-sm font-medium">
              {fileStats.avgSpeedMbPerS ? `${fileStats.avgSpeedMbPerS.toFixed(2)} MB/s` : '—'}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onSendAnother}
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Send another file
          </button>
          <button
            type="button"
            onClick={onBackHome}
            className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            New transfer
          </button>
        </div>
      </div>
    </div>
  );
}

