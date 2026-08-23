import type { ReactNode } from 'react';

// ponytail: renderer propio de ~40 lineas; react-markdown solo si crece el subset
const INLINE_RE = /\*\*(.+?)\*\*|`([^`]+)`/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] != null) parts.push(<strong key={`${keyBase}-b${k++}`}>{m[1]}</strong>);
    else parts.push(<code key={`${keyBase}-c${k++}`}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function MarkdownText({ content }: { content: string }) {
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  let liCount = 0;

  const flushList = (key: string) => {
    if (list.length) {
      blocks.push(<ul key={key}>{list}</ul>);
      list = [];
      liCount = 0;
    }
  };

  content.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      flushList(`ul-${i}`);
      return;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushList(`ul-${i}`);
      blocks.push(
        <div key={`h-${i}`} className={`ai-md-h ai-md-h${heading[1]!.length}`}>
          {renderInline(heading[2]!, `h-${i}`)}
        </div>,
      );
      return;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(<li key={`li-${i}-${liCount++}`}>{renderInline(bullet[1]!, `li-${i}`)}</li>);
      return;
    }
    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushList(`ul-${i}`);
      blocks.push(<hr key={`hr-${i}`} />);
      return;
    }
    flushList(`ul-${i}`);
    blocks.push(<p key={`p-${i}`}>{renderInline(line, `p-${i}`)}</p>);
  });
  flushList('ul-end');

  return <div className="ai-md">{blocks}</div>;
}
