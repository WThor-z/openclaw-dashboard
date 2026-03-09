export interface DaemonWorkspaceNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DaemonWorkspaceNode[];
}

const EXCLUDED_SEGMENTS = new Set([".git", ".runtime", "node_modules", "dist", "build", ".next", "coverage"]);

export function shouldSkipPath(targetPath: string) {
  return targetPath
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0)
    .some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

export function collectMarkdownPaths(nodes: DaemonWorkspaceNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (shouldSkipPath(node.path)) {
      continue;
    }

    if (node.isDirectory) {
      paths.push(...collectMarkdownPaths(Array.isArray(node.children) ? node.children : []));
      continue;
    }

    if (/\.md$/i.test(node.path)) {
      paths.push(node.path);
    }
  }

  return paths;
}

export function sortPreviewPaths(paths: string[], pinnedPaths: string[]) {
  const pinned = pinnedPaths.filter((path) => paths.includes(path));
  const rest = paths.filter((path) => !pinned.includes(path));
  return [...pinned, ...rest];
}
