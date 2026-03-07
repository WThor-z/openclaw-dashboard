import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders a compact table of contents when enabled", () => {
    const content = [
      "# Manual",
      "",
      "## First Run",
      "text",
      "",
      "### Step A",
      "more",
      "",
      "## Safety",
      "rules"
    ].join("\n");

    render(<MarkdownViewer content={content} showToc />);

    expect(screen.getByLabelText("Table of contents")).toBeTruthy();
    expect(screen.getByRole("link", { name: "First Run" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Step A" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Safety" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "First Run" }).getAttribute("id")).toMatch(/first-run-/);
    expect(screen.getByRole("heading", { name: "First Run" }).getAttribute("data-heading-id")).toMatch(/first-run-/);

    const safetyLink = screen.getByRole("link", { name: "Safety" });
    fireEvent.click(safetyLink);
    expect(safetyLink.className).toContain("markdown-toc-link-active");
  });

  it("keeps duplicate heading anchors unique and hides TOC for single section", () => {
    const duplicateContent = [
      "## Safety",
      "one",
      "",
      "## Safety",
      "two"
    ].join("\n");

    const { unmount } = render(<MarkdownViewer content={duplicateContent} showToc />);

    const headings = screen.getAllByRole("heading", { name: "Safety" });
    expect(headings).toHaveLength(2);
    expect(headings[0].getAttribute("id")).not.toBe(headings[1].getAttribute("id"));

    const tocLinks = screen.getAllByRole("link", { name: "Safety" });
    expect(tocLinks).toHaveLength(2);
    expect(tocLinks[0].getAttribute("href")).not.toBe(tocLinks[1].getAttribute("href"));

    unmount();

    const singleSectionContent = ["## Only Section", "Text"].join("\n");
    render(<MarkdownViewer content={singleSectionContent} showToc />);
    expect(screen.queryByLabelText("Table of contents")).toBeNull();
  });

  it("falls back to h1 headings when no h2 or h3 exists", () => {
    const content = ["# Intro", "text", "", "# Ops", "text"].join("\n");

    render(<MarkdownViewer content={content} showToc />);

    expect(screen.getByLabelText("Table of contents")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Intro" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ops" })).toBeTruthy();
  });
});
