import React, { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth.js";
import { ThemeSwitch } from "../app/theme.js";

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setError("请输入访问令牌");
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
          setError("访问令牌无效，请检查后重试");
        } else {
          setError("令牌验证失败，请稍后重试");
        }
        return;
      }

      const body = (await response.json()) as { ok?: boolean; authorized?: boolean };
      if (!body.ok || !body.authorized) {
        setError("访问令牌无效，请检查后重试");
        return;
      }

      signIn(normalizedToken);
      navigate("/dashboard");
    } catch {
      setError("无法验证访问令牌，请确认 daemon 已启动");
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
          <p className="login-subtitle">本地优先的 AI 代理控制面板</p>
          <div className="login-controls">
            <ThemeSwitch className="theme-toggle" />
          </div>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="daemon-token-input" className="form-label">
              访问令牌
            </label>
            <input
              id="daemon-token-input"
              data-testid="daemon-token-input"
              type="password"
              className={`input ${error ? "input-error" : ""}`}
              placeholder="输入您的访问令牌..."
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setError(null);
              }}
              disabled={isLoading}
            />
            <span className="form-hint">
              令牌通常由管理员提供，用于验证您的身份
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
                连接中...
              </>
            ) : (
              "进入控制台"
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>OpenClaw Dashboard v0.1.0</p>
          <p className="text-muted">本地优先 · 安全可控 · 开源免费</p>
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
