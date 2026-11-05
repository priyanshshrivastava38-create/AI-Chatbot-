"use client";

import "katex/dist/katex.min.css";
import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock, InlineCode } from "./code-block";

const components: Components = {
  // Blocks are styled by the code renderer, so the wrapper must not add a second frame.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = typeof children === "string" ? children : Array.isArray(children) ? String(children) : "";
    const isBlock = /language-/.test(className ?? "") || text.includes("\n");
    return isBlock ? (
      <CodeBlock className={className}>{children as ReactNode}</CodeBlock>
    ) : (
      <InlineCode className={className}>{children as ReactNode}</InlineCode>
    );
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeHighlight, { detect: false, ignoreMissing: true }],
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
