import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";

interface MarkdownViewerProps {
  content: string;
  className?: string;
  showToc?: boolean;
}

interface TocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

interface HeadingNodeLike {
  position?: {
    start?: {
      line?: number;
    };
  };
}

function extractFrontmatter(content: string): { frontmatter: string | null; markdown: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (match) {
    return { frontmatter: match[1], markdown: match[2] };
  }
  return { frontmatter: null, markdown: content };
}

function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u2018\u2019]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildHeadingId(prefix: string, text: string, lineNumber: number) {
  const slug = slugifyHeading(text) || "section";
  return `${prefix}-${slug}-${lineNumber}`;
}

function extractToc(markdown: string, prefix: string): TocItem[] {
  const lines = markdown.split(/\r?\n/);
  const all: TocItem[] = [];
  let inCodeFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (line.trim().startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    const match = line.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!match) {
      continue;
    }

    const level = match[1].length as 1 | 2 | 3;
    const text = match[2].trim();
    const id = buildHeadingId(prefix, text, lineNumber);
    all.push({ id, text, level });
  }

  const preferred = all.filter((item) => item.level === 2 || item.level === 3);
  return preferred.length > 0 ? preferred : all;
}

function headingText(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map((child) => headingText(child)).join("");
  }

  if (React.isValidElement(children)) {
    return headingText(children.props.children as React.ReactNode);
  }

  return "";
}

function extractLineFromNode(node: unknown) {
  if (typeof node !== "object" || node === null) {
    return null;
  }

  const maybeHeadingNode = node as HeadingNodeLike;
  const line = maybeHeadingNode.position?.start?.line;
  return typeof line === "number" ? line : null;
}

export function MarkdownViewer({ content, className, showToc = false }: MarkdownViewerProps) {
  const { frontmatter, markdown } = extractFrontmatter(content);
  const rawAnchorPrefix = React.useId();
  const anchorPrefix = React.useMemo(() => rawAnchorPrefix.replace(/[^a-zA-Z0-9-]/g, ""), [rawAnchorPrefix]);
  const tocItems = React.useMemo(() => extractToc(markdown, anchorPrefix), [anchorPrefix, markdown]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [activeHeadingId, setActiveHeadingId] = React.useState<string | null>(tocItems[0]?.id ?? null);

  React.useEffect(() => {
    setActiveHeadingId(tocItems[0]?.id ?? null);
  }, [tocItems]);

  const resolveHeadingId = (level: 1 | 2 | 3, children: React.ReactNode, node: unknown) => {
    const text = headingText(children).trim();
    const line = extractLineFromNode(node);
    if (typeof line === "number") {
      return buildHeadingId(anchorPrefix, text, line);
    }

    return buildHeadingId(anchorPrefix, text, level);
  };

  const handleTocJump = (id: string) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const target = root.querySelector<HTMLElement>(`[data-heading-id="${id}"]`);
    if (!target) {
      return;
    }

    setActiveHeadingId(id);
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  React.useEffect(() => {
    if (!showToc || tocItems.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const root = rootRef.current;
    if (!root) {
      return;
    }

    const findScrollRoot = () => {
      let current: HTMLElement | null = root.parentElement;
      while (current) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
          return current;
        }
        current = current.parentElement;
      }

      return null;
    };

    const headings = tocItems
      .map((item) => root.querySelector<HTMLElement>(`[data-heading-id="${item.id}"]`))
      .filter((item): item is HTMLElement => Boolean(item));

    if (headings.length === 0) {
      return;
    }

    const scrollRoot = findScrollRoot();

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => Math.abs(left.boundingClientRect.top) - Math.abs(right.boundingClientRect.top));

        const next = visible[0]?.target as HTMLElement | undefined;
        const nextId = next?.dataset.headingId;
        if (nextId) {
          setActiveHeadingId(nextId);
        }
      },
      {
        root: scrollRoot,
        rootMargin: "-35% 0px -55% 0px",
        threshold: [0, 1]
      }
    );

    headings.forEach((heading) => observer.observe(heading));

    return () => {
      observer.disconnect();
    };
  }, [showToc, tocItems]);

  const components: Components = {
    img: () => null,
    a: ({ href, children, ...props }) => {
      const isExternal = href?.startsWith("http");
      return (
        <a
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noreferrer noopener" : undefined}
          className="markdown-link"
          {...props}
        >
          {children}
        </a>
      );
    },
    h1: ({ node, children, ...props }) => {
      const id = resolveHeadingId(1, children, node);
      return (
        <h1 id={id} data-heading-id={id} className="markdown-h1" {...props}>
          {children}
        </h1>
      );
    },
    h2: ({ node, children, ...props }) => {
      const id = resolveHeadingId(2, children, node);
      return (
        <h2 id={id} data-heading-id={id} className="markdown-h2" {...props}>
          {children}
        </h2>
      );
    },
    h3: ({ node, children, ...props }) => {
      const id = resolveHeadingId(3, children, node);
      return (
        <h3 id={id} data-heading-id={id} className="markdown-h3" {...props}>
          {children}
        </h3>
      );
    },
    p: ({ children, ...props }) => (
      <p className="markdown-p" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }) => (
      <ul className="markdown-ul" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="markdown-ol" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="markdown-li" {...props}>
        {children}
      </li>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote className="markdown-blockquote" {...props}>
        {children}
      </blockquote>
    ),
    hr: (props) => <hr className="markdown-hr" {...props} />,
    pre: ({ children, ...props }) => (
      <pre className="markdown-pre" {...props}>
        {children}
      </pre>
    ),
    code: ({ className: codeClassName, children, ...props }) => {
      const isCodeBlock = typeof codeClassName === "string" && codeClassName.includes("language-");
      return (
        <code className={isCodeBlock ? "markdown-codeblock" : "markdown-code-inline"} {...props}>
          {children}
        </code>
      );
    },
    strong: ({ children, ...props }) => (
      <strong className="markdown-strong" {...props}>
        {children}
      </strong>
    )
  };

  const rootClassName = ["markdown-reader", showToc ? "markdown-reader-with-toc" : null, className].filter(Boolean).join(" ");

  return (
    <div ref={rootRef} className={rootClassName}>
      <div className="markdown-reader-main">
        {frontmatter && (
          <section className="markdown-frontmatter" aria-label="Frontmatter">
            <p className="markdown-frontmatter-title">Frontmatter</p>
            <pre>{frontmatter}</pre>
          </section>
        )}

        <article className="markdown-body">
          <ReactMarkdown skipHtml={true} components={components}>
            {markdown}
          </ReactMarkdown>
        </article>
      </div>

      {showToc && tocItems.length > 1 ? (
        <aside className="markdown-toc" aria-label="Table of contents">
          <p className="markdown-toc-title">Sections</p>
          <ul className="markdown-toc-list">
            {tocItems.map((item) => (
              <li key={item.id} className="markdown-toc-item">
                <a
                  href={`#${item.id}`}
                  className={
                    item.level === 3
                      ? `markdown-toc-link markdown-toc-link-nested${activeHeadingId === item.id ? " markdown-toc-link-active" : ""}`
                      : `markdown-toc-link${activeHeadingId === item.id ? " markdown-toc-link-active" : ""}`
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    handleTocJump(item.id);
                  }}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}
