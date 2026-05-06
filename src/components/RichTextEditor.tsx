import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Undo2,
} from "lucide-react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Props = {
  value: string;
  onChange: (nextHtml: string) => void;
  placeholder?: string;
  className?: string;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
          class:
          "min-h-full px-3 py-2 text-sm focus:outline-none [&_p.is-editor-empty:first-child::before]:text-muted-foreground/70",
      },
    },
    onUpdate: ({ editor }) => {
      const dirty = editor.getHTML();
      // Store sanitized HTML (safe to render later).
      const clean = DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
      onChange(clean);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== (value || "")) {
      editor.commands.setContent(value || "");
    }
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background/70 p-1.5 backdrop-blur">
        <Button
          type="button"
          size="icon-sm"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
          title="Bold"
        >
          <Bold className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
          title="Italic"
        >
          <Italic className="size-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-7" />

        <Button
          type="button"
          size="icon-sm"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bulleted list"
          title="Bulleted list"
        >
          <List className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Numbered list"
          title="Numbered list"
        >
          <ListOrdered className="size-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-7" />

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
          aria-label="Undo"
          title="Undo"
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
          aria-label="Redo"
          title="Redo"
        >
          <Redo2 className="size-4" />
        </Button>
      </div>

      <div className="h-32 overflow-y-auto rounded-md border border-border bg-background">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
