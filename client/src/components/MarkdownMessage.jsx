import React, { useState } from "react";

// A deliberately small, dependency-free renderer — just enough Markdown to
// make Nirantar AI's answers (explanations, lists, code) readable, without
// pulling in react-markdown/highlight.js for a chat pane. Full syntax
// coloring per language is the obvious next upgrade if richer parity with
// e.g. VS Code is wanted later; this focuses on structure and readability:
// headings, lists, bold/italic, inline code, and fenced code blocks with a
// language label + copy button that preserves the code exactly as returned.
export default function MarkdownMessage({ text }) {
  const blocks = splitCodeBlocks(text);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) =>
        block.type === "code" ? (
          <CodeBlock key={i} language={block.language} code={block.code} />
        ) : (
          <ProseBlock key={i} text={block.text} />
        )
      )}
    </div>
  );
}

function splitCodeBlocks(text) {
  const parts = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "prose", text: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", language: match[1] || "text", code: match[2].replace(/\n$/, "") });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "prose", text: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "prose", text }];
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — fail silently, the code is still selectable
    }
  };

  return (
    <div className="overflow-hidden rounded-md border border-brand-900/20 bg-brand-900">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-xs font-medium text-brand-200">{language}</span>
        <button
          type="button"
          onClick={copy}
          className="text-xs font-medium text-brand-200 hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-brand-50">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Minimal inline/prose markdown: headings, bullet/numbered lists, bold,
// italic, inline code. Line-based, not a full CommonMark parser — enough
// for the kind of structured explanations Nirantar AI produces.
function ProseBlock({ text }) {
  const lines = text.split("\n");
  const elements = [];
  let listBuffer = [];
  let listType = null;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    elements.push(
      <Tag key={elements.length} className={Tag === "ol" ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const HeadingTag = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
      const sizeClass = level === 1 ? "text-base font-semibold" : level === 2 ? "text-sm font-semibold" : "text-sm font-medium";
      elements.push(
        <HeadingTag key={elements.length} className={`${sizeClass} text-ink`}>
          {renderInline(headingMatch[2])}
        </HeadingTag>
      );
      return;
    }
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(bulletMatch[1]);
      return;
    }
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.*)/);
    if (numberedMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(numberedMatch[1]);
      return;
    }
    flushList();
    elements.push(
      <p key={elements.length} className="leading-relaxed">
        {renderInline(trimmed)}
      </p>
    );
  });
  flushList();

  return <>{elements}</>;
}

// Bold (**x**), italic (*x*), inline code (`x`) — applied in that order so
// they don't interfere with each other, on plain text segments only.
function renderInline(text) {
  const nodes = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key++} className="rounded bg-canvas-sunk px-1 py-0.5 font-mono text-[13px]">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
