import React from 'react';
import { Plus, Search, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onOpenCompose: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, onOpenCompose }) => {
  const navigate = useNavigate();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-20 shadow-xs">
      <div>
        <h1 className="text-lg font-bold text-slate-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>

      <div className="flex items-center space-x-3">
        {/* Quick Search Button */}
        <button
          onClick={() => navigate('/search')}
          className="flex items-center px-3 py-1.5 text-xs text-slate-500 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors border border-slate-200/60"
        >
          <Search className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
          <span>Search emails...</span>
        </button>

        {/* Live Bull Board Link */}
        <a
          href={`${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/admin/queues`}
          target="_blank"
          rel="noreferrer"
          className="hidden md:flex items-center px-3 py-1.5 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/60 rounded-lg transition-colors font-medium"
        >
          <span>BullMQ Board</span>
          <ExternalLink className="w-3 h-3 ml-1" />
        </a>

        {/* Compose Button */}
        <button
          onClick={onOpenCompose}
          className="flex items-center px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-600/20 transition-all transform active:scale-95"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          <span>Compose Email</span>
        </button>
      </div>
    </header>
  );
};
