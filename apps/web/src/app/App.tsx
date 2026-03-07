import React, { type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AgentWorkspacePage } from "../pages/AgentWorkspacePage.js";
import { AgentWorkspaceBrowserPage } from "../pages/AgentWorkspaceBrowserPage.js";
import { AgentWorkspacePinnedFilesPage } from "../pages/AgentWorkspacePinnedFilesPage.js";
import { LoginPage } from "../pages/LoginPage.js";
import { AuthProvider, useAuth } from "./auth.js";
import { I18nProvider } from "./i18n.js";

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
            <Route element={<RootRedirect />} path="*" />
          </Routes>
        </BrowserRouter>
      </I18nProvider>
    </AuthProvider>
  );
}
