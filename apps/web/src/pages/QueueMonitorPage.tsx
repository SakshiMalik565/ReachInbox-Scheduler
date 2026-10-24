import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  Layers,
  PauseCircle,
  PlayCircle
} from 'lucide-react';
import { api } from '../services/api';

export const QueueMonitorPage: React.FC = () => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['queueStats'],
    queryFn: api.health.getQueueStats,
    refetchInterval: 3000 // Poll every 3 seconds for live metrics
  });

  const counts = data?.counts || {
    waiting: 0,
    active: 0,
    delayed: 0,
    completed: 0,
    failed: 0,
    paused: 0
  };

  const statCards = [
    {
      title: 'Delayed Jobs',
      count: counts.delayed,
      description: 'Scheduled for future timestamp delivery',
      icon: Clock,
      color: 'indigo'
    },
    {
      title: 'Active Jobs',
      count: counts.active,
      description: 'Currently processing in worker pool',
      icon: Zap,
      color: 'amber'
    },
    {
      title: 'Waiting Jobs',
      count: counts.waiting,
      description: 'Ready for immediate worker pickup',
      icon: Layers,
      color: 'blue'
    },
    {
      title: 'Completed Jobs',
      count: counts.completed,
      description: 'Successfully dispatched via Ethereal SMTP',
      icon: CheckCircle2,
      color: 'emerald'
    },
    {
      title: 'Failed Jobs',
      count: counts.failed,
      description: 'Exhausted retry backoff or fatal error',
      icon: XCircle,
      color: 'rose'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Live BullMQ Queue Monitor</h2>
              {data?.isPaused ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  <PauseCircle className="w-3 h-3" /> Paused
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <PlayCircle className="w-3 h-3" /> Active
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Queue: <code className="text-indigo-600">{data?.queue || 'email-delivery-queue'}</code> • Backed by Redis persistence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>

          <a
            href="/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
          >
            <span>Open Bull Board</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs space-y-2 relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {card.title}
                </span>
                <Icon
                  className={`w-4 h-4 ${
                    card.color === 'indigo'
                      ? 'text-indigo-600'
                      : card.color === 'amber'
                      ? 'text-amber-500'
                      : card.color === 'blue'
                      ? 'text-blue-500'
                      : card.color === 'emerald'
                      ? 'text-emerald-500'
                      : 'text-rose-500'
                  }`}
                />
              </div>

              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {isLoading ? (
                  <div className="w-8 h-6 bg-slate-100 rounded-md animate-pulse" />
                ) : (
                  card.count
                )}
              </div>

              <p className="text-[11px] text-slate-400 leading-tight">{card.description}</p>
            </div>
          );
        })}
      </div>

      {/* Technical Overview & Architecture Callout */}
      <div className="bg-slate-900 text-slate-200 p-6 rounded-xl border border-slate-800 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>BullMQ Persistence & Worker Guarantees</span>
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          All email scheduling requests are backed by Redis delayed sorted sets (<code className="text-indigo-300">bull:email-delivery-queue:delayed</code>). When the worker or server processes restart, jobs remain safely persisted in Redis with their future timestamp preserved.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/60">
            <span className="font-semibold text-indigo-400 block mb-0.5">Crash Recovery</span>
            <span className="text-[11px] text-slate-400">
              The startup reconciliation engine checks PostgreSQL against Redis to re-enqueue any un-dispatched jobs.
            </span>
          </div>
          <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/60">
            <span className="font-semibold text-amber-400 block mb-0.5">Rate Limit Deferral</span>
            <span className="text-[11px] text-slate-400">
              When a sender hits their hourly limit, the job is atomically deferred to the next UTC hour window with order preservation.
            </span>
          </div>
          <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/60">
            <span className="font-semibold text-emerald-400 block mb-0.5">Worker Concurrency</span>
            <span className="text-[11px] text-slate-400">
              Worker concurrency operates in parallel while enforcing the minimum inter-email delay per sender.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
