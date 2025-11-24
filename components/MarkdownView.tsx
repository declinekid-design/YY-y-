import React from 'react';

// A lightweight markdown-like parser to avoid heavy dependencies
// Handles code blocks, bold, and line breaks
const MarkdownView: React.FC<{ content: string }> = ({ content }) => {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-sm md:text-base leading-relaxed space-y-2">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          const lines = part.split('\n');
          const lang = lines[0].replace('```', '').trim();
          const code = lines.slice(1, -1).join('\n');
          return (
            <div key={index} className="my-3 rounded-lg overflow-hidden bg-black/50 border border-white/10">
              {lang && (
                <div className="bg-white/10 px-3 py-1 text-xs font-mono text-gray-300 border-b border-white/10">
                  {lang}
                </div>
              )}
              <pre className="p-4 overflow-x-auto text-sm font-mono text-emerald-400">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        
        // Handle bold text and paragraphs
        return (
          <div key={index}>
             {part.split('\n').map((line, lineIdx) => {
               if (!line) return <div key={lineIdx} className="h-2" />;
               // Simple bold parser
               const lineParts = line.split(/(\*\*.*?\*\*)/g);
               return (
                 <p key={lineIdx} className="min-h-[1.2em]">
                   {lineParts.map((p, pIdx) => {
                     if (p.startsWith('**') && p.endsWith('**')) {
                       return <strong key={pIdx} className="text-white font-semibold">{p.slice(2, -2)}</strong>;
                     }
                     return <span key={pIdx} className="text-gray-300">{p}</span>;
                   })}
                 </p>
               );
             })}
          </div>
        );
      })}
    </div>
  );
};

export default MarkdownView;