import ReactMarkdown from "react-markdown";

// Claude-written digest. Rendered to React elements (no raw HTML is ever injected), with
// links limited to http(s) and opened safely.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 leading-relaxed [&_a]:text-accent [&_a]:underline [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc">
      <ReactMarkdown
        skipHtml
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : "")}
        components={{
          a: ({ href, children: text }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {text}
            </a>
          ),
          img: () => null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
