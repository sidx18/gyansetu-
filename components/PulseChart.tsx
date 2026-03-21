
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Feedback } from '../types';

interface PulseChartProps {
  feedbacks: Feedback[];
}

export const PulseChart: React.FC<PulseChartProps> = ({ feedbacks }) => {
  const data = [
    { name: '1 (Lost)', value: feedbacks.filter(f => f.rating === 1).length, color: '#ef4444' },
    { name: '2 (Confused)', value: feedbacks.filter(f => f.rating === 2).length, color: '#f97316' },
    { name: '3 (Getting it)', value: feedbacks.filter(f => f.rating === 3).length, color: '#eab308' },
    { name: '4 (Solid)', value: feedbacks.filter(f => f.rating === 4).length, color: '#84cc16' },
    { name: '5 (Expert)', value: feedbacks.filter(f => f.rating === 5).length, color: '#22c55e' },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip 
            cursor={{ fill: '#f1f5f9' }}
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
