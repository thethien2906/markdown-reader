import { useMemo } from "react";
import JSON5 from "json5";
import { CodeViewer } from "./CodeViewer";

interface JsonViewerProps {
  content: string;
  isDark: boolean;
  isPrint?: boolean;
  isCompact?: boolean;
}

export function JsonViewer({ content, isDark, isPrint = false, isCompact = false }: JsonViewerProps) {
  const { formatted, error } = useMemo(() => {
    // 1. Try standard JSON.parse first
    try {
      const parsed = JSON.parse(content);
      return {
        formatted: isCompact ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2),
        error: null,
      };
    } catch (stdErr: any) {
      // 2. Try JSON5 for JSON with comments (JSONC like tsconfig.json) & trailing commas
      try {
        const parsed = JSON5.parse(content);
        return {
          formatted: isCompact ? JSON.stringify(parsed) : content,
          error: null,
        };
      } catch (json5Err: any) {
        return {
          formatted: content,
          error: json5Err?.message || stdErr?.message || "Invalid JSON syntax",
        };
      }
    }
  }, [content, isCompact]);

  return (
    <div className="flex flex-col gap-3">
      {/* Error banner only if truly invalid JSON / JSON5 */}
      {error && !isPrint && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300 font-mono">
          {error}
        </div>
      )}

      {/* High-Performance Virtualized Code Display */}
      <CodeViewer
        content={formatted}
        language="json5"
        isDark={isDark}
        isPrint={isPrint}
        showLineNumbers={true}
      />
    </div>
  );
}
