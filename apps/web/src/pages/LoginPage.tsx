import React, { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth.js";
import { LanguageSwitch, useI18n } from "../app/i18n.js";

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const { locale } = useI18n();

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark";
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) {
      setTheme("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  };

  return (
    <button 
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={
        theme === "light"
          ? (locale === "zh-CN" ? "切换到暗色模式" : "Switch to dark mode")
          : (locale === "zh-CN" ? "切换到亮色模式" : "Switch to light mode")
      }
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark";
    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setError(t("login.error.tokenRequired"));
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/check", {
        headers: {
          authorization: `Bearer ${normalizedToken}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError(t("login.error.invalidToken"));
        } else {
          setError(t("login.error.verifyFailed"));
        }
        return;
      }

      const body = (await response.json()) as { ok?: boolean; authorized?: boolean };
      if (!body.ok || !body.authorized) {
        setError(t("login.error.invalidToken"));
        return;
      }

      signIn(normalizedToken);
      navigate("/dashboard");
    } catch {
      setError(t("login.error.daemonUnavailable"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">
            <div className="login-logo-icon">OC</div>
            <h1>OpenClaw Dashboard</h1>
          </div>
          <p className="login-subtitle">{t("login.subtitle")}</p>
          <div className="login-controls">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="daemon-token-input" className="form-label">
              {t("login.tokenLabel")}
            </label>
            <input
              id="daemon-token-input"
              data-testid="daemon-token-input"
              type="password"
              className={`input ${error ? "input-error" : ""}`}
              placeholder={t("login.tokenPlaceholder")}
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setError(null);
              }}
              disabled={isLoading}
            />
            <span className="form-hint">
              {t("login.tokenHint")}
            </span>
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              <span>⚠️ {error}</span>
            </div>
          )}

          <button 
            data-testid="connect-button" 
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={isLoading}
            style={{ width: "100%" }}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner">⏳</span>
                {t("login.connecting")}
              </>
            ) : (
              t("login.enterConsole")
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>OpenClaw Dashboard v0.1.0</p>
          <p className="text-muted">{t("login.footer.tagline")}</p>
        </div>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-6);
          background: linear-gradient(135deg, var(--color-bg-secondary) 0%, var(--color-bg-tertiary) 100%);
        }

        .login-container {
          width: 100%;
          max-width: 420px;
          background-color: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-xl);
          padding: var(--space-8);
        }

        .login-header {
          text-align: center;
          margin-bottom: var(--space-8);
          position: relative;
        }

        .login-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-4);
        }

        .login-logo-icon {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-700));
          border-radius: var(--radius-xl);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: var(--text-2xl);
          font-weight: var(--font-bold);
          box-shadow: var(--shadow-lg);
        }

        .login-header h1 {
          font-size: var(--text-2xl);
          font-weight: var(--font-bold);
          color: var(--color-text-primary);
          margin: 0;
        }

        .login-subtitle {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          margin-top: var(--space-2);
        }

        .login-controls {
          position: absolute;
          top: 0;
          right: 0;
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }

        .loading-spinner {
          display: inline-block;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .login-footer {
          margin-top: var(--space-8);
          text-align: center;
          padding-top: var(--space-6);
          border-top: 1px solid var(--color-border);
        }

        .login-footer p {
          margin: 0;
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
        }

        .login-footer .text-muted {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          margin-top: var(--space-1);
        }

        @media (max-width: 480px) {
          .login-page {
            padding: var(--space-4);
          }
          
          .login-container {
            padding: var(--space-6);
          }
        }
      `}</style>
    </div>
  );
}
