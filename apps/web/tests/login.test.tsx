import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/app/App.js";

function createJsonResponse(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json"
      }
    })
  );
}

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
  vi.restoreAllMocks();
});

describe("agent workspace auth", () => {
  it("shows validation error when token is missing", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("connect-button"));

    expect(screen.getByRole("alert").textContent).toBe("⚠️ 请输入访问令牌");
  });

  it("connects and renders navigation without localStorage persistence", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const requestUrl = typeof input === "string" ? input : input.toString();
      if (requestUrl.startsWith("/api/auth/check")) {
        return createJsonResponse(200, { ok: true, authorized: true });
      }

      return Promise.reject(new Error(`Unhandled fetch URL: ${requestUrl}`));
    });

    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("agent-workspace-title")).toBeTruthy();
    expect(window.location.pathname).toBe("/dashboard");
    expect(await screen.findByTestId("agent-list-placeholder")).toBeTruthy();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("daemonToken")).toBeNull();

    setItemSpy.mockRestore();
  });
});
