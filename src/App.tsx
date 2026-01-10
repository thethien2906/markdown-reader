import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";

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

  async function openFile() {
    try {
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
        const content = await invoke<string>("read_file_content", {
          path: selected,
        });
        
        const fileName = selected.split("\\").pop() || selected.split("/").pop() || "Untitled";
        const newTab: Tab = {
          id: Date.now().toString(),
          fileName,
          filePath: selected,
          content,
          isEditMode: false,
          hasUnsavedChanges: false,
        };
        
        setTabs([...tabs, newTab]);
        setActiveTabId(newTab.id);
        setError("");
      }
    } catch (err) {
      setError(`Error: ${err}`);
    }
  }

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

  return (
    <div className="min-h-screen transition-colors duration-300">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-zinc-800 backdrop-blur-sm sticky top-0 z-10 transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-zinc-100">
            ZenMarkdown
          </h1>
          <div className="flex items-center gap-3">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {isDark ? (
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>
            <button
              onClick={openFile}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-cyan-600 dark:hover:bg-cyan-700 text-white rounded-lg transition-colors font-medium"
            >
              Open File
            </button>
          </div>
        </div>

        {/* Tabs */}
        {tabs.length > 0 && (
          <div className="border-t border-gray-200 dark:border-zinc-800">
            <div className="max-w-5xl mx-auto px-6 flex items-center gap-2 overflow-x-auto">
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

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
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
                <span className="font-medium text-gray-800 dark:text-zinc-200">{activeTab.fileName}</span>
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
      </main>
    </div>
  );
}

export default App;
