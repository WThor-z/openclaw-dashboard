import React, { useState } from "react";

export interface WorkspaceFile {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: WorkspaceFile[];
}

interface FileTreeProps {
  items: WorkspaceFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onContextMenu?: (payload: { path: string; kind: "file" | "directory"; clientX: number; clientY: number }) => void;
  onMoveRequest?: (payload: { sourcePath: string; sourceKind: "file" | "directory"; targetDirectory: string }) => void;
}

export function FileTree({ items, selectedPath, onSelect, onContextMenu, onMoveRequest }: FileTreeProps) {
  // Sort: directories first, then files; both alphabetical by name
  const sortedItems = [...items].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="file-tree" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
      {sortedItems.length === 0 ? (
        <div className="empty-hint" style={{ padding: "var(--space-2) var(--space-4)", fontStyle: "italic", opacity: 0.5 }}>
          Empty directory
        </div>
      ) : (
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sortedItems.map((item) => (
            <FileTreeItem
              key={item.path}
              item={item}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onMoveRequest={onMoveRequest}
              depth={0}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface FileTreeItemProps {
  item: WorkspaceFile;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onContextMenu?: (payload: { path: string; kind: "file" | "directory"; clientX: number; clientY: number }) => void;
  onMoveRequest?: (payload: { sourcePath: string; sourceKind: "file" | "directory"; targetDirectory: string }) => void;
  depth: number;
}

function FileTreeItem({ item, selectedPath, onSelect, onContextMenu, onMoveRequest, depth }: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const isSelected = selectedPath === item.path;
  const isDirectory = item.kind === "directory";

  const handleToggle = (e: React.MouseEvent) => {
    if (isDirectory) {
      e.stopPropagation();
      setIsExpanded(!isExpanded);
    }
  };

  const handleClick = () => {
    if (isDirectory) {
      setIsExpanded(!isExpanded);
    }
    onSelect(item.path);
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    onSelect(item.path);
    onContextMenu?.({
      path: item.path,
      kind: item.kind,
      clientX: event.clientX,
      clientY: event.clientY
    });
  };

  const sortedChildren = isDirectory && item.children
    ? [...item.children].sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
    : [];

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("application/x-openclaw-path", item.path);
    event.dataTransfer.setData("application/x-openclaw-kind", item.kind);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isDirectory) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setIsDropTarget(true);
  };

  const handleDragLeave = () => {
    setIsDropTarget(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isDirectory) {
      return;
    }

    event.preventDefault();
    setIsDropTarget(false);
    const sourcePath = event.dataTransfer.getData("application/x-openclaw-path");
    const sourceKind = event.dataTransfer.getData("application/x-openclaw-kind");
    if (!sourcePath || (sourceKind !== "file" && sourceKind !== "directory")) {
      return;
    }

    if (sourcePath === item.path) {
      return;
    }

    onMoveRequest?.({
      sourcePath,
      sourceKind,
      targetDirectory: item.path
    });
  };

  return (
    <li className="file-tree-item" style={{ display: "block" }}>
      <div
        className={`file-tree-row ${isSelected ? "active" : ""}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "var(--space-1) var(--space-2)",
          paddingLeft: `calc(var(--space-2) + ${depth * 1.2}rem)`,
          cursor: "pointer",
          borderRadius: "var(--radius-sm)",
          backgroundColor: isDropTarget ? "var(--color-bg-hover)" : isSelected ? "var(--color-brand-50)" : "transparent",
          color: isSelected ? "var(--color-brand-600)" : "inherit",
          transition: "background-color var(--transition-fast)",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <span
          onClick={handleToggle}
          style={{
            width: "1.2rem",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            visibility: isDirectory ? "visible" : "hidden",
            fontSize: "0.8em",
            userSelect: "none",
          }}
        >
          {isExpanded ? "▾" : "▸"}
        </span>
        <span style={{ marginRight: "var(--space-2)" }}>
          {isDirectory ? "📁" : "📄"}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.name}
        </span>
      </div>

      {isDirectory && isExpanded && (
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sortedChildren.length === 0 ? (
            <li style={{ paddingLeft: `calc(var(--space-2) + ${(depth + 1) * 1.2}rem + 1.2rem)`, opacity: 0.5, fontStyle: "italic", fontSize: "0.9em" }}>
              Empty
            </li>
          ) : (
            sortedChildren.map((child) => (
              <FileTreeItem
                key={child.path}
                item={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                onMoveRequest={onMoveRequest}
                depth={depth + 1}
              />
            ))
          )}
        </ul>
      )}
    </li>
  );
}
