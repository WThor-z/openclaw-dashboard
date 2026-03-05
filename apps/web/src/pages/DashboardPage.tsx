import React from "react";
import { useAuth } from "../app/auth.js";

const MODULE_NAV = [
  { id: "events", label: "Events" },
  { id: "tasks", label: "Tasks" },
  { id: "approvals", label: "Approvals" },
  { id: "config", label: "Config" },
  { id: "costs", label: "Costs" },
  { id: "sessions", label: "Sessions" },
  { id: "webhooks", label: "Webhooks" },
  { id: "monitoring", label: "Monitoring" }
];

export function DashboardPage() {
  const { signOut } = useAuth();

  return (
    <main>
      <header>
        <h1>Control Plane</h1>
        <button onClick={signOut} type="button">
          Sign out
        </button>
      </header>
      <nav aria-label="Dashboard modules">
        <ul>
          {MODULE_NAV.map((entry) => (
            <li key={entry.id}>
              <a data-testid={`nav-${entry.id}`} href="#" onClick={(event) => event.preventDefault()}>
                {entry.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
