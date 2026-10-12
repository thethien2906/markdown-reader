import { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Rows } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfViewerProps {
  base64Data: string;
  isDark: boolean;
  isPrint?: boolean;
}

export function PdfViewer({ base64Data, isDark, isPrint = false }: PdfViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [rotation, setRotation] = useState<number>(0);
  const [isContinuous, setIsContinuous] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load PDF document from base64 data
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError("");

    try {
      // Decode base64
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      loadingTask.promise
        .then((doc) => {
          if (!isCancelled) {
            setPdfDoc(doc);
            setNumPages(doc.numPages);
            setCurrentPage(1);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            console.error("PDF load error:", err);
            setError(`Failed to parse PDF document: ${err?.message || err}`);
            setLoading(false);
          }
        });
    } catch (err: any) {
      setError(`Failed to decode PDF data: ${err?.message || err}`);
      setLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [base64Data]);

  // Render current page in single-page mode
  useEffect(() => {
    if (!pdfDoc || isContinuous) return;

    let renderTask: any = null;
    let isCancelled = false;

    pdfDoc.getPage(currentPage).then((page: any) => {
      if (isCancelled || !canvasRef.current) return;

      const viewport = page.getViewport({ scale, rotation });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        renderTask = page.render({ canvasContext: ctx, viewport });
        renderTask.promise.catch((err: any) => {
          if (err?.name !== "RenderingCancelledException") {
            console.error("PDF page render error:", err);
          }
        });
      }
    });

    return () => {
      isCancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, currentPage, scale, rotation, isContinuous]);

  const handlePrevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const handleNextPage = () => setCurrentPage((p) => Math.min(p + 1, numPages));
  const handleZoomIn = () => setScale((s) => Math.min(Number((s + 0.2).toFixed(1)), 3.0));
  const handleZoomOut = () => setScale((s) => Math.max(Number((s - 0.2).toFixed(1)), 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls Bar */}
      {!isPrint && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-zinc-800 text-xs text-gray-600 dark:text-zinc-300">
          <div className="flex items-center gap-2 font-medium">
            <span className="font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">PDF</span>
            {numPages > 0 && (
              <span className="text-gray-400 dark:text-zinc-500 font-mono text-[11px]">
                {numPages} {numPages === 1 ? "page" : "pages"}
              </span>
            )}
          </div>

          {numPages > 0 && (
            <div className="flex items-center gap-2">
              {/* Page Navigation */}
              {!isContinuous && (
                <div className="flex items-center gap-1 bg-white dark:bg-zinc-700/60 px-1.5 py-0.5 rounded border border-gray-200 dark:border-zinc-600 shadow-sm">
                  <button
                    onClick={handlePrevPage}
                    disabled={currentPage <= 1}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-600 disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-1.5 font-mono text-xs text-gray-700 dark:text-zinc-200">
                    {currentPage} / {numPages}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage >= numPages}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-600 disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Zoom and Rotate Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleZoomOut}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setScale(1.0)}
                  className="px-2 py-1 rounded text-xs font-mono font-medium hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                  title="Reset Zoom (100%)"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button
                  onClick={handleZoomIn}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRotate}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                  title="Rotate Clockwise"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
                <button
                  onClick={() => setIsContinuous(!isContinuous)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    isContinuous
                      ? "bg-blue-100 dark:bg-cyan-950/50 text-blue-700 dark:text-cyan-400 border border-blue-200 dark:border-cyan-800"
                      : "hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-zinc-400"
                  }`}
                  title={isContinuous ? "Switch to single page view" : "Switch to continuous scroll"}
                >
                  <Rows className="w-3.5 h-3.5" />
                  {isContinuous ? "All Pages" : "Single Page"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading & Error States */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-16 text-gray-500">
          <div className="w-8 h-8 border-3 border-red-500/30 border-t-red-500 rounded-full animate-spin mb-3" />
          <p className="text-sm font-medium">Loading PDF document...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* PDF Viewport */}
      {!loading && !error && (
        <div
          className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-auto p-8 flex flex-col items-center gap-6 min-h-[600px]"
          style={{
            backgroundColor: isDark ? "#18181b" : "#f4f4f5",
          }}
        >
          {isContinuous ? (
            Array.from({ length: numPages }, (_, i) => i + 1).map((pNum) => (
              <ContinuousPdfPage
                key={`pdf-page-${pNum}`}
                pdfDoc={pdfDoc}
                pageNumber={pNum}
                scale={scale}
                rotation={rotation}
              />
            ))
          ) : (
            <div className="flex flex-col items-center gap-2">
              <canvas ref={canvasRef} className="rounded-sm shadow-xl bg-white max-w-full" />
              <span className="text-xs text-gray-500 dark:text-zinc-500 font-mono">
                Page {currentPage} of {numPages}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContinuousPdfPage({
  pdfDoc,
  pageNumber,
  scale,
  rotation,
}: {
  pdfDoc: any;
  pageNumber: number;
  scale: number;
  rotation: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let renderTask: any = null;
    let isCancelled = false;

    pdfDoc.getPage(pageNumber).then((page: any) => {
      if (isCancelled || !canvasRef.current) return;

      const viewport = page.getViewport({ scale, rotation });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        renderTask = page.render({ canvasContext: ctx, viewport });
        renderTask.promise.catch((err: any) => {
          if (err?.name !== "RenderingCancelledException") {
            console.error("PDF continuous render error:", err);
          }
        });
      }
    });

    return () => {
      isCancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNumber, scale, rotation]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <canvas ref={canvasRef} className="rounded-sm shadow-xl bg-white max-w-full" />
      <span className="text-[11px] text-gray-400 dark:text-zinc-500 font-mono">
        Page {pageNumber}
      </span>
    </div>
  );
}
