import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  Send,
  Users,
  Search,
  Activity,
  LogOut,
  MailCheck,
  Radio
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user, slack, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { name: 'Scheduled Emails', to: '/scheduled', icon: CalendarClock },
    { name: 'Sent Emails', to: '/sent', icon: Send },
    { name: 'Senders', to: '/senders', icon: Users },
    { name: 'Email Search', to: '/search', icon: Search },
    { name: 'Queue Monitor', to: '/queues', icon: Activity },
    { name: 'Slack Integration', to: '/integrations', icon: Radio }
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800 z-30">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
          <MailCheck className="w-5 h-5" />
        </div>
        <div>
          <span className="font-bold text-white text-base tracking-tight">ReachInbox</span>
          <span className="block text-[10px] uppercase font-semibold tracking-wider text-indigo-400 -mt-0.5">Scheduler</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          Menu
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors group ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4 mr-3 flex-shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}

        {/* Integration Status Box */}
        <div className="pt-6 px-1">
          <div className="p-3 bg-slate-800/70 border border-slate-700/60 rounded-lg">
            <div className="flex items-center justify-between text-xs font-medium text-slate-300 mb-1.5">
              <span>Slack Live Alerts</span>
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  slack?.connected ? 'bg-emerald-400 ring-2 ring-emerald-400/30' : 'bg-slate-500'
                }`}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              {slack?.connected
                ? `Connected to ${slack.channelName || slack.teamName || 'Workspace'}`
                : 'Connect to receive hourly rate limit warnings.'}
            </p>
            {!slack?.connected && (
              <button
                onClick={() => navigate('/integrations')}
                className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium block"
              >
                Connect Slack →
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/90">
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40">
          <div className="flex items-center min-w-0 mr-2">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-8 h-8 rounded-full border border-slate-700 object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="ml-2.5 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.name || 'User'}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700/50 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
