import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FolderOpen, File as FileIcon, ChevronRight, ChevronDown, FileText, RefreshCw } from "lucide-react";
import { Mermaid } from "./Mermaid";
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

interface MarkdownViewerProps {
  content: string;
  isDark: boolean;
  isPrint?: boolean;
}

function MarkdownViewer({ content, isDark, isPrint = false }: MarkdownViewerProps) {
  return (
    <article className={`markdown-content ${isPrint ? "" : "print:block"}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";
            if (!inline && language === "mermaid") {
              return <Mermaid code={String(children).replace(/\n$/, "")} isDark={isPrint ? false : isDark} />;
            }
            return !inline && match ? (
              <SyntaxHighlighter
                style={isPrint ? oneLight : (isDark ? oneDark : oneLight)}
                language={language}
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
        {content}
      </ReactMarkdown>
    </article>
  );
}

function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [isDark, setIsDark] = useState<boolean>(false);
  const [explorerFiles, setExplorerFiles] = useState<FileEntry[] | null>(null);
  const [explorerRoot, setExplorerRoot] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Layout states
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    tabId: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    tabId: null,
  });

  // Handle resizing
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        setSidebarWidth(Math.max(200, Math.min(e.clientX, 600))); // Min 200px, Max 600px
      }
    },
    [isResizing]
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  // Handle closing context menu
  useEffect(() => {
    const handleClick = () => {
      if (contextMenu.visible) {
        setContextMenu({ ...contextMenu, visible: false });
      }
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [contextMenu]);

  // Auto-detect system preference on mount
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Restore last opened folder on mount
  useEffect(() => {
    const lastFolder = localStorage.getItem("last_folder_path");
    if (lastFolder) {
      setExplorerRoot(lastFolder);
      invoke("watch_folder", { path: lastFolder })
        .then(() => {
          return invoke<FileEntry[]>("get_directory_structure", {
            path: lastFolder,
            recursive: false,
          });
        })
        .then(files => {
          setExplorerFiles(files);
        })
        .catch(err => {
          console.error("Failed to restore last folder:", err);
        });
    }
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

  // Watch parent directory of the active tab if it's outside explorerRoot
  useEffect(() => {
    if (activeTab) {
      const filePath = activeTab.filePath;
      const parentDir = filePath.substring(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')));
      
      const isInsideRoot = explorerRoot && filePath.toLowerCase().startsWith(explorerRoot.toLowerCase());
      if (!isInsideRoot) {
        invoke("watch_folder", { path: parentDir }).catch(err => console.error("Error watching file parent:", err));
      }
    }
  }, [activeTabId, explorerRoot, activeTab]);

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
        const lastFolder = localStorage.getItem("last_folder_path") || undefined;
        const selected = await open({
          multiple: false,
          defaultPath: lastFolder,
          filters: [
            {
              name: "Text Files",
              extensions: ["md", "markdown", "txt"],
            },
          ],
        });
        if (selected && typeof selected === "string") {
          selectedPath = selected;
          const parentDir = selectedPath.substring(0, Math.max(selectedPath.lastIndexOf('/'), selectedPath.lastIndexOf('\\')));
          localStorage.setItem("last_folder_path", parentDir);
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

  // Helper to update a specific folder's children in the tree
  const refreshTree = useCallback(async (rootPath: string, expanded: Set<string>) => {
    async function getTree(path: string): Promise<FileEntry[]> {
      const files = await invoke<FileEntry[]>("get_directory_structure", { 
        path, 
        recursive: false 
      });
      
      // For each directory that is currently expanded, fetch its children too
      const updatedFiles = await Promise.all(files.map(async (file) => {
        if (file.is_dir && expanded.has(file.path)) {
          return {
            ...file,
            children: await getTree(file.path)
          };
        }
        return file;
      }));
      
      return updatedFiles;
    }

    try {
      const newFiles = await getTree(rootPath);
      setExplorerFiles(newFiles);
    } catch (err) {
      console.error("Failed to refresh tree:", err);
    }
  }, []);

  // Listen for file system changes from Rust
  useEffect(() => {
    let unlisten: any;
    
    async function setupListener() {
      unlisten = await listen<string[]>("fs-update", (event) => {
        if (explorerRoot) {
          refreshTree(explorerRoot, expandedFolders);
        }
        
        const modifiedPaths = event.payload;
        if (Array.isArray(modifiedPaths) && activeTabId) {
          const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase();
          
          setTabs(prevTabs => {
            const currentActiveTab = prevTabs.find(t => t.id === activeTabId);
            if (currentActiveTab) {
              const activeNormalized = normalize(currentActiveTab.filePath);
              const isModified = modifiedPaths.some(p => normalize(p) === activeNormalized);
              
              if (isModified) {
                // Auto-reload only if in preview mode OR in edit mode with no unsaved changes
                if (!currentActiveTab.isEditMode || !currentActiveTab.hasUnsavedChanges) {
                  invoke<string>("read_file_content", { path: currentActiveTab.filePath })
                    .then(newContent => {
                      setTabs(prev => prev.map(t => 
                        t.id === activeTabId 
                          ? { ...t, content: newContent, hasUnsavedChanges: false } 
                          : t
                      ));
                    })
                    .catch(err => console.error("Failed to auto-reload file:", err));
                }
              }
            }
            return prevTabs;
          });
        }
      });
    }

    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, [explorerRoot, expandedFolders, refreshTree, activeTabId]);

  async function openFolder() {
    try {
      const lastFolder = localStorage.getItem("last_folder_path") || undefined;
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: lastFolder,
      });

      if (selected && typeof selected === "string") {
        localStorage.setItem("last_folder_path", selected);
        setExplorerRoot(selected);
        setExpandedFolders(new Set()); // Reset expansions when opening new folder
        
        // Start watching this folder recursively in Rust
        await invoke("watch_folder", { path: selected });
        
        // Initial top-level fetch
        const files = await invoke<FileEntry[]>("get_directory_structure", {
          path: selected,
          recursive: false,
        });
        setExplorerFiles(files);
        setError("");
      }
    } catch (err) {
      setError(`Error opening folder: ${err}`);
    }
  }

  async function toggleFolder(path: string) {
    const newExpanded = new Set(expandedFolders);
    const isExpanding = !newExpanded.has(path);
    
    if (isExpanding) {
      newExpanded.add(path);
      setExpandedFolders(newExpanded);
      
      // Lazy load children if they haven't been loaded yet
      if (explorerRoot) {
        await refreshTree(explorerRoot, newExpanded);
      }
    } else {
      newExpanded.delete(path);
      setExpandedFolders(newExpanded);
    }
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

  function closeAllTabs() {
    setTabs([]);
    setActiveTabId(null);
  }

  function closeSavedTabs() {
    const newTabs = tabs.filter(tab => tab.hasUnsavedChanges);
    setTabs(newTabs);
    if (!newTabs.find(t => t.id === activeTabId)) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
    }
  }

  function closeOtherTabs(tabId: string) {
    const newTabs = tabs.filter(tab => tab.id === tabId || tab.hasUnsavedChanges);
    // Even if unsaved, we at least keep the tabId. We don't want to close unsaved tabs silently
    // Or normally "Close Other" closes ALL others? Let's just keep the tabId and unsaved ones, or if the user forces, just close others.
    // Standard behavior: close all others unless they have unsaved changes.
    setTabs(newTabs);
    if (!newTabs.find(t => t.id === activeTabId)) {
      setActiveTabId(tabId);
    }
  }

  function handleTabContextMenu(e: React.MouseEvent, tabId: string) {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      tabId: tabId,
    });
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

  async function exportPdf() {
    if (!activeTab) return;
    
    setIsExporting(true);
    setError("");
    
    const wasDark = document.documentElement.classList.contains("dark");
    
    try {
      // Temporarily remove dark class to force light mode styles in html2canvas rendering
      if (wasDark) {
        document.documentElement.classList.remove("dark");
      }
      
      // Wait 350ms to allow React to render the visible element and browser to complete layout/paint
      await new Promise((resolve) => setTimeout(resolve, 350));

      const element = document.getElementById("pdf-export-content");
      if (!element) {
        throw new Error("Export container not found");
      }

      // Load html2canvas and jsPDF dynamically
      // @ts-ignore
      const html2canvas = (await import("html2canvas")).default;
      // @ts-ignore
      const { jsPDF } = await import("jspdf");

      // Render canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0
      });

      // PDF layout specifications (A4)
      const margin = 15;
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
      
      const printableWidth = pageWidth - 2 * margin; // 180mm
      const printableHeight = pageHeight - 2 * margin; // 267mm
      
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      // Height of one page slice in canvas pixels
      const sliceHeightPixels = Math.floor(canvasWidth * (printableHeight / printableWidth));
      
      let sourceY = 0;
      let pageNum = 0;
      
      while (sourceY < canvasHeight) {
        if (pageNum > 0) {
          pdf.addPage();
        }
        
        // Create a temporary canvas for this slice
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvasWidth;
        const currentSliceHeight = Math.min(sliceHeightPixels, canvasHeight - sourceY);
        sliceCanvas.height = currentSliceHeight;
        
        const ctx = sliceCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(
            canvas,
            0, sourceY, canvasWidth, currentSliceHeight, // Source rect
            0, 0, canvasWidth, currentSliceHeight // Destination rect
          );
        }
        
        // Compress as JPEG to optimize size
        const sliceImgData = sliceCanvas.toDataURL("image/jpeg", 0.95);
        
        // Map height to PDF mm unit
        const destHeight = (currentSliceHeight * printableWidth) / canvasWidth;
        
        pdf.addImage(sliceImgData, "JPEG", margin, margin, printableWidth, destHeight);
        
        sourceY += sliceHeightPixels;
        pageNum++;
      }
      
      const pdfArrayBuffer = pdf.output("arraybuffer");
      const uint8Array = new Uint8Array(pdfArrayBuffer);
      
      const defaultName = activeTab.fileName.replace(/\.(md|markdown|txt)$/i, "") + ".pdf";
      const filePath = await save({
        filters: [{ name: "PDF Document", extensions: ["pdf"] }],
        defaultPath: defaultName
      });
      
      if (filePath) {
        await invoke("write_binary_file", { 
          path: filePath, 
          content: Array.from(uint8Array) 
        });
      }
    } catch (err: any) {
      console.error("Export PDF error:", err);
      const errorMessage = err?.message || String(err);
      setError(`Failed to export PDF: ${errorMessage}`);
    } finally {
      // Restore document styles and class
      if (wasDark) {
        document.documentElement.classList.add("dark");
      }
      setIsExporting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300 print:min-h-0 print:block relative z-10 bg-[#FAFAFA] dark:bg-[#18181B]">
      {/* Context Menu Overlay */}
      {contextMenu.visible && (
        <div
          className="fixed z-50 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.5)] rounded-lg py-1.5 text-sm text-gray-700 dark:text-zinc-200 outline-none w-48"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              closeAllTabs();
              setContextMenu({ ...contextMenu, visible: false });
            }}
            className="w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors"
          >
            Close All
          </button>
          <button
            onClick={() => {
              closeSavedTabs();
              setContextMenu({ ...contextMenu, visible: false });
            }}
            className="w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors"
          >
            Close Saved
          </button>
          {contextMenu.tabId && (
            <button
              onClick={() => {
                closeOtherTabs(contextMenu.tabId!);
                setContextMenu({ ...contextMenu, visible: false });
              }}
              className="w-full text-left px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-700/50 transition-colors"
            >
              Close Other
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-gray-200 dark:border-zinc-800 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0 transition-colors duration-300 print:hidden">
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
                  onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
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

      <div className="flex flex-1 overflow-hidden print:h-auto print:overflow-visible print:block" style={{ height: "calc(100vh - 120px)" }}>
        {/* Sidebar */}
        {explorerFiles && (
          <div className="flex flex-shrink-0 relative group print:hidden">
            <aside 
              className="border-r border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-[#121214] overflow-y-auto"
              style={{ width: sidebarWidth }}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-500 truncate pr-2 w-full" title={explorerRoot || ""}>
                    {explorerRoot ? explorerRoot.split("\\").pop() || explorerRoot.split("/").pop() : "Explorer"}
                  </h2>
                  <button 
                    onClick={async () => {
                      if (explorerRoot && !isRefreshing) {
                        setIsRefreshing(true);
                        await refreshTree(explorerRoot, expandedFolders);
                        setIsRefreshing(false);
                      }
                    }}
                    className={`p-1 flex-shrink-0 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-500 transition-all ${isRefreshing ? "animate-spin" : ""}`}
                    title="Refresh Explorer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 min-w-max">
                  {explorerFiles.map((entry, idx) => (
                    <FileTreeNode key={`${entry.path}-${idx}`} entry={entry} />
                  ))}
                </div>
              </div>
            </aside>
            {/* Resizer Handle */}
            <div
              className={`absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 z-20 ${
                isResizing ? "bg-blue-500/50" : "bg-transparent"
              } transition-colors`}
              onMouseDown={startResizing}
            />
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto w-full min-w-0 bg-white dark:bg-[#09090b] print:h-auto print:overflow-visible print:p-0 print:bg-white">
          <div className="max-w-5xl mx-auto px-6 py-8 print:p-0 print:max-w-full">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-300 dark:border-red-900 rounded-lg">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {activeTab ? (
          <>
            {/* Tab Controls */}
            <div className="mb-8 pb-4 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between print:hidden">
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
                  onClick={exportPdf}
                  disabled={isExporting}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isExporting
                      ? "bg-gray-200 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600 cursor-not-allowed"
                      : "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
                  }`}
                  title="Export directly to PDF"
                >
                  {isExporting ? (
                    <svg className="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                  )}
                  {isExporting ? "Exporting..." : "Export PDF"}
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
              <>
                <textarea
                  value={activeTab.content}
                  onChange={(e) => updateTabContent(activeTab.id, e.target.value)}
                  className="w-full min-h-[600px] p-4 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg text-gray-800 dark:text-zinc-200 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-500 resize-vertical print:hidden"
                  spellCheck={false}
                />
                <MarkdownViewer content={activeTab.content} isDark={isDark} isPrint={true} />
              </>
            ) : (
              <MarkdownViewer content={activeTab.content} isDark={isDark} />
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
      {/* Offscreen container for PDF export */}
      {activeTab && (
        <div 
          id="pdf-export-content" 
          style={{ 
            display: isExporting ? 'block' : 'none',
            position: 'absolute',
            top: '0',
            left: '0',
            width: '794px',
            zIndex: 999998,
            background: '#ffffff',
            color: '#111111',
            padding: '40px',
            boxSizing: 'border-box',
            height: 'auto',
            overflow: 'visible'
          }}
        >
          <MarkdownViewer content={activeTab.content} isDark={false} isPrint={true} />
        </div>
      )}
      {/* Fullscreen loading overlay during PDF export */}
      {isExporting && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999999] flex flex-col items-center justify-center text-white gap-4">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="font-semibold text-lg">Generating PDF...</p>
          <p className="text-sm text-white/70">Please wait, formatting layout...</p>
        </div>
      )}
    </div>
  );
}

export default App;
