// Renders the structured rich-content block model (v0.5 B1.5) as semantic React elements.
// Every block/inline variant maps to a fixed element — there is no dangerouslySetInnerHTML and
// no path from source HTML to executable markup, so the output is XSS-inert by construction.
// Images already point at our same-origin /api/img proxy (set in rich-blocks.ts).

import type { InlineSpan, RichBlock } from "@/content/rich-blocks";
import { ImageLightbox } from "./image-lightbox";

function hashKey(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function occurrenceKey(prefix: string, value: unknown, seen: Map<string, number>): string {
  const base = `${prefix}-${hashKey(JSON.stringify(value))}`;
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function Spans({ spans }: { spans: InlineSpan[] }) {
  const seen = new Map<string, number>();
  return (
    <>
      {spans.map((span) => {
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
        return <span key={occurrenceKey("span", span, seen)}>{node}</span>;
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
    case "list": {
      const seenItems = new Map<string, number>();
      return block.ordered ? (
        <ol>{block.items.map((item) => <li key={occurrenceKey("li", item, seenItems)}><Spans spans={item} /></li>)}</ol>
      ) : (
        <ul>{block.items.map((item) => <li key={occurrenceKey("li", item, seenItems)}><Spans spans={item} /></li>)}</ul>
      );
    }
    case "code":
      return <pre className="rich-code"><code>{block.code}</code></pre>;
    case "image":
      return (
        <ImageLightbox
          images={[{ src: block.src, alt: block.alt }]}
          triggerClassName="rich-image-button"
          imageClassName="rich-image"
        />
      );
    case "table":
      const seenHeaders = new Map<string, number>();
      const seenRows = new Map<string, number>();
      return (
        <div className="rich-table-wrap">
          <table className="rich-table">
            {block.header.length > 0 && (
              <thead>
                <tr>{block.header.map((cell) => <th key={occurrenceKey("th", cell, seenHeaders)}>{cell}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row) => {
                const seenCells = new Map<string, number>();
                return (
                  <tr key={occurrenceKey("tr", row, seenRows)}>
                    {row.map((cell) => <td key={occurrenceKey("td", cell, seenCells)}>{cell}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
  }
}

export function RichContent({ blocks }: { blocks: RichBlock[] }) {
  const seenBlocks = new Map<string, number>();
  return (
    <div className="rich-content">
      {blocks.map((block) => <Block key={occurrenceKey("block", block, seenBlocks)} block={block} />)}
    </div>
  );
}
