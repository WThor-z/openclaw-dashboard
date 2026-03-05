import React, { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../app/auth.js";

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setError("Token is required");
      return;
    }

    signIn(normalizedToken);
    setError(null);
    navigate("/dashboard");
  }

  return (
    <main>
      <h1>OpenClaw Dashboard</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="daemon-token-input">Daemon token</label>
        <input
          id="daemon-token-input"
          data-testid="daemon-token-input"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <button data-testid="connect-button" type="submit">
          Connect
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
