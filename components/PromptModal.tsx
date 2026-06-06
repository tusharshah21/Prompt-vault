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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-2xl w-full mx-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Your Prompt</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm px-3 py-1 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Close & Clear
          </button>
        </div>

        <div className="bg-yellow-950 border border-yellow-800 rounded-lg px-4 py-2 text-yellow-300 text-xs">
          This prompt will not be saved anywhere. Closing this modal wipes it from memory.
        </div>

        <pre className="bg-gray-950 rounded-xl p-4 text-sm text-green-300 font-mono whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
          {plaintext}
        </pre>

        <div className="flex justify-end">
          <button
            onClick={handleCopy}
            className="text-sm bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>
    </div>
  );
}
