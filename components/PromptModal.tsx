'use client';

import { useState } from 'react';

type PromptModalProps = {
  plaintext: string;
  onClose: () => void;
};

export default function PromptModal({ plaintext, onClose }: PromptModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(plaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-black border border-white/20 p-6 max-w-2xl w-full mx-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-4 h-px bg-white/40" />
            <h2 className="text-xs font-mono text-white uppercase tracking-widest">Your Prompt</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[10px] font-mono text-white/40 border border-white/20 px-3 py-1 hover:border-white hover:text-white transition-all"
          >
            CLOSE &amp; CLEAR
          </button>
        </div>

        {/* Warning */}
        <div className="border border-white/20 px-4 py-2 text-[10px] font-mono text-white/50">
          ⚠ This prompt will not be saved anywhere. Closing this modal wipes it from memory.
        </div>

        {/* Content */}
        <pre className="border border-white/10 bg-white/5 p-4 text-xs text-green-400 font-mono whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
          {plaintext}
        </pre>

        {/* Actions */}
        <div className="flex justify-end">
          <button
            onClick={handleCopy}
            className="text-[10px] font-mono border border-white/20 text-white/60 px-4 py-2 hover:border-white hover:text-white transition-all"
          >
            {copied ? 'COPIED ✓' : 'COPY TO CLIPBOARD'}
          </button>
        </div>
      </div>
    </div>
  );
}
