import { useId } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { toast } from "@/components/ui/toast";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Spinner } from "./ui/spinner";
import { MAX_BUDGET_VIEW_DESCRIPTION_LENGTH } from "@/constants";
import { appHotkeys } from "@/lib/hotkeys";
import { HotkeyHint } from "./ShortcutKeys";

type Props = {
  onAdd: (title: string, description: string) => void;
  onCancel: () => void;
  isPending?: boolean;
};

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z
    .string()
    .max(
      MAX_BUDGET_VIEW_DESCRIPTION_LENGTH,
      `Description must be at most ${MAX_BUDGET_VIEW_DESCRIPTION_LENGTH} characters`,
    ),
});

export const AddView = (props: Props) => {
  const titleId = useId();
  const descriptionId = useId();

  const form = useForm({
    defaultValues: {
      title: "",
      description: "",
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmitInvalid: () => {
      toast.add({ type: "error", title: "Please enter a view title." });
    },
    onSubmit: ({ value }) => {
      props.onAdd(value.title, value.description ?? "");
    },
  });

  const handleCancel = () => {
    if (props.isPending) return;
    form.reset();
    props.onCancel();
  };

  useHotkey("Escape", handleCancel);
  useHotkey(appHotkeys["form.submit"], () => form.handleSubmit(), {
    enabled: !props.isPending,
  });

  return (
    <div className="w-full rounded-xl bg-card text-card-foreground shadow-(--custom-shadow)">
      <div className="p-4">
        <div className="flex w-full gap-1">
          <form
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <div className="col-start-1 row-start-1 min-w-0">
              <form.Field
                name="title"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <>
                      <Label htmlFor={titleId} className="sr-only">
                        View title
                      </Label>
                      <Input
                        id={titleId}
                        name={field.name}
                        placeholder="View title"
                        className="w-full border-0 bg-transparent! shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        autoFocus
                        disabled={props.isPending}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                      />
                    </>
                  );
                }}
              />
            </div>
            <div className="col-span-2 row-start-2 min-w-0">
              <form.Field
                name="description"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <>
                      <Label htmlFor={descriptionId} className="sr-only">
                        Description
                      </Label>
                      <Textarea
                        id={descriptionId}
                        name={field.name}
                        placeholder="Description (optional)"
                        className="resize-none border-0 bg-transparent! shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        disabled={props.isPending}
                        maxLength={MAX_BUDGET_VIEW_DESCRIPTION_LENGTH}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                      />
                    </>
                  );
                }}
              />
            </div>
            <div className="col-start-2 row-start-1 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={props.isPending}
                onClick={handleCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="secondary"
                size="xs"
                disabled={props.isPending}
              >
                {props.isPending ? (
                  <>
                    <Spinner className="size-3.5" />
                    <span className="sr-only">Creating view</span>
                  </>
                ) : (
                  <>
                    Add view
                    <HotkeyHint id="form.submit" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
