import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Prism from "prismjs";
// Language grammars
import "prismjs/components/prism-json";
import "prismjs/components/prism-json5";
import "prismjs/components/prism-yaml";

interface CodeViewerProps {
  content: string;
  language?: "json" | "json5" | "yaml" | "html" | "text" | string;
  isDark: boolean;
  isPrint?: boolean;
  maxHeight?: string;
  showLineNumbers?: boolean;
}

const LINE_HEIGHT = 22; // Exact pixel height per line
const OVERSCAN = 15; // Number of extra lines to render above and below visible area

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function CodeViewer({
  content,
  language = "text",
  isDark,
  isPrint = false,
  maxHeight = "calc(100vh - 14rem)",
  showLineNumbers = true,
}: CodeViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const cache = useRef<Map<number, string>>(new Map());

  // Split lines efficiently
  const lines = useMemo(() => {
    return content.split("\n");
  }, [content]);

  const totalLines = lines.length;

  // Clear highlight cache when content or language changes
  useEffect(() => {
    cache.current.clear();
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    setScrollTop(0);
  }, [content, language]);

  // Track container height on resize
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute maximum line length for stable horizontal scroll width
  const maxLineLength = useMemo(() => {
    let max = 0;
    // Sample first 1000 lines + check random lines for extreme lengths to keep calculation < 1ms
    const count = Math.min(lines.length, 1000);
    for (let i = 0; i < count; i++) {
      if (lines[i].length > max) max = lines[i].length;
    }
    // Also check every 10th line if more than 1000 lines
    if (lines.length > 1000) {
      for (let i = 1000; i < lines.length; i += 10) {
        if (lines[i].length > max) max = lines[i].length;
      }
    }
    return max;
  }, [lines]);

  // Determine grammar
  const grammar = useMemo(() => {
    if (language === "text") return null;
    return Prism.languages[language] || null;
  }, [language]);

  // Highlight a single line with caching
  const getLineHtml = useCallback(
    (idx: number): string => {
      if (cache.current.has(idx)) {
        return cache.current.get(idx)!;
      }

      const line = lines[idx] ?? "";
      let html = "";

      if (grammar) {
        try {
          html = Prism.highlight(line, grammar, language);
        } catch {
          html = escapeHtml(line);
        }
      } else {
        html = escapeHtml(line);
      }

      cache.current.set(idx, html);
      return html;
    },
    [lines, grammar, language]
  );

  // Line number gutter width (in pixels)
  const lineNumDigits = Math.max(2, String(totalLines).length);
  const gutterWidth = lineNumDigits * 8 + 28;

  // Print / PDF export mode: render all lines non-virtualized
  if (isPrint) {
    return (
      <div className="code-viewer code-viewer-theme-light p-4 bg-white text-gray-900 border border-gray-200 rounded-lg text-xs font-mono leading-[22px]">
        {lines.map((_, idx) => (
          <div key={idx} style={{ height: `${LINE_HEIGHT}px` }} className="flex">
            {showLineNumbers && (
              <span
                style={{ width: `${gutterWidth}px` }}
                className="text-right pr-4 text-gray-400 select-none flex-shrink-0"
              >
                {idx + 1}
              </span>
            )}
            <span
              className="whitespace-pre"
              dangerouslySetInnerHTML={{ __html: getLineHtml(idx) || "&nbsp;" }}
            />
          </div>
        ))}
      </div>
    );
  }

  // Virtualized range calculations
  const totalHeight = totalLines * LINE_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    totalLines,
    Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + OVERSCAN
  );

  const offsetY = startIndex * LINE_HEIGHT;
  const visibleIndices: number[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    visibleIndices.push(i);
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const isSmallFile = totalLines < 25;
  const themeClass = isDark ? "code-viewer-theme-dark" : "code-viewer-theme-light";
  const gutterBg = isDark ? "bg-[#121214]" : "bg-[#fafafa]";
  const gutterBorder = isDark ? "border-zinc-800/80" : "border-gray-200/80";

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={`code-viewer ${themeClass} rounded-lg border border-gray-200 dark:border-zinc-800 overflow-auto select-text shadow-sm transition-colors`}
      style={{
        height: isSmallFile ? "auto" : maxHeight,
        maxHeight: maxHeight,
        position: "relative",
      }}
    >
      {/* Spacer container establishing the full virtual scroll area */}
      <div
        style={{
          height: `${totalHeight}px`,
          minWidth: `calc(${maxLineLength + 4}ch + ${gutterWidth}px)`,
          position: "relative",
        }}
      >
        {/* Visible slice container */}
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleIndices.map((lineIdx) => {
            const lineNum = lineIdx + 1;
            const html = getLineHtml(lineIdx);

            return (
              <div
                key={lineIdx}
                style={{ height: `${LINE_HEIGHT}px`, lineHeight: `${LINE_HEIGHT}px` }}
                className="flex items-center text-xs font-mono hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                {/* Sticky Line Number Gutter */}
                {showLineNumbers && (
                  <span
                    style={{ width: `${gutterWidth}px` }}
                    className={`flex-shrink-0 text-right pr-4 select-none text-zinc-400 dark:text-zinc-600 sticky left-0 z-10 ${gutterBg} border-r ${gutterBorder}`}
                  >
                    {lineNum}
                  </span>
                )}
                {/* Code Line Content */}
                <span
                  className="pl-4 pr-6 whitespace-pre font-mono flex-1"
                  dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
