import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { ComposeModal } from '../components/ComposeModal';
import { useAuth } from '../context/AuthContext';

export const DashboardLayout: React.FC<{ title?: string; subtitle?: string }> = ({
  title = 'Email Scheduling Dashboard',
  subtitle = 'Manage automated email dispatches, rate limits, and delivery queues'
}) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-3 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Authenticating ReachInbox session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        <Header
          title={title}
          subtitle={subtitle}
          onOpenCompose={() => setIsComposeOpen(true)}
        />

        <main className="flex-1 p-8 overflow-y-auto">
          <Outlet context={{ onOpenCompose: () => setIsComposeOpen(true) }} />
        </main>
      </div>

      {/* Compose Email Modal */}
      <ComposeModal isOpen={isComposeOpen} onClose={() => setIsComposeOpen(false)} />
    </div>
  );
};
