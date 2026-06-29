import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid with default options
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
});

interface MermaidProps {
  code: string;
  isDark: boolean;
}

export function Mermaid({ code, isDark }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const id = `mermaid-${Math.floor(Math.random() * 1000000)}`;

    async function renderDiagram() {
      if (!containerRef.current) return;
      try {
        setError(null);
        
        // Re-initialize theme based on theme mode
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
        });

        // Use mermaid.render (which returns a promise containing svg)
        const { svg: renderedSvg } = await mermaid.render(id, code);
        
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        if (isMounted) {
          setSvg('');
          setError(err?.message || String(err));
        }
        
        // Clean up any dynamically appended bad element from the body (Mermaid does this on error)
        const badElement = document.getElementById(id);
        if (badElement) {
          badElement.remove();
        }
        const bindElement = document.getElementById(`d${id}`);
        if (bindElement) {
          bindElement.remove();
        }
      }
    }

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code, isDark]);

  if (error) {
    return (
      <div className="my-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg text-sm">
        <p className="font-semibold text-red-700 dark:text-red-400 mb-2">Mermaid Render Error:</p>
        <pre className="whitespace-pre-wrap font-mono text-xs text-red-600 dark:text-red-300 bg-red-100/50 dark:bg-red-950/40 p-2.5 rounded overflow-x-auto">
          {error}
        </pre>
        <pre className="mt-2 whitespace-pre font-mono text-xs text-gray-600 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-900 p-2.5 rounded overflow-x-auto">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="mermaid-container flex justify-center my-6 p-4 bg-gray-50 dark:bg-zinc-900/50 border border-gray-100 dark:border-zinc-800 rounded-xl overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg || '<div class="text-xs text-gray-400 dark:text-zinc-500 animate-pulse">Rendering diagram...</div>' }} 
    />
  );
}
