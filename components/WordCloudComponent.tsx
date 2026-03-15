
import React from 'react';

interface WordCloudComponentProps {
  words: string[];
}

export const WordCloudComponent: React.FC<WordCloudComponentProps> = ({ words }) => {
  if (words.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
        <p className="text-sm font-medium text-slate-400">No common themes identified yet.</p>
      </div>
    );
  }

  // Preset font sizes to create variety
  const sizes = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'];
  const colors = [
    'text-indigo-400', 'text-violet-400', 'text-blue-400', 
    'text-indigo-600', 'text-violet-600', 'text-blue-600'
  ];

  return (
    <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm h-full flex flex-wrap items-center justify-center gap-4">
      {words.map((word, idx) => {
        // Deterministic but "random-looking" selection
        const sizeClass = sizes[idx % sizes.length];
        const colorClass = colors[(idx * 3) % colors.length];
        
        return (
          <span 
            key={`${word}-${idx}`} 
            className={`${sizeClass} ${colorClass} font-black hover:scale-110 transition-transform cursor-default whitespace-nowrap px-2 py-1 rounded-xl bg-slate-50/50`}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
