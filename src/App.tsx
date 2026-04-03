import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FolderOpen, File as FileIcon, ChevronRight, ChevronDown, FileText } from "lucide-react";
import "./App.css";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

interface Tab {
  id: string;
  fileName: string;
  filePath: string;
  content: string;
  isEditMode: boolean;
  hasUnsavedChanges: boolean;
}

function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [isDark, setIsDark] = useState<boolean>(false);
  const [explorerFiles, setExplorerFiles] = useState<FileEntry[] | null>(null);
  const [explorerRoot, setExplorerRoot] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Auto-detect system preference on mount
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Apply dark class to document
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  function getFileTypeLabel(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'md':
      case 'markdown':
        return 'Markdown';
      case 'txt':
        return 'Text';
      default:
        return ext ? ext.toUpperCase() : 'File';
    }
  }

  async function openFile(filePath?: string) {
    try {
      let selectedPath = filePath;
      
      if (!selectedPath) {
        const selected = await open({
          multiple: false,
          filters: [
            {
              name: "Text Files",
              extensions: ["md", "markdown", "txt"],
            },
          ],
        });
        if (selected && typeof selected === "string") {
          selectedPath = selected;
        } else {
          return; // Cancelled
        }
      }

      // Check if file is already open
      const existingTab = tabs.find(t => t.filePath === selectedPath);
      if (existingTab) {
        setActiveTabId(existingTab.id);
        return;
      }

      const content = await invoke<string>("read_file_content", {
        path: selectedPath,
      });
      
      const fileName = selectedPath.split("\\").pop() || selectedPath.split("/").pop() || "Untitled";
      const newTab: Tab = {
        id: Date.now().toString(),
        fileName,
        filePath: selectedPath,
        content,
        isEditMode: false,
        hasUnsavedChanges: false,
      };
      
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
      setError("");
    } catch (err) {
      setError(`Error: ${err}`);
    }
  }

  async function openFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected && typeof selected === "string") {
        const files = await invoke<FileEntry[]>("get_directory_structure", {
          path: selected,
        });
        setExplorerRoot(selected);
        setExplorerFiles(files);
        setExpandedFolders(new Set()); // Reset expansions when opening new folder
        setError("");
      }
    } catch (err) {
      setError(`Error opening folder: ${err}`);
    }
  }

  function toggleFolder(path: string) {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  }

  const FileTreeNode = ({ entry, depth = 0 }: { entry: FileEntry, depth?: number }) => {
    const isExpanded = expandedFolders.has(entry.path);
    const isMd = entry.name.toLowerCase().endsWith('.md') || entry.name.toLowerCase().endsWith('.markdown');

    if (entry.is_dir) {
      return (
        <div>
          <div 
            className="flex items-center gap-1.5 py-1 px-2 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded cursor-pointer text-gray-700 dark:text-zinc-300 text-sm select-none"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => toggleFolder(entry.path)}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
            <FolderOpen className="w-4 h-4 text-blue-500 dark:text-cyan-500" />
            <span className="truncate">{entry.name}</span>
          </div>
          {isExpanded && entry.children && (
            <div>
              {entry.children.map((child, idx) => (
                <FileTreeNode key={`${child.path}-${idx}`} entry={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div 
        className="flex items-center gap-1.5 py-1 px-2 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded cursor-pointer text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 text-sm select-none"
        style={{ paddingLeft: `${depth * 12 + 24}px` }}
        onClick={() => openFile(entry.path)}
      >
        {isMd ? (
          <FileText className="w-4 h-4 text-green-600 dark:text-green-400 opacity-80" />
        ) : (
          <FileIcon className="w-4 h-4 text-gray-400 opacity-80" />
        )}
        <span className="truncate">{entry.name}</span>
      </div>
    );
  };

  function closeTab(tabId: string) {
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(newTabs);
    
    if (activeTabId === tabId) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
    }
  }

  function toggleEditMode(tabId: string) {
    setTabs(tabs.map(tab => 
      tab.id === tabId ? { ...tab, isEditMode: !tab.isEditMode } : tab
    ));
  }

  function updateTabContent(tabId: string, newContent: string) {
    setTabs(tabs.map(tab => 
      tab.id === tabId ? { ...tab, content: newContent, hasUnsavedChanges: true } : tab
    ));
  }

  async function saveTab(tabId: string) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    try {
      await invoke("write_file_content", {
        path: tab.filePath,
        content: tab.content,
      });
      
      setTabs(tabs.map(t => 
        t.id === tabId ? { ...t, hasUnsavedChanges: false } : t
      ));
      setError("");
    } catch (err) {
      setError(`Failed to save file: ${err}`);
    }
  }

  async function reloadActiveTab() {
    if (!activeTabId || !activeTab) return;

    if (activeTab.hasUnsavedChanges) {
      const confirmReload = window.confirm("You have unsaved changes. Are you sure you want to reload from disk? This will overwrite your changes.");
      if (!confirmReload) return;
    }

    try {
      const content = await invoke<string>("read_file_content", {
        path: activeTab.filePath,
      });
      
      setTabs(tabs.map(tab => 
        tab.id === activeTabId ? { ...tab, content, hasUnsavedChanges: false } : tab
      ));
      setError("");
    } catch (err) {
      setError(`Failed to reload file: ${err}`);
    }
  }

  return (
    <div className="min-h-screen transition-colors duration-300">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-zinc-800 backdrop-blur-sm sticky top-0 z-10 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-zinc-100">
            ZenMarkdown
          </h1>
          <div className="flex items-center gap-3">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors text-2xl leading-none"
              aria-label="Toggle dark mode"
            >
              {isDark ? "🌙" : "☀️"}
            </button>
            <button
              onClick={() => openFile()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-cyan-600 dark:hover:bg-cyan-700 text-white rounded-lg transition-colors font-medium"
            >
              Open File
            </button>
            <button
              onClick={openFolder}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-zinc-200 rounded-lg transition-colors font-medium border border-gray-200 dark:border-zinc-700"
            >
              Open Folder
            </button>
          </div>
        </div>

        {/* Tabs */}
        {tabs.length > 0 && (
          <div className="border-t border-gray-200 dark:border-zinc-800">
            <div className="max-w-7xl mx-auto px-6 flex items-center gap-2 overflow-x-auto">
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors cursor-pointer ${
                    activeTabId === tab.id
                      ? "border-blue-600 dark:border-cyan-500 text-gray-900 dark:text-zinc-100"
                      : "border-transparent text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200"
                  }`}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  <span className="text-sm font-medium whitespace-nowrap">
                    {tab.hasUnsavedChanges && <span className="text-blue-600 dark:text-cyan-400 mr-1">●</span>}
                    {tab.fileName}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                    aria-label="Close tab"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="flex h-[calc(100vh-120px)]">
        {/* Sidebar */}
        {explorerFiles && (
          <aside className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-[#121214] overflow-y-auto">
            <div className="p-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-500 mb-3 truncate" title={explorerRoot || ""}>
                {explorerRoot ? explorerRoot.split("\\").pop() || explorerRoot.split("/").pop() : "Explorer"}
              </h2>
              <div className="flex flex-col gap-0.5">
                {explorerFiles.map((entry, idx) => (
                  <FileTreeNode key={`${entry.path}-${idx}`} entry={entry} />
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto w-full">
          <div className="max-w-5xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-300 dark:border-red-900 rounded-lg">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {activeTab ? (
          <>
            {/* Tab Controls */}
            <div className="mb-8 pb-4 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-zinc-400">
                <span className="font-medium text-gray-800 dark:text-zinc-200">{getFileTypeLabel(activeTab.fileName)}</span>
                {activeTab.hasUnsavedChanges && (
                  <span className="ml-2 text-xs text-blue-600 dark:text-cyan-400">(unsaved)</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                {activeTab.isEditMode && (
                  <button
                    onClick={() => saveTab(activeTab.id)}
                    disabled={!activeTab.hasUnsavedChanges}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                      activeTab.hasUnsavedChanges
                        ? "bg-green-600 hover:bg-green-700 text-white"
                        : "bg-gray-200 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600 cursor-not-allowed"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save
                  </button>
                )}
                <button
                  onClick={reloadActiveTab}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium"
                  title="Reload from disk"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reload
                </button>
                <button
                  onClick={() => toggleEditMode(activeTab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                    activeTab.isEditMode
                      ? "bg-blue-100 dark:bg-cyan-900/30 text-blue-700 dark:text-cyan-400"
                      : "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {activeTab.isEditMode ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Preview
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </>
                )}
              </button>
            </div>
          </div>

            {/* Content Area */}
            {activeTab.isEditMode ? (
              <textarea
                value={activeTab.content}
                onChange={(e) => updateTabContent(activeTab.id, e.target.value)}
                className="w-full min-h-[600px] p-4 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg text-gray-800 dark:text-zinc-200 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-500 resize-vertical"
                spellCheck={false}
              />
            ) : (
              <article className="markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || "");
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          {...props}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {activeTab.content}
                </ReactMarkdown>
              </article>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <svg
              className="w-20 h-20 text-gray-300 dark:text-zinc-700 mb-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-xl text-gray-600 dark:text-zinc-400 mb-2 font-medium">
              No file opened
            </p>
            <p className="text-sm text-gray-500 dark:text-zinc-500">
              Click "Open File" to start reading
            </p>
          </div>
        )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
