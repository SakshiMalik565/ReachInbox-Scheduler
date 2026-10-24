import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import {
  X,
  Send,
  Upload,
  Calendar,
  Clock,
  Gauge,
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Eye
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mode: 'single' | 'bulk'
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [showPreview, setShowPreview] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form State
  const [senderId, setSenderId] = useState('');
  const [singleRecipient, setSingleRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Default scheduled time: now + 5 minutes
  const getDefaultScheduledTime = () => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const [scheduledTime, setScheduledTime] = useState(getDefaultScheduledTime());
  const [minDelayMs, setMinDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(100);

  // Bulk CSV state
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [validEmails, setValidEmails] = useState<string[]>([]);
  const [invalidRows, setInvalidRows] = useState<Array<{ raw: string; reason: string }>>([]);

  // Fetch senders
  const { data: sendersData } = useQuery({
    queryKey: ['senders'],
    queryFn: api.senders.list,
    enabled: isOpen
  });

  const senders = sendersData?.data || [];
  const selectedSender = senders.find((s) => s.id === senderId) || senders[0];

  // Auto-select first sender
  React.useEffect(() => {
    if (senders.length > 0 && !senderId) {
      setSenderId(senders[0].id);
      if (senders[0].hourlyLimit) {
        setHourlyLimit(senders[0].hourlyLimit);
      }
    }
  }, [senders, senderId]);

  // CSV Parsing
  const handleFileUpload = (file: File) => {
    setCsvFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedValid: string[] = [];
        const parsedInvalid: Array<{ raw: string; reason: string }> = [];
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        const data = results.data as Array<Record<string, any>>;

        data.forEach((row, index) => {
          // Look for keys like email, Email, recipient, to, etc.
          let foundEmail = '';
          for (const key of Object.keys(row)) {
            const lowerKey = key.toLowerCase();
            if (['email', 'recipient', 'to', 'mail', 'lead_email'].includes(lowerKey)) {
              foundEmail = String(row[key] || '').trim();
              break;
            }
          }

          // Fallback: search values for '@'
          if (!foundEmail) {
            for (const val of Object.values(row)) {
              if (typeof val === 'string' && val.includes('@')) {
                foundEmail = val.trim();
                break;
              }
            }
          }

          if (!foundEmail) {
            parsedInvalid.push({
              raw: `Row ${index + 1}: ${JSON.stringify(row).slice(0, 40)}`,
              reason: 'No email column or valid email found in row'
            });
          } else if (!emailRegex.test(foundEmail)) {
            parsedInvalid.push({
              raw: foundEmail,
              reason: 'Malformed email syntax'
            });
          } else {
            parsedValid.push(foundEmail);
          }
        });

        // Deduplicate valid emails
        const uniqueValid = Array.from(new Set(parsedValid));
        setValidEmails(uniqueValid);
        setInvalidRows(parsedInvalid);
      },
      error: (err) => {
        showToast('error', 'CSV Parsing Failed', err.message);
      }
    });
  };

  // Schedule Single Mutation
  const singleMutation = useMutation({
    mutationFn: api.emails.schedule,
    onSuccess: (res) => {
      showToast(
        'success',
        'Email Scheduled',
        `Email scheduled for delivery to ${res.data.recipient}`
      );
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['queueStats'] });
      onClose();
    },
    onError: (err: any) => {
      showToast('error', 'Failed to Schedule Email', err.message);
    }
  });

  // Schedule Bulk Mutation
  const bulkMutation = useMutation({
    mutationFn: api.emails.scheduleBulk,
    onSuccess: (res) => {
      showToast(
        'success',
        'Bulk Scheduling Complete',
        `Successfully enqueued ${res.acceptedCount} emails. (${res.rejectedCount} rejected)`
      );
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['queueStats'] });
      onClose();
    },
    onError: (err: any) => {
      showToast('error', 'Failed to Schedule Bulk Emails', err.message);
    }
  });

  const isSubmitting = singleMutation.isPending || bulkMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!senderId) {
      showToast('error', 'Sender Required', 'Please select a sender profile');
      return;
    }

    if (!subject.trim()) {
      showToast('error', 'Subject Required', 'Please provide an email subject');
      return;
    }

    if (!body.trim()) {
      showToast('error', 'Body Required', 'Please provide an email body');
      return;
    }

    const isoScheduledTime = new Date(scheduledTime).toISOString();

    if (mode === 'single') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!singleRecipient.trim() || !emailRegex.test(singleRecipient.trim())) {
        showToast('error', 'Invalid Recipient', 'Please enter a valid recipient email');
        return;
      }

      singleMutation.mutate({
        senderId,
        recipient: singleRecipient.trim(),
        subject: subject.trim(),
        body: body.trim(),
        scheduledTime: isoScheduledTime,
        minDelayMs: Number(minDelayMs),
        hourlyLimit: Number(hourlyLimit)
      });
    } else {
      if (validEmails.length === 0) {
        showToast('error', 'No Recipients', 'Please upload a CSV file with valid recipient emails');
        return;
      }

      bulkMutation.mutate({
        senderId,
        subject: subject.trim(),
        body: body.trim(),
        recipients: validEmails,
        scheduledTime: isoScheduledTime,
        minDelayMs: Number(minDelayMs),
        hourlyLimit: Number(hourlyLimit)
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-8">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Schedule Email Dispatch</h2>
            <p className="text-xs text-slate-500">Configure queue timing, lead recipients, and rate limits</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-200 px-6 pt-3 bg-white gap-6">
          <button
            type="button"
            onClick={() => {
              setMode('single');
              setShowPreview(false);
            }}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors ${
              mode === 'single'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Single Recipient
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('bulk');
              setShowPreview(false);
            }}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              mode === 'bulk'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Bulk CSV Leads</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Sender Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              From Sender Profile <span className="text-rose-500">*</span>
            </label>
            <select
              value={senderId}
              onChange={(e) => {
                setSenderId(e.target.value);
                const s = senders.find((item) => item.id === e.target.value);
                if (s?.hourlyLimit) setHourlyLimit(s.hourlyLimit);
              }}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName} ({s.email}) — limit: {s.hourlyLimit}/hr
                </option>
              ))}
            </select>
          </div>

          {/* Mode Specific: Single or Bulk */}
          {mode === 'single' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Recipient Email <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                placeholder="recipient@example.com"
                value={singleRecipient}
                onChange={(e) => setSingleRecipient(e.target.value)}
                required
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Upload Leads CSV File <span className="text-rose-500">*</span>
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-5 text-center cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors"
              >
                <Upload className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-700">
                  {csvFileName ? (
                    <span className="text-indigo-600 font-semibold">{csvFileName}</span>
                  ) : (
                    'Click to upload or drag & drop a CSV file'
                  )}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Columns supported: email, recipient, to, lead_email</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                  }}
                />
              </div>

              {/* Validation Badges */}
              {(validEmails.length > 0 || invalidRows.length > 0) && (
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    <span>{validEmails.length} valid recipients</span>
                  </div>
                  {invalidRows.length > 0 && (
                    <div className="flex items-center text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
                      <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                      <span>{invalidRows.length} invalid rows rejected</span>
                    </div>
                  )}
                </div>
              )}

              {/* Rejected Rows Details Collapsible */}
              {invalidRows.length > 0 && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-amber-900 max-h-24 overflow-y-auto">
                  <span className="font-semibold block mb-1">Rejected entries:</span>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {invalidRows.slice(0, 5).map((row, idx) => (
                      <li key={idx}>
                        <code>{row.raw}</code> — {row.reason}
                      </li>
                    ))}
                    {invalidRows.length > 5 && <li>...and {invalidRows.length - 5} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Subject & Body */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Subject <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Exciting update regarding your ReachInbox campaign..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Body (HTML or Plain Text) <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              placeholder="Hi there,<br><br>We would love to share a preview of our email dispatching system..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </div>

          {/* Scheduled Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Scheduled Send Time</span>
              </label>
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                required
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Rate Limiting & Delays</span>
                </span>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Advanced Rate Limit & Delay Overrides */}
          {showAdvanced && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Min Delay Between Emails (ms)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={minDelayMs}
                    onChange={(e) => setMinDelayMs(Number(e.target.value))}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Enforced per sender across concurrent workers</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-slate-500" />
                    <span>Sender Hourly Limit</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={hourlyLimit}
                    onChange={(e) => setHourlyLimit(Number(e.target.value))}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 bg-white"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Triggers Slack notification & next-hour deferral</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview Mode */}
          {showPreview && (
            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
              <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wide flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-indigo-600" />
                <span>Dispatch Summary Preview</span>
              </h4>
              <div className="text-xs text-indigo-900 space-y-1">
                <p>
                  <span className="font-semibold">From:</span> {selectedSender?.displayName} ({selectedSender?.email})
                </p>
                <p>
                  <span className="font-semibold">Recipients:</span>{' '}
                  {mode === 'single' ? singleRecipient : `${validEmails.length} lead recipients`}
                </p>
                <p>
                  <span className="font-semibold">Scheduled Date:</span>{' '}
                  {new Date(scheduledTime).toLocaleString()}
                </p>
                <p>
                  <span className="font-semibold">Delay & Limit:</span> {minDelayMs}ms send delay | {hourlyLimit} emails/hour cap
                </p>
                <p>
                  <span className="font-semibold">Subject:</span> {subject}
                </p>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 px-2 py-1"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{showPreview ? 'Hide Preview' : 'Preview Details'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm shadow-indigo-600/20 flex items-center gap-1.5 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Enqueueing...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Confirm & Schedule</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
