// Renders the structured rich-content block model (v0.5 B1.5) as semantic React elements.
// Every block/inline variant maps to a fixed element — there is no dangerouslySetInnerHTML and
// no path from source HTML to executable markup, so the output is XSS-inert by construction.
// Images already point at our same-origin /api/img proxy (set in rich-blocks.ts).

import type { InlineSpan, RichBlock } from "@/content/rich-blocks";

function Spans({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((span, i) => {
        let node: React.ReactNode = span.text;
        if (span.code) node = <code>{node}</code>;
        if (span.bold) node = <strong>{node}</strong>;
        if (span.italic) node = <em>{node}</em>;
        if (span.href) {
          node = (
            <a href={span.href} target="_blank" rel="noreferrer nofollow noopener">
              {node}
            </a>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function Block({ block }: { block: RichBlock }) {
  switch (block.type) {
    case "heading": {
      if (block.level === 2) return <h2><Spans spans={block.spans} /></h2>;
      if (block.level === 3) return <h3><Spans spans={block.spans} /></h3>;
      return <h4><Spans spans={block.spans} /></h4>;
    }
    case "paragraph":
      return <p><Spans spans={block.spans} /></p>;
    case "quote":
      return <blockquote><Spans spans={block.spans} /></blockquote>;
    case "list":
      return block.ordered ? (
        <ol>{block.items.map((item, i) => <li key={i}><Spans spans={item} /></li>)}</ol>
      ) : (
        <ul>{block.items.map((item, i) => <li key={i}><Spans spans={item} /></li>)}</ul>
      );
    case "code":
      return <pre className="rich-code"><code>{block.code}</code></pre>;
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- proxied external images, dimensions unknown
        <img className="rich-image" src={block.src} alt={block.alt} loading="lazy" decoding="async" />
      );
    case "table":
      return (
        <div className="rich-table-wrap">
          <table className="rich-table">
            {block.header.length > 0 && (
              <thead>
                <tr>{block.header.map((cell, i) => <th key={i}>{cell}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function RichContent({ blocks }: { blocks: RichBlock[] }) {
  return (
    <div className="rich-content">
      {blocks.map((block, i) => <Block key={i} block={block} />)}
    </div>
  );
}
