import React, { type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "../domains/auth/pages/LoginPage.js";
import { AgentRuntimeConversationPage } from "../domains/agent-runtime/pages/AgentRuntimeConversationPage.js";
import { AgentRuntimePage } from "../domains/agent-runtime/pages/AgentRuntimePage.js";
import { AgentWorkspaceBrowserPage } from "../domains/agent-workspace/pages/AgentWorkspaceBrowserPage.js";
import { AgentWorkspacePage } from "../domains/agent-workspace/pages/AgentWorkspacePage.js";
import { AgentWorkspacePinnedFilesPage } from "../domains/agent-workspace/pages/AgentWorkspacePinnedFilesPage.js";
import { AuthProvider, useAuth } from "./auth.js";
import { I18nProvider } from "./i18n.js";
import { ThemeProvider } from "./theme.js";

function RootRedirect() {
  const { token } = useAuth();
  return <Navigate replace to={token ? "/dashboard" : "/login"} />;
}

function LoginRoute() {
  const { token } = useAuth();
  if (token) {
    return <Navigate replace to="/dashboard" />;
  }

  return <LoginPage />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate replace to="/login" />;
  }

  return children;
}

export function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <I18nProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<RootRedirect />} path="/" />
              <Route element={<LoginRoute />} path="/login" />
              <Route
                element={
                  <ProtectedRoute>
                    <AgentWorkspacePage />
                  </ProtectedRoute>
                }
                path="/dashboard"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <AgentWorkspaceBrowserPage />
                  </ProtectedRoute>
                }
                path="/agents/:agentId/workspace"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <AgentWorkspacePinnedFilesPage />
                  </ProtectedRoute>
                }
                path="/agents/:agentId/pinned-files"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <AgentWorkspacePinnedFilesPage />
                  </ProtectedRoute>
                }
                path="/agents/:agentId/quick-notes"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <AgentRuntimePage />
                  </ProtectedRoute>
                }
                path="/agents/:agentId/runtime"
              />
              <Route
                element={
                  <ProtectedRoute>
                    <AgentRuntimeConversationPage />
                  </ProtectedRoute>
                }
                path="/agents/:agentId/runtime/conversations/:conversationId"
              />
              <Route element={<RootRedirect />} path="*" />
            </Routes>
          </BrowserRouter>
        </I18nProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
