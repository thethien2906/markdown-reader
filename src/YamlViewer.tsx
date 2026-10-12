import { CodeViewer } from "./CodeViewer";

interface YamlViewerProps {
  content: string;
  isDark: boolean;
  isPrint?: boolean;
}

export function YamlViewer({ content, isDark, isPrint = false }: YamlViewerProps) {
  const lineCount = content.split('\n').length;

  return (
    <div className="flex flex-col gap-3">
      {!isPrint && (
        <div className="flex items-center justify-between bg-gray-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-zinc-800 text-xs text-gray-600 dark:text-zinc-300">
          <span className="font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">YAML</span>
          <span className="text-gray-400 dark:text-zinc-500 font-mono text-[11px]">{lineCount} lines</span>
        </div>
      )}
      <CodeViewer
        content={content}
        language="yaml"
        isDark={isDark}
        isPrint={isPrint}
        showLineNumbers={true}
      />
    </div>
  );
}
