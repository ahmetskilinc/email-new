// @ts-nocheck
"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import {
  StarterKit,
  TiptapUnderline,
  TiptapLink,
  TextStyle,
  Color,
  Placeholder,
} from "novel"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect } from "react"

interface SignatureEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export function SignatureEditor({
  value,
  onChange,
  placeholder = "Your signature...",
}: SignatureEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
      }),
      TiptapUnderline,
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[120px] px-3 py-2 focus:outline-none",
      },
    },
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value)
    }
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap gap-0.5 border-b px-1 py-1">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className="italic"
        >
          I
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className="underline"
        >
          U
        </ToolbarButton>
        <div className="mx-1 w-px bg-border" />
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          List
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run()
            } else {
              const url = window.prompt("URL")
              if (url) {
                try {
                  const parsed = new URL(url)
                  if (!parsed.protocol.startsWith("http")) {
                    return
                  }
                  editor
                    .chain()
                    .focus()
                    .setLink({ href: parsed.toString() })
                    .run()
                } catch {
                  // Invalid URL
                }
              }
            }
          }}
        >
          Link
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarButton({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  )
}
