import { Component, useEffect, useMemo, useState, type ReactNode, type ErrorInfo } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';

interface BlockViewerProps {
  content: any;
  className?: string;
}

// ─── Error Boundary ─────────────────────────────────────────────
interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
  resetKey?: any;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class BlockNoteErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('BlockNote render error:', error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // content가 바뀌면 에러 상태 리셋
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// ─── Content Sanitizer ──────────────────────────────────────────
/**
 * content를 BlockNote가 파싱 가능한 형태로 정제
 * LLM이 잘못된 블록을 생성할 수 있으므로 방어적으로 처리
 */
function sanitizeContent(content: any): any[] | undefined {
  if (!content) return undefined;

  // 문자열이면 JSON 파싱 시도
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch {
      // 일반 텍스트 → paragraph 블록으로 변환
      return [{ type: 'paragraph', content: [{ type: 'text', text: content }] }];
    }
  }

  // 배열이 아니면
  if (!Array.isArray(content)) {
    return undefined;
  }

  // 빈 배열이면 기본 블록
  if (content.length === 0) {
    return undefined;
  }

  // 각 블록이 최소 type 필드를 갖도록 필터
  const filtered = content.filter(
    (block: any) => block && typeof block === 'object' && typeof block.type === 'string'
  );

  return filtered.length > 0 ? filtered : undefined;
}

// ─── Inner Editor (may throw) ───────────────────────────────────
function BlockNoteInner({ content, className }: { content: any[] | undefined; className: string }) {
  const editor = useCreateBlockNote({
    initialContent: content,
  });

  useEffect(() => {
    if (editor) {
      editor.isEditable = false;
    }
  }, [editor]);

  useEffect(() => {
    if (editor && content) {
      try {
        editor.replaceBlocks(editor.document, content);
      } catch (e) {
        console.error('Failed to update BlockNote content:', e);
      }
    }
  }, [editor, content]);

  return (
    <div className={`blocknote-viewer ${className}`}>
      <BlockNoteView
        editor={editor}
        editable={false}
        theme="light"
        data-theming-css-variables-demo
      />
      <BlockViewerStyles />
    </div>
  );
}

// ─── Fallback UI ────────────────────────────────────────────────
function FallbackViewer({ content, className }: { content: any; className: string }) {
  // 원본 텍스트를 최대한 추출하여 표시
  const text = useMemo(() => {
    try {
      const blocks = typeof content === 'string' ? JSON.parse(content) : content;
      if (!Array.isArray(blocks)) return JSON.stringify(content, null, 2);

      return blocks
        .map((block: any) => {
          if (!block?.content) return '';
          if (typeof block.content === 'string') return block.content;
          if (Array.isArray(block.content)) {
            return block.content
              .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
              .join('');
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    } catch {
      return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    }
  }, [content]);

  return (
    <div className={`blocknote-viewer ${className}`}>
      <div className="whitespace-pre-wrap text-content-secondary leading-relaxed p-4">
        {text || '콘텐츠를 표시할 수 없습니다.'}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────
export default function BlockViewer({ content, className = '' }: BlockViewerProps) {
  const safeContent = useMemo(() => sanitizeContent(content), [content]);

  return (
    <BlockNoteErrorBoundary
      resetKey={content}
      fallback={<FallbackViewer content={content} className={className} />}
    >
      <BlockNoteInner content={safeContent} className={className} />
    </BlockNoteErrorBoundary>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
function BlockViewerStyles() {
  return (
    <style>{`
      .blocknote-viewer .bn-container {
        background: transparent;
        font-family: inherit;
      }

      .blocknote-viewer .bn-editor {
        padding: 0;
      }

      .blocknote-viewer .bn-block-group {
        padding-left: 0;
      }

      .blocknote-viewer .bn-block-content {
        padding: 4px 0;
      }

      .blocknote-viewer [data-content-type="heading"] h1 {
        font-size: 1.875rem;
        font-weight: 700;
        line-height: 1.3;
        margin-top: 1.5rem;
        margin-bottom: 0.75rem;
        color: var(--color-content-primary);
      }

      .blocknote-viewer [data-content-type="heading"] h2 {
        font-size: 1.5rem;
        font-weight: 600;
        line-height: 1.4;
        margin-top: 1.25rem;
        margin-bottom: 0.5rem;
        color: var(--color-content-primary);
      }

      .blocknote-viewer [data-content-type="heading"] h3 {
        font-size: 1.25rem;
        font-weight: 600;
        line-height: 1.5;
        margin-top: 1rem;
        margin-bottom: 0.5rem;
        color: var(--color-content-primary);
      }

      .blocknote-viewer [data-content-type="paragraph"] {
        color: var(--color-content-secondary);
        line-height: 1.75;
      }

      .blocknote-viewer [data-content-type="bulletListItem"],
      .blocknote-viewer [data-content-type="numberedListItem"] {
        color: var(--color-content-secondary);
        line-height: 1.75;
      }

      .blocknote-viewer [data-content-type="checkListItem"] {
        color: var(--color-content-secondary);
      }

      .blocknote-viewer [data-content-type="codeBlock"] {
        background: var(--color-surface-secondary);
        border-radius: 0.75rem;
        padding: 1rem;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 0.875rem;
        overflow-x: auto;
      }

      .blocknote-viewer blockquote {
        border-left: 4px solid var(--color-primary-500);
        padding-left: 1rem;
        margin: 1rem 0;
        color: var(--color-content-tertiary);
        font-style: italic;
      }

      .blocknote-viewer a {
        color: var(--color-primary-500);
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .blocknote-viewer a:hover {
        color: var(--color-primary-600);
      }

      .blocknote-viewer table {
        width: 100%;
        border-collapse: collapse;
        margin: 1rem 0;
      }

      .blocknote-viewer th,
      .blocknote-viewer td {
        border: 1px solid var(--color-border-primary);
        padding: 0.75rem;
        text-align: left;
      }

      .blocknote-viewer th {
        background: var(--color-surface-secondary);
        font-weight: 600;
      }

      .blocknote-viewer hr {
        border: none;
        border-top: 1px solid var(--color-border-primary);
        margin: 2rem 0;
      }

      .blocknote-viewer img {
        max-width: 100%;
        height: auto;
        border-radius: 0.75rem;
        margin: 1rem 0;
      }

      /* Dark mode */
      .dark .blocknote-viewer [data-content-type="heading"] h1,
      .dark .blocknote-viewer [data-content-type="heading"] h2,
      .dark .blocknote-viewer [data-content-type="heading"] h3 {
        color: var(--color-content-primary);
      }

      .dark .blocknote-viewer [data-content-type="paragraph"],
      .dark .blocknote-viewer [data-content-type="bulletListItem"],
      .dark .blocknote-viewer [data-content-type="numberedListItem"] {
        color: var(--color-content-secondary);
      }

      .dark .blocknote-viewer [data-content-type="codeBlock"] {
        background: var(--color-surface-tertiary);
      }
    `}</style>
  );
}
