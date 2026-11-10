import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEffect, useState } from "react";
import type { Id } from "@shared/domain";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tick02Icon,
  MoreHorizontalCircle01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import { useDebounce } from "@uidotdev/usehooks";
import { useForm } from "@tanstack/react-form";
import { toast } from "@/components/ui/toast";
import * as z from "zod";
import {
  useCreateLabel,
  useDeleteLabel,
  useLabels,
  useUpdateLabelColor,
  useUpdateLabelName,
} from "@/data/labels";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type Label = {
  id: Id<"budgetLabels">;
  name: string;
  color: string;
};

const formSchema = z.object({
  name: z.string().min(1, "Label name is required").max(20),
});

export const ManageLabels = () => {
  const { data: labelsData } = useLabels();

  if (!labelsData) {
    return (
      <div className="flex h-62 w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return (
    <Card className="py-0">
      <CardContent className="px-0 py-0">
        <ul className="mb-4 flex flex-col text-sm">
          {labelsData.labels.map((label) => (
            <LabelItem key={label.id} label={label} />
          ))}
        </ul>
        <AddLabelForm />
      </CardContent>
    </Card>
  );
};

const LabelItem = ({ label }: { label: Label }) => {
  return (
    <li>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex w-full items-center gap-3">
          <LabelColor color={label.color} id={label.id} />
          <LabelName label={label} />
        </div>
        <LabelActions label={label} />
      </div>
    </li>
  );
};

// The mutation lives here: the menu item unmounts on click, which skips `mutate` callbacks.
const LabelActions = ({ label }: { label: Label }) => {
  const { isPending, mutate } = useDeleteLabel();

  const onDelete = () => {
    mutate(
      { labelId: label.id },
      {
        onSuccess: () => {
          toast.add({ type: "success", title: "Label deleted successfully" });
        },
        onError: () => {
          toast.add({ type: "error", title: "Failed to delete label" });
        },
      },
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={"ghost"} size={"icon-xs"} />}
      >
        {isPending ? <Spinner /> : <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} />}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DeleteItem isPending={isPending} onAction={onDelete} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const DeleteItem = ({
  isPending,
  onAction,
}: {
  isPending: boolean;
  onAction: () => void;
}) => {
  return (
    <DropdownMenuItem onClick={onAction} disabled={isPending}>
      {isPending ? <Spinner /> : <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />} Delete
    </DropdownMenuItem>
  );
};

const AddLabelForm = () => {
  const { isPending, mutate } = useCreateLabel();

  const form = useForm({
    defaultValues: {
      name: "",
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      mutate(
        { name: value.name, color: "#bec2c8" },
        {
          onSuccess: () => {
            toast.add({ type: "success", title: "Label added successfully" });
            form.reset();
          },
          onError: () => {
            toast.add({ type: "error", title: "Failed to add label" });
          },
        },
      );
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex items-center gap-2 px-4 pb-4"
    >
      <form.Field
        name="name"
        children={(field) => {
          return (
            <Input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              autoComplete="off"
              placeholder="Label name"
              className="h-8 max-w-40"
            />
          );
        }}
      />

      <Button disabled={isPending} type="submit" size={"sm"}>
        <Spinner className={`${isPending ? "inline-block" : "hidden"}`} />
        New label
      </Button>
    </form>
  );
};

const LabelColor = ({
  color,
  id,
}: {
  color: string;
  id: Id<"budgetLabels">;
}) => {
  const {
    mutate: updateLabelColor,
    isPending,
    variables,
  } = useUpdateLabelColor();
  const currentColor = isPending && variables ? variables.color : color;

  const onColorChange = (newColor: string) => {
    updateLabelColor({ labelId: id, color: newColor });
  };

  return (
    <Popover>
      <PopoverTrigger render={<Button variant={"ghost"} size={"icon-xs"} />}>
        <div
          className="size-3 rounded-full"
          style={{ backgroundColor: currentColor }}
        ></div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex items-center gap-4">
          <Button
            variant={"ghost"}
            size={"icon-xs"}
            className="relative"
            onClick={() => onColorChange("#bec2c8")}
          >
            <div
              className="size-4 shrink grow-0 rounded-full shadow-(--custom-shadow-control-solid)"
              style={{ backgroundColor: "#bec2c8" }}
            ></div>
            {currentColor === "#bec2c8" && (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="absolute inset-0 m-auto size-2 text-black" />
            )}
          </Button>
          <Button
            variant={"ghost"}
            size={"icon-xs"}
            onClick={() => onColorChange("#95a2b3")}
            className="relative"
          >
            <div
              className="size-4 shrink grow-0 rounded-full shadow-(--custom-shadow-control-solid)"
              style={{ backgroundColor: "#95a2b3" }}
            ></div>
            {currentColor === "#95a2b3" && (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="absolute inset-0 m-auto size-2 text-black" />
            )}
          </Button>
          <Button
            variant={"ghost"}
            size={"icon-xs"}
            onClick={() => onColorChange("#5e6ad2")}
            className="relative"
          >
            <div
              className="size-4 shrink grow-0 rounded-full shadow-(--custom-shadow-control-solid)"
              style={{ backgroundColor: "#5e6ad2" }}
            ></div>
            {currentColor === "#5e6ad2" && (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="absolute inset-0 m-auto size-2 text-white" />
            )}
          </Button>
          <Button
            variant={"ghost"}
            size={"icon-xs"}
            onClick={() => onColorChange("#26b5ce")}
            className="relative"
          >
            <div
              className="size-4 shrink grow-0 rounded-full shadow-(--custom-shadow-control-solid)"
              style={{ backgroundColor: "#26b5ce" }}
            ></div>
            {currentColor === "#26b5ce" && (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="absolute inset-0 m-auto size-2 text-white" />
            )}
          </Button>
          <Button
            variant={"ghost"}
            size={"icon-xs"}
            onClick={() => onColorChange("#4cb782")}
            className="relative"
          >
            <div
              className="size-4 shrink grow-0 rounded-full shadow-(--custom-shadow-control-solid)"
              style={{ backgroundColor: "#4cb782" }}
            ></div>
            {currentColor === "#4cb782" && (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="absolute inset-0 m-auto size-2 text-white" />
            )}
          </Button>
          <Button
            variant={"ghost"}
            size={"icon-xs"}
            onClick={() => onColorChange("#f0bf00")}
            className="relative"
          >
            <div
              className="size-4 shrink grow-0 rounded-full shadow-(--custom-shadow-control-solid)"
              style={{ backgroundColor: "#f0bf00" }}
            ></div>
            {currentColor === "#f0bf00" && (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="absolute inset-0 m-auto size-2 text-black" />
            )}
          </Button>
          <Button
            variant={"ghost"}
            size={"icon-xs"}
            onClick={() => onColorChange("#f2994a")}
            className="relative"
          >
            <div
              className="size-4 shrink grow-0 rounded-full shadow-(--custom-shadow-control-solid)"
              style={{ backgroundColor: "#f2994a" }}
            ></div>
            {currentColor === "#f2994a" && (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="absolute inset-0 m-auto size-2 text-white" />
            )}
          </Button>
          <Button
            variant={"ghost"}
            size={"icon-xs"}
            onClick={() => onColorChange("#f7c8c1")}
            className="relative"
          >
            <div
              className="size-4 shrink grow-0 rounded-full shadow-(--custom-shadow-control-solid)"
              style={{ backgroundColor: "#f7c8c1" }}
            ></div>
            {currentColor === "#f7c8c1" && (
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="absolute inset-0 m-auto size-2 text-black" />
            )}
          </Button>
          <input
            type="color"
            value={currentColor}
            onChange={(e) => onColorChange(e.target.value)}
            className="h-8 w-8 cursor-pointer border-0 p-0"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

const LabelName = ({ label }: { label: Label }) => {
  const [value, setValue] = useState(label.name);
  const debouncedValue = useDebounce(value, 500);
  const { mutate: updateLabelName } = useUpdateLabelName();

  useEffect(() => {
    if (debouncedValue === label.name) return;
    if (!debouncedValue.trim()) {
      toast.add({ type: "error", title: "Label name is required" });
      return;
    }
    updateLabelName({
      labelId: label.id,
      name: debouncedValue,
    });
  }, [debouncedValue]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value.length > 20) return;
    setValue(e.target.value);
  };

  const onBlur = () => {
    if (!value.trim()) setValue(label.name);
  };

  return (
    <Input
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      className="hover:bg-accent/50! h-8 max-w-32 border-none bg-transparent! focus:ring-0"
    />
  );
};
