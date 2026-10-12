import { useState } from "react";
import { ZoomIn, ZoomOut, RotateCw } from "lucide-react";

interface ImageViewerProps {
  src: string;
  fileName: string;
  isDark: boolean;
  isPrint?: boolean;
}

export function ImageViewer({ src, fileName, isDark, isPrint = false }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const handleZoomIn = () => setScale(prev => Math.min(Number((prev + 0.25).toFixed(2)), 5));
  const handleZoomOut = () => setScale(prev => Math.max(Number((prev - 0.25).toFixed(2)), 0.25));
  const handleReset = () => {
    setScale(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const ext = fileName.split('.').pop()?.toUpperCase() || 'IMAGE';

  return (
    <div className="flex flex-col gap-3">
      {/* Controls Bar */}
      {!isPrint && (
        <div className="flex items-center justify-between bg-gray-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-zinc-800 text-xs text-gray-600 dark:text-zinc-300">
          <div className="flex items-center gap-2 font-medium">
            <span className="font-semibold uppercase tracking-wider text-blue-600 dark:text-cyan-400">{ext}</span>
            {dimensions && (
              <span className="text-gray-400 dark:text-zinc-500 font-mono text-[11px]">
                {dimensions.width} × {dimensions.height} px
              </span>
            )}
            <span className="text-gray-400 dark:text-zinc-500 font-mono text-[11px]">
              {Math.round(scale * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              title="Zoom Out (-25%)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleReset}
              className="px-2 py-1 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              title="Reset Zoom & Rotation (100%)"
            >
              100%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              title="Zoom In (+25%)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button
              onClick={handleRotate}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              title="Rotate 90° Clockwise"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Image Canvas Container */}
      <div 
        className="relative overflow-auto border border-gray-200 dark:border-zinc-800 rounded-lg flex items-center justify-center p-8 min-h-[500px]"
        style={{
          backgroundColor: isDark ? "#121214" : "#f9fafb",
          backgroundImage: isDark
            ? "radial-gradient(#27272a 1px, transparent 1px)"
            : "radial-gradient(#e5e7eb 1px, transparent 1px)",
          backgroundSize: "16px 16px"
        }}
      >
        <img
          src={src}
          alt={fileName}
          onLoad={(e) => {
            const img = e.currentTarget;
            setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          }}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: "transform 0.15s ease-out",
            maxWidth: scale === 1 ? "100%" : "none",
            maxHeight: scale === 1 ? "75vh" : "none",
            objectFit: "contain",
          }}
          className="rounded shadow-md select-none max-w-full"
        />
      </div>
    </div>
  );
}
