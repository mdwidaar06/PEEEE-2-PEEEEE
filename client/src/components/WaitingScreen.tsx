import { useEffect, useState } from 'react';

export default function WaitingScreen({
  code,
  onCancel
}: {
  code: string;
  onCancel: () => void;
  peerConnected: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Fallback: best effort.
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-gray-500">Share this code with your peer</div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="text-left">
            <div className="text-xs text-gray-500">Room code</div>
            <div className="mt-2 inline-flex items-center rounded-lg bg-gray-100 px-4 py-3 font-mono text-3xl tracking-[0.35em]">
              {code.split('').join(' ')}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={onCopy}
              disabled={!code}
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gray-50"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 text-gray-600">
          <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-amber-500" />
          <div>
            Waiting for the other person to connect
            <div className="mt-1 text-xs text-gray-500">This session expires after 10 minutes.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

