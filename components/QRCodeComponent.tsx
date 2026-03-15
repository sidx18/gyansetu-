
import React from 'react';

interface QRCodeComponentProps {
  value: string;
  size?: number;
}

export const QRCodeComponent: React.FC<QRCodeComponentProps> = ({ value, size }) => {
  // Use a display size that fills its container up to 1000px
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(value)}&ecc=H&margin=2`;

  return (
    <div className="flex flex-col items-center bg-white p-4 md:p-6 rounded-[2rem] shadow-2xl border-2 border-slate-100 w-full max-w-full">
      <div className="relative p-2 bg-gradient-to-br from-slate-50 to-white rounded-2xl shadow-inner border border-slate-100 w-full flex justify-center overflow-hidden">
        <img 
          src={qrUrl} 
          alt="Classroom QR Code" 
          className="rounded-xl mix-blend-multiply w-full h-auto max-w-[500px]" 
          style={size ? { maxWidth: `${size}px` } : {}}
          loading="lazy"
        />
      </div>
      <div className="mt-4 md:mt-6 flex flex-col items-center gap-1 md:gap-2">
        <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] md:tracking-[0.3em]">Institutional Access</p>
        <p className="text-xs md:text-sm font-black text-indigo-600 bg-indigo-50 px-3 py-1 md:px-4 md:py-1.5 rounded-full border border-indigo-100 text-center">Scan to join current Session</p>
      </div>
    </div>
  );
};
