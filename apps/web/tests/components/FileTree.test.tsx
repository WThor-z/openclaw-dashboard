import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FileTree, type WorkspaceFile } from "../../src/shared/components/FileTree.js";

describe("FileTree", () => {
  it("renders nested items and triggers onSelect when file is clicked", () => {
    const onSelect = vi.fn();
    const items: WorkspaceFile[] = [
      {
        name: "docs",
        path: "docs",
        kind: "directory",
        children: [
          {
            name: "README.md",
            path: "docs/README.md",
            kind: "file"
          }
        ]
      },
      {
        name: "index.ts",
        path: "index.ts",
        kind: "file"
      }
    ];

    render(<FileTree items={items} selectedPath={null} onSelect={onSelect} />);

    expect(screen.getByText("docs")).toBeTruthy();
    expect(screen.getByText("index.ts")).toBeTruthy();
    expect(screen.queryByText("README.md")).toBeNull();

    fireEvent.click(screen.getByText("docs"));
    expect(screen.getByText("README.md")).toBeTruthy();

    fireEvent.click(screen.getByText("README.md"));
    expect(onSelect).toHaveBeenLastCalledWith("docs/README.md");
  });
});
