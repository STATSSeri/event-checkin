'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useCallback, useEffect } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 高さの最小値（Tailwind class） */
  minHeightClass?: string;
}

/**
 * イベント説明文用のシンプルなリッチテキストエディタ
 * 機能: 太字 / 斜体 / リンク のみ
 * 出力: HTML（メール本文にそのまま埋め込まれる）
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightClass = 'min-h-[80px]',
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 余計な装飾は無効化（見出し・引用・リスト・コードブロック等）
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
    ],
    content: value || '',
    onUpdate({ editor }) {
      const html = editor.getHTML();
      // TipTapは空の状態を <p></p> として返すので、そのときは空文字に正規化
      onChange(html === '<p></p>' ? '' : html);
    },
    immediatelyRender: false, // SSR対策：Next.js App Routerでhydration mismatchを避ける
    editorProps: {
      attributes: {
        class: `rich-content focus:outline-none px-3 py-2 ${minHeightClass} text-sm text-gray-800`,
      },
    },
  });

  // 外部からvalueがリセットされた場合に追従（編集キャンセル等）
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML() && value !== '') {
      editor.commands.setContent(value, { emitUpdate: false });
    } else if (value === '' && editor.getHTML() !== '<p></p>') {
      editor.commands.setContent('', { emitUpdate: false });
    }
  }, [editor, value]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('リンクURL（空欄で解除）', previousUrl ?? '');
    if (url === null) return; // キャンセル
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    // http/https以外（例: javascript:）を弾く
    if (!/^https?:\/\//i.test(url)) {
      alert('URLは http:// または https:// で始まる必要があります');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return (
      <div className="border border-gray-300 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-400">
        読み込み中...
      </div>
    );
  }

  const toolbarBtn =
    'px-2 py-1 text-sm rounded hover:bg-gray-200 transition-colors';
  const activeBtn = 'bg-gray-300';

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
      {/* ツールバー */}
      <div className="flex items-center gap-1 border-b border-gray-200 px-2 py-1 bg-gray-50">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${toolbarBtn} ${editor.isActive('bold') ? activeBtn : ''}`}
          title="太字"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${toolbarBtn} italic ${
            editor.isActive('italic') ? activeBtn : ''
          }`}
          title="斜体"
        >
          I
        </button>
        <button
          type="button"
          onClick={setLink}
          className={`${toolbarBtn} ${editor.isActive('link') ? activeBtn : ''}`}
          title="リンク"
        >
          🔗
        </button>
        <span className="ml-2 text-xs text-gray-400">
          {placeholder ?? ''}
        </span>
      </div>

      {/* エディタ本体 */}
      <EditorContent editor={editor} />
    </div>
  );
}
