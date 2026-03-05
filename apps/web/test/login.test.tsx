import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/app/App.js";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

describe("web shell auth", () => {
  it("shows validation error when token is missing", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("connect-button"));

    expect(screen.getByRole("alert").textContent).toBe("⚠️ 请输入访问令牌");
  });

  it("connects and renders navigation without localStorage persistence", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    render(<App />);

    fireEvent.change(screen.getByTestId("daemon-token-input"), {
      target: { value: "dev-token" }
    });
    fireEvent.click(screen.getByTestId("connect-button"));

    expect(await screen.findByTestId("nav-events")).toBeTruthy();
    expect(await screen.findByTestId("nav-config")).toBeTruthy();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("daemonToken")).toBeNull();

    setItemSpy.mockRestore();
  });
});
