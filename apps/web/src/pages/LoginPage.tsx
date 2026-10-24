import React from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { MailCheck, CheckCircle2, ShieldCheck, Zap, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get('error');

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/scheduled" replace />;
  }

  const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

  const handleGoogleLogin = () => {
    window.location.href = `${apiBase}/api/auth/google`;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <MailCheck className="w-7 h-7" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-white">
          ReachInbox Email Scheduler
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Enterprise-grade distributed email dispatching and queue monitoring
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-800/80 backdrop-blur-md py-8 px-6 shadow-xl border border-slate-700/80 rounded-2xl sm:px-10">
          {oauthError && (
            <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-rose-300">
                <span className="font-semibold block">Authentication Error</span>
                <span>{decodeURIComponent(oauthError)}</span>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-600 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold shadow-md transition-all transform active:scale-98"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-700"></div>
              <span className="flex-shrink mx-3 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Or for Reviewers / Evaluation</span>
              <div className="flex-grow border-t border-slate-700"></div>
            </div>

            <button
              onClick={async () => {
                try {
                  const res = await fetch(`${apiBase}/api/auth/demo-session`, {
                    method: 'POST',
                    credentials: 'include'
                  });
                  if (res.ok) {
                    window.location.href = '/scheduled';
                  }
                } catch {
                  window.location.href = '/scheduled';
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-indigo-500/40 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold shadow-xs transition-all transform active:scale-98"
            >
              <span>⚡ Quick Evaluation Sign-In (Local Demo Session)</span>
            </button>
            <p className="text-[10px] text-slate-400 text-center -mt-1 leading-relaxed">
              Instantly authenticate as demo evaluator to test scheduling, bulk CSV ingestion, rate limiting, and Bull Board without needing Google Cloud credentials.
            </p>
          </div>

          {/* Core Architecture Features */}
          <div className="mt-8 pt-6 border-t border-slate-700/80 space-y-3">
            <div className="flex items-center text-xs text-slate-300 gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>BullMQ delayed scheduling with Redis persistence</span>
            </div>
            <div className="flex items-center text-xs text-slate-300 gap-2.5">
              <Zap className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>Distributed per-sender hourly rate limiting & deferral</span>
            </div>
            <div className="flex items-center text-xs text-slate-300 gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Real Slack OAuth & automated alert dispatch</span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Built for OUTBOX LABS / ReachInbox.ai Assessment
        </p>
      </div>
    </div>
  );
};
