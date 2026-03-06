import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownViewer } from "../../src/components/MarkdownViewer.js";

describe("MarkdownViewer", () => {
  it("extracts frontmatter, strips HTML, and does not render markdown images", () => {
    const content = [
      "---",
      "title: Release Notes",
      "owner: control-plane",
      "---",
      "# Heading",
      "<span>unsafe html</span>",
      "![diagram](https://example.com/diagram.png)",
      "Plain paragraph"
    ].join("\n");

    render(<MarkdownViewer content={content} />);

    expect(screen.getByText(/title: Release Notes/)).toBeTruthy();
    expect(screen.getByText(/owner: control-plane/)).toBeTruthy();
    expect(screen.getByText("Heading")).toBeTruthy();
    expect(screen.getByText(/unsafe html\s+Plain paragraph/)).toBeTruthy();
    expect(document.querySelector("span")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("diagram")).toBeNull();
  });
});
