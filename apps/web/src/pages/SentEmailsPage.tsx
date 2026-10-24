import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Send,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Ban
} from 'lucide-react';
import { api } from '../services/api';

export const SentEmailsPage: React.FC = () => {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['emails', 'sent', page],
    queryFn: () => api.emails.getSent(page, 15),
    staleTime: 10000
  });

  const emails = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Sent & Dispatched History</h2>
            <p className="text-xs text-slate-500">
              {total} email record{total === 1 ? '' : 's'} (Sent, Failed, or Cancelled)
            </p>
          </div>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-emerald-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading delivery logs from PostgreSQL...</p>
          </div>
        ) : isError ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-xs text-rose-600 font-semibold">Failed to fetch email history</p>
            <p className="text-xs text-slate-500">{(error as any)?.message}</p>
            <button
              onClick={() => refetch()}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
            >
              Retry
            </button>
          </div>
        ) : emails.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <Send className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No sent emails recorded yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Once scheduled emails reach their dispatch time and worker dispatches them via SMTP, their status and Ethereal preview links appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Recipient</th>
                  <th className="px-6 py-3.5">Subject</th>
                  <th className="px-6 py-3.5">Sender</th>
                  <th className="px-6 py-3.5">Sent / Dispatched At</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Ethereal Preview / Error Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {emails.map((email) => {
                  const isSent = email.status === 'SENT';
                  const isFailed = email.status === 'FAILED';
                  const isCancelled = email.status === 'CANCELLED';
                  const timestamp = email.actualSentTime
                    ? new Date(email.actualSentTime)
                    : new Date(email.updatedAt);

                  return (
                    <tr key={email.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{email.recipient}</td>
                      <td className="px-6 py-4 text-slate-600 max-w-xs truncate" title={email.subject}>
                        {email.subject}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        <span className="font-medium text-slate-700">{email.sender?.displayName || 'Sender'}</span>
                        <span className="block text-[11px] text-slate-400">{email.sender?.email}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                        <span className="font-medium">{timestamp.toLocaleDateString()}</span>
                        <span className="block text-[11px] text-slate-400">{timestamp.toLocaleTimeString()}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isSent && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>SENT</span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>FAILED</span>
                          </span>
                        )}
                        {isCancelled && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <Ban className="w-3 h-3 text-slate-500" />
                            <span>CANCELLED</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {email.etherealPreviewUrl ? (
                          <a
                            href={email.etherealPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors"
                          >
                            <span>View in Ethereal</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : email.lastError ? (
                          <span
                            className="text-xs text-rose-600 font-mono truncate max-w-xs block cursor-help"
                            title={email.lastError}
                          >
                            {email.lastError}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
