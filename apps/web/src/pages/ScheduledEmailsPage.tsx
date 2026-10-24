import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import {
  CalendarClock,
  Clock,
  Trash2,
  AlertCircle,
  RefreshCw,
  Plus
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

export const ScheduledEmailsPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { onOpenCompose } = useOutletContext<{ onOpenCompose: () => void }>();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['emails', 'scheduled', page],
    queryFn: () => api.emails.getScheduled(page, 15),
    staleTime: 10000
  });

  const cancelMutation = useMutation({
    mutationFn: api.emails.cancel,
    onSuccess: (res) => {
      showToast('success', 'Email Cancelled', res.message);
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['queueStats'] });
    },
    onError: (err: any) => {
      showToast('error', 'Cancellation Failed', err.message);
    }
  });

  const emails = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Scheduled Queue</h2>
            <p className="text-xs text-slate-500">
              {total} email{total === 1 ? '' : 's'} waiting for BullMQ delayed delivery
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
          <button
            onClick={onOpenCompose}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule New</span>
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading scheduled emails from PostgreSQL...</p>
          </div>
        ) : isError ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-xs text-rose-600 font-semibold">Failed to fetch scheduled emails</p>
            <p className="text-xs text-slate-500">{(error as any)?.message}</p>
            <button
              onClick={() => refetch()}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
            >
              Retry
            </button>
          </div>
        ) : emails.length === 0 ? (
          <div className="p-16 text-center space-y-4">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">No scheduled emails in queue</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Schedule a single email or upload a CSV lead list to view upcoming dispatches here.
              </p>
            </div>
            <button
              onClick={onOpenCompose}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Compose First Email</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Recipient</th>
                  <th className="px-6 py-3.5">Subject</th>
                  <th className="px-6 py-3.5">Sender</th>
                  <th className="px-6 py-3.5">Scheduled Delivery</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {emails.map((email) => {
                  const isProcessing = email.status === 'PROCESSING';
                  const date = new Date(email.scheduledTime);

                  return (
                    <tr key={email.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {email.recipient}
                      </td>
                      <td className="px-6 py-4 text-slate-600 max-w-xs truncate" title={email.subject}>
                        {email.subject}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        <span className="font-medium text-slate-700">{email.sender?.displayName || 'Sender'}</span>
                        <span className="block text-[11px] text-slate-400">{email.sender?.email}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                        <span className="font-medium">{date.toLocaleDateString()}</span>
                        <span className="block text-[11px] text-slate-400">{date.toLocaleTimeString()}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            isProcessing
                              ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {isProcessing ? 'PROCESSING' : 'SCHEDULED'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            if (window.confirm(`Cancel scheduled email to ${email.recipient}?`)) {
                              cancelMutation.mutate(email.id);
                            }
                          }}
                          disabled={cancelMutation.isPending || isProcessing}
                          title="Cancel dispatch"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
