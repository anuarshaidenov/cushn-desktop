import { useEditor, EditorContent, EditorContext } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { useMemo, useState } from "react";
import type { Id } from "@shared/domain";
import { useUpdateBudget } from "@/data/budgets";
import { useDebouncedSave } from "@/hooks/use-debounced-save";
import { toast } from "@/components/ui/toast";

type Props = {
  description: string | null;
  budgetId: Id<"budgets">;
};

export const BudgetDetailsRich = (props: Props) => {
  const [content, setContent] = useState(props.description || "");
  // Empty goes the HTML path: Markdown parses "" to no paragraph for the placeholder.
  const initialContentType = !content ? "html" : "markdown";
  const { mutateAsync } = useUpdateBudget();

  useDebouncedSave(content, props.description ?? "", async (description) => {
    try {
      await mutateAsync({ budgetId: props.budgetId, description });
    } catch (error) {
      console.error(error);
      toast.add({
        type: "error",
        title: "Failed to update budget description",
      });
    }
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Placeholder.configure({
        placeholder: "Add description",
      }),
    ],
    content: content,
    contentType: initialContentType,
    onUpdate: ({ editor }) => {
      setContent(editor.getMarkdown());
    },
    editorProps: {
      attributes: {
        "data-escape-navigates": "",
        class:
          "prose w-full mx-auto focus:outline-none dark:prose-invert max-w-none text-foreground prose-p:my-0 prose-h2:mt-4",
      },
      // ProseMirror prevents the default of every Escape, which would read as claimed; skip it.
      handleDOMEvents: { keydown: (_view, event) => event.key === "Escape" },
    },
  });

  const providerValue = useMemo(() => ({ editor }), [editor]);

  return (
    <EditorContext.Provider value={providerValue}>
      <EditorContent editor={editor} />
    </EditorContext.Provider>
  );
};
