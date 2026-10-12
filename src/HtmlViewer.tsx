import { useState } from "react";
import { Eye, Code } from "lucide-react";
import { CodeViewer } from "./CodeViewer";

interface HtmlViewerProps {
  content: string;
  isDark: boolean;
  isPrint?: boolean;
}

export function HtmlViewer({ content, isDark, isPrint = false }: HtmlViewerProps) {
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");

  return (
    <div className="flex flex-col gap-3">
      {!isPrint && (
        <div className="flex items-center justify-between bg-gray-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-zinc-800 text-xs text-gray-600 dark:text-zinc-300">
          <span className="font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">HTML</span>
          <div className="flex items-center gap-1 bg-gray-200 dark:bg-zinc-700/60 p-0.5 rounded-lg">
            <button
              onClick={() => setViewMode("preview")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "preview"
                  ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 shadow-sm"
                  : "text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Live Preview
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "code"
                  ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 shadow-sm"
                  : "text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              Source Code
            </button>
          </div>
        </div>
      )}

      {viewMode === "preview" && !isPrint ? (
        <div className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white shadow-sm min-h-[500px]">
          <iframe
            srcDoc={content}
            title="HTML Live Preview"
            sandbox="allow-scripts allow-same-origin"
            className="w-full min-h-[600px] border-none"
          />
        </div>
      ) : (
        <CodeViewer
          content={content}
          language="html"
          isDark={isDark}
          isPrint={isPrint}
          showLineNumbers={true}
        />
      )}
    </div>
  );
}
