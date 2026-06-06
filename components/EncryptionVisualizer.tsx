'use client';

// 4-stage pipeline: Plaintext → ECIES → IPFS → On-chain (Sepolia)
export type Stage = 0 | 1 | 2 | 3;

type EncryptionVisualizerProps = {
  plaintext: string;
  eciesBlob: string;
  ipfsCid: string;
  stage: Stage;
};

const STAGES: { label: string; color: string }[] = [
  { label: 'Plaintext',            color: 'text-white' },
  { label: 'ECIES Encrypted',      color: 'text-yellow-400' },
  { label: 'Uploaded to IPFS',     color: 'text-blue-400' },
  { label: 'CID stored on Sepolia', color: 'text-green-400' },
];

export default function EncryptionVisualizer({
  plaintext,
  eciesBlob,
  ipfsCid,
  stage,
}: EncryptionVisualizerProps) {
  const previews = [
    plaintext || '(type your prompt above)',
    eciesBlob ? `${eciesBlob.slice(0, 80)}…` : 'Encrypting with buyer public key...',
    ipfsCid || 'Uploading to IPFS...',
    ipfsCid ? `CID on Sepolia:\n${ipfsCid}` : 'Submitting transaction...',
  ];

  return (
    <div className="bg-black border border-white/20 p-5 flex flex-col gap-4 sticky top-24">
      {/* Title */}
      <div className="flex items-center gap-2">
        <div className="w-4 h-px bg-white/40" />
        <h3 className="text-[10px] font-mono text-white/50 uppercase tracking-widest">
          Encryption Pipeline
        </h3>
      </div>

      {/* Stage list */}
      <div className="flex flex-col gap-1.5 text-xs">
        {STAGES.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className={`w-5 h-5 flex items-center justify-center text-[10px] font-mono font-bold shrink-0 border ${
                i < stage
                  ? 'border-green-500/50 text-green-400'
                  : i === stage
                  ? 'border-white text-white'
                  : 'border-white/20 text-white/20'
              }`}
            >
              {i < stage ? '✓' : i + 1}
            </span>
            <span className={`font-mono text-[10px] uppercase tracking-wider ${
              i <= stage ? s.color : 'text-white/20'
            }`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Preview */}
      <pre
        className={`text-[10px] font-mono p-3 bg-white/5 border border-white/10 whitespace-pre-wrap break-all min-h-24 transition-colors ${STAGES[stage].color}`}
      >
        {previews[stage]}
      </pre>
    </div>
  );
}
