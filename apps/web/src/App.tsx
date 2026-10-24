import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { ScheduledEmailsPage } from './pages/ScheduledEmailsPage';
import { SentEmailsPage } from './pages/SentEmailsPage';
import { SendersPage } from './pages/SendersPage';
import { SearchPage } from './pages/SearchPage';
import { QueueMonitorPage } from './pages/QueueMonitorPage';
import { IntegrationsPage } from './pages/IntegrationsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Login Route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected Dashboard Routes */}
              <Route path="/" element={<DashboardLayout />}>
                <Route index element={<Navigate to="/scheduled" replace />} />
                <Route path="dashboard" element={<Navigate to="/scheduled" replace />} />
                <Route path="scheduled" element={<ScheduledEmailsPage />} />
                <Route path="sent" element={<SentEmailsPage />} />
                <Route path="senders" element={<SendersPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="queues" element={<QueueMonitorPage />} />
                <Route path="integrations" element={<IntegrationsPage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/scheduled" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
