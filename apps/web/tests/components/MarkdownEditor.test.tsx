import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "../../src/shared/components/MarkdownEditor.js";

vi.mock("../../src/app/auth.js", () => ({
  useAuth: () => ({ token: "dev-token" })
}));

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    })
  );
}

describe("MarkdownEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "uuid-1234")
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("arms writes first and saves file with idempotency key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = typeof input === "string" ? input : input.toString();

      if (requestUrl === "/api/control/arm") {
        return jsonResponse(200, { ok: true });
      }

      if (requestUrl === "/api/control/agents/agent-1/files/docs%2Fnote.md") {
        return jsonResponse(200, { modifiedAt: "2026-03-06T12:00:00.000Z" });
      }

      return Promise.reject(new Error(`Unhandled fetch URL: ${requestUrl}`));
    });

    render(
      <MarkdownEditor
        agentId="agent-1"
        filePath="docs/note.md"
        initialContent="Initial"
      />
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Updated content" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    const [armUrl, armInit] = fetchSpy.mock.calls[0] ?? [];
    expect(armUrl).toBe("/api/control/arm");
    expect(armInit).toMatchObject({
      method: "POST",
      headers: { authorization: "Bearer dev-token" }
    });

    const [saveUrl, saveInit] = fetchSpy.mock.calls[1] ?? [];
    expect(saveUrl).toBe("/api/control/agents/agent-1/files/docs%2Fnote.md");
    expect(saveInit).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer dev-token",
        "content-type": "application/json",
        "idempotency-key": "save-manual-uuid-1234"
      }
    });
    expect(saveInit?.body).toBe(JSON.stringify({ content: "Updated content" }));
  });
});
