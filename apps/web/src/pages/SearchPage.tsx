import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Database, Calendar, Mail, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { api } from '../services/api';

export const SearchPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Handle submit or live query
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(searchTerm);
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', debouncedQuery, statusFilter],
    queryFn: () =>
      api.search.searchEmails({
        q: debouncedQuery || undefined,
        status: statusFilter || undefined,
        limit: 25
      })
  });

  const results = data?.data || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-6">
      {/* Search Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Elasticsearch Email Index</h2>
            <p className="text-xs text-slate-500">
              Full-text fuzzy search across recipients, subjects, body content, and senders
            </p>
          </div>
        </div>

        {/* Search Bar & Filters */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by keyword, recipient email, subject line, or body text..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 focus:bg-white"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PROCESSING">Processing</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <button
              type="submit"
              disabled={isFetching}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>
        </form>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Found <strong className="text-slate-800">{total}</strong> match{total === 1 ? '' : 'es'} in index
        </span>
        {isFetching && <span className="text-indigo-600 animate-pulse font-medium">Querying cluster...</span>}
      </div>

      {/* Results List */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-8 h-8 border-3 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500">Querying Elasticsearch cluster...</p>
        </div>
      ) : results.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-xl border border-slate-200 space-y-2">
          <Mail className="w-8 h-8 text-slate-400 mx-auto mb-1" />
          <h3 className="text-sm font-semibold text-slate-800">No emails matched your search criteria</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search keywords or clearing the status filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((email: any) => {
            const isSent = email.status === 'SENT';
            const isFailed = email.status === 'FAILED';
            const isScheduled = email.status === 'SCHEDULED' || email.status === 'PROCESSING';

            return (
              <div
                key={email.id}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-indigo-200 transition-all space-y-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{email.subject}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      To: <span className="font-semibold text-slate-700">{email.recipient}</span> • From:{' '}
                      <span className="text-slate-600">{email.senderEmail || email.sender?.email}</span>
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${
                      isSent
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : isFailed
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : isScheduled
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isSent && <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {isFailed && <XCircle className="w-3 h-3 mr-1" />}
                    {isScheduled && <Clock className="w-3 h-3 mr-1" />}
                    {email.status}
                  </span>
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-sans">
                  {email.body?.replace(/<[^>]*>?/gm, '')}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      Scheduled:{' '}
                      {email.scheduledTime ? new Date(email.scheduledTime).toLocaleString() : 'N/A'}
                    </span>
                  </span>
                  <span>ID: {email.id}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
