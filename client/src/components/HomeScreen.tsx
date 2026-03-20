import { useState } from 'react';

export default function HomeScreen({
  onSend,
  onReceive
}: {
  onSend: () => void;
  onReceive: (code: string) => void;
}) {
  const [code, setCode] = useState('');

  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const canConnect = normalizedCode.length === 6;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <div className="text-3xl font-semibold tracking-tight">DropCode</div>
        <div className="mt-2 text-sm text-gray-600">Send files directly P2P. No file bytes touch the server.</div>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={onSend}
          className="rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:bg-gray-50"
        >
          <div className="text-lg font-medium">Send a file</div>
          <div className="mt-2 text-sm text-gray-600">We’ll generate a 6-character code for your peer.</div>
          <div className="mt-4 inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white">
            Create code
          </div>
        </button>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-medium">Receive a file</div>
          <div className="mt-2 text-sm text-gray-600">Enter the code and connect directly.</div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700">Room code</label>
            <input
              value={normalizedCode}
              onChange={(e) => setCode(e.target.value)}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={6}
              placeholder="A1B2C3"
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-center font-mono text-lg tracking-widest outline-none focus:border-gray-400"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500">6 chars, A-Z + 0-9</div>
              <button
                type="button"
                disabled={!canConnect}
                onClick={() => onReceive(normalizedCode)}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

