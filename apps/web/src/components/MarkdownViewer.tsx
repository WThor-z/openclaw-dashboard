import React from "react";
import ReactMarkdown from "react-markdown";

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

function extractFrontmatter(content: string): { frontmatter: string | null; markdown: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (match) {
    return { frontmatter: match[1], markdown: match[2] };
  }
  return { frontmatter: null, markdown: content };
}

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  const { frontmatter, markdown } = extractFrontmatter(content);

  const components = {
    img: () => null,
    a: ({ href, children, ...props }: any) => {
      const isExternal = href?.startsWith("http");
      return (
        <a
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noreferrer noopener" : undefined}
          {...props}
        >
          {children}
        </a>
      );
    },
  };

  return (
    <div
      className={className}
      style={{
        whiteSpace: "normal",
        wordBreak: "break-word",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
        fontSize: "var(--text-sm)",
        lineHeight: 1.7,
        padding: "var(--space-4)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        backgroundColor: "var(--color-bg-primary)",
        minHeight: "280px",
        color: "var(--color-text-primary)"
      }}
    >
      {frontmatter && (
        <div
          style={{
            marginBottom: "var(--space-4)",
            padding: "var(--space-3)",
            backgroundColor: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "var(--text-xs)",
            whiteSpace: "pre-wrap"
          }}
        >
          {frontmatter}
        </div>
      )}
      <ReactMarkdown skipHtml={true} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
