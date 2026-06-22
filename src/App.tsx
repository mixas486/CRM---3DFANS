/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { ContactsPage } from './pages/Contacts';
import { Pipeline } from './pages/Pipeline';
import { Campaigns } from './pages/Campaigns';
import { InboxPage } from './pages/Inbox';
import { Settings } from './pages/Settings';
import { Dashboard } from './pages/Dashboard';
import { AIControl } from './pages/AIControl';
import { AIAgentConfig } from './pages/AIAgentConfig';
import PreviewsPage from './pages/admin/Previews';
import AIUsagePage from './pages/admin/AIUsage';
import ClientInsights from './pages/admin/ClientInsights';
import SystemLogs from './pages/admin/SystemLogs';
import Orcamentos from './pages/Orcamentos';
import Analytics from './pages/Analytics';
import AIPreview from './pages/AIPreview';
import { Permissions } from './pages/Permissions';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/ai" element={<AIControl />} />
              <Route path="/admin/ai-agent" element={<AIAgentConfig />} />
              <Route path="/admin/previews" element={<PreviewsPage />} />
              <Route path="/admin/ai-usage" element={<AIUsagePage />} />
              <Route path="/admin/insights" element={<ClientInsights />} />
              <Route path="/admin/logs" element={<SystemLogs />} />
              <Route path="/orcamentos" element={<Orcamentos />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/ai-preview" element={<AIPreview />} />
              <Route path="/permissions" element={<ProtectedRoute requireAdmin><Permissions /></ProtectedRoute>} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
