import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Raw HTML in the source is not rendered (react-markdown's default), so agent output stays inert.
const components: Components = {
  h1: ({ children }) => <h4 className="mt-4 text-base font-semibold first:mt-0">{children}</h4>,
  h2: ({ children }) => <h4 className="mt-4 text-base font-semibold first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="mt-3 font-semibold first:mt-0">{children}</h5>,
  h4: ({ children }) => <h5 className="mt-3 font-semibold first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="mt-2 leading-relaxed first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b px-2 py-1 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b px-2 py-1 align-top">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
