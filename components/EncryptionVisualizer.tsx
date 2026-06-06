'use client';

// 5-stage pipeline: Plaintext → ECIES → IPFS → FHE → On-chain
export type Stage = 0 | 1 | 2 | 3 | 4;

type EncryptionVisualizerProps = {
  plaintext: string;
  eciesBlob: string;
  ipfsCid: string;
  fheBlob: string;
  stage: Stage;
};

const STAGES: { label: string; color: string }[] = [
  { label: 'Plaintext', color: 'text-white' },
  { label: 'ECIES Encrypted', color: 'text-yellow-400' },
  { label: 'IPFS Uploaded', color: 'text-blue-400' },
  { label: 'FHE Wrapped CID', color: 'text-purple-400' },
  { label: 'On-chain', color: 'text-green-400' },
];

export default function EncryptionVisualizer({
  plaintext,
  eciesBlob,
  ipfsCid,
  fheBlob,
  stage,
}: EncryptionVisualizerProps) {
  const previews = [
    plaintext || '(type your prompt above)',
    eciesBlob ? `${eciesBlob.slice(0, 80)}…` : 'Encrypting with buyer public key...',
    ipfsCid || 'Uploading to IPFS...',
    fheBlob ? `CID chunk ctHash: ${fheBlob.slice(0, 40)}…` : 'Wrapping CID with FHE...',
    fheBlob ? `On-chain: 3 × euint128 ctHash\nCID chunk 0: ${fheBlob.slice(0, 40)}…` : 'Submitting transaction...',
  ];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4 sticky top-24">
      <h3 className="text-sm font-semibold text-gray-300">Encryption Pipeline</h3>

      <div className="flex flex-col gap-1 text-xs">
        {STAGES.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i < stage
                  ? 'bg-green-800 text-green-300'
                  : i === stage
                  ? 'bg-purple-700 text-white'
                  : 'bg-gray-800 text-gray-600'
              }`}
            >
              {i < stage ? '✓' : i + 1}
            </span>
            <span className={i <= stage ? s.color : 'text-gray-600'}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <pre
        className={`text-xs font-mono p-3 bg-gray-950 rounded-lg whitespace-pre-wrap break-all min-h-24 transition-colors ${STAGES[stage].color}`}
      >
        {previews[stage]}
      </pre>
    </div>
  );
}
