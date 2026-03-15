
import React from 'react';

interface SentimentMeterProps {
  score: number; // 0 to 100
}

export const SentimentMeter: React.FC<SentimentMeterProps> = ({ score }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s < 40) return '#ef4444'; // Red
    if (s < 70) return '#f97316'; // Orange
    return '#22c55e'; // Green
  };

  const getLabel = (s: number) => {
    if (s < 40) return 'Frustrated';
    if (s < 70) return 'Managing';
    return 'Confident';
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke="#f1f5f9"
            strokeWidth="8"
            fill="transparent"
          />
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke={getColor(score)}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 1s ease-out' }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-slate-800">{Math.round(score)}%</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Class Confidence</p>
      <p className="font-bold text-slate-700">{getLabel(score)}</p>
    </div>
  );
};
