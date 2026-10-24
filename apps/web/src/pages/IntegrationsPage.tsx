import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Radio,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Unlink,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

export const IntegrationsPage: React.FC = () => {
  const { slack, refetchUser } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const slackParam = searchParams.get('slack');
  const errorMsg = searchParams.get('msg');

  useEffect(() => {
    if (slackParam === 'connected') {
      showToast('success', 'Slack Connected', 'Your Slack workspace has been successfully connected!');
      refetchUser();
    } else if (slackParam === 'error') {
      showToast('error', 'Slack Connection Failed', errorMsg || 'OAuth authorization failed');
    }
  }, [slackParam, errorMsg, showToast, refetchUser]);

  const disconnectMutation = useMutation({
    mutationFn: api.slack.disconnect,
    onSuccess: () => {
      showToast('info', 'Slack Disconnected', 'Slack notifications have been disabled.');
      refetchUser();
    },
    onError: (err: any) => {
      showToast('error', 'Failed to Disconnect Slack', err.message);
    }
  });

  const handleConnectSlack = () => {
    window.location.href = '/api/slack/connect';
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Title Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Third-Party Integrations</h2>
            <p className="text-xs text-slate-500">
              Connect external services to receive real-time notifications and rate-limit warnings
            </p>
          </div>
        </div>
      </div>

      {/* Slack Integration Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#4A154B] flex items-center justify-center text-white flex-shrink-0 shadow-md">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">Slack Notifications</h3>
                  {slack?.connected ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                      <XCircle className="w-3.5 h-3.5 text-slate-400" />
                      Disconnected
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-lg leading-relaxed">
                  Automatically delivers an alert to your Slack channel when any sender exhausts their configured hourly limit. Includes sender address, active hour window, and deferral timeline.
                </p>
              </div>
            </div>

            <div className="flex-shrink-0">
              {slack?.connected ? (
                <button
                  onClick={() => {
                    if (window.confirm('Disconnect your Slack workspace?')) {
                      disconnectMutation.mutate();
                    }
                  }}
                  disabled={disconnectMutation.isPending}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Disconnect Slack</span>
                </button>
              ) : (
                <button
                  onClick={handleConnectSlack}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#4A154B] hover:bg-[#3f1240] rounded-lg shadow-sm transition-all transform active:scale-98"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Connect Slack</span>
                </button>
              )}
            </div>
          </div>

          {/* Connected Details */}
          {slack?.connected && (
            <div className="mt-5 p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1 text-xs text-emerald-950">
              <p>
                <span className="font-semibold">Team / Workspace:</span> {slack.teamName || 'Connected Workspace'}
              </p>
              <p>
                <span className="font-semibold">Alert Channel:</span> {slack.channelName || '#general'}
              </p>
              <p className="text-[11px] text-emerald-800 pt-1">
                Token is securely stored in PostgreSQL with AES-256-GCM encryption. Deduplication ensures at most one alert is sent per sender per hour window.
              </p>
            </div>
          )}
        </div>

        {/* Setup Documentation Footer */}
        <div className="bg-slate-50 p-6 border-t border-slate-200 text-xs text-slate-600 space-y-2">
          <h4 className="font-semibold text-slate-800 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>How Slack OAuth & Live Notifications Work</span>
          </h4>
          <ol className="list-decimal pl-5 space-y-1 text-slate-500 text-[11px] leading-relaxed">
            <li>
              User initiates OAuth by clicking <strong>Connect Slack</strong>.
            </li>
            <li>
              Slack prompts for authorization with requested bot scopes (<code className="text-slate-700">chat:write, channels:read, incoming-webhook</code>).
            </li>
            <li>
              Backend callback exchanges temporary authorization code for bot token, encrypts token with AES-256-GCM, and saves the connection.
            </li>
            <li>
              When a sender reaches their hourly rate limit, the BullMQ worker triggers <code className="text-slate-700">SlackService.sendRateLimitAlert</code>, checking Redis for 1-hour deduplication before posting.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
