import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupNumericInput,
} from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { toast } from "@/components/ui/toast";
import { useCreateTemplate, useUpdateTemplate } from "@/data/templates";
import { Spinner } from "./ui/spinner";
import { useHotkey } from "@tanstack/react-hotkeys";
import { appHotkeys } from "@/lib/hotkeys";
import { HotkeyHint } from "./ShortcutKeys";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import type { TemplateWithCategories } from "@shared/api";
import type { Id } from "@shared/domain";
import { sumsTo100 } from "@shared/money";

const formSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    categories: z.array(
      z.object({
        name: z.string().min(1, "Name is required"),
        percentage: z
          .number()
          .min(0, "Percentage must be at least 0")
          .max(100, "Percentage must be less than or equal to 100"),
        description: z.string().optional(),
        editable: z.boolean(),
      }),
    ),
  })
  .refine(
    // Same rule as the repository.
    (data) => sumsTo100(data.categories.map((cat) => cat.percentage || 0)),
    {
      message: "The sum of all category percentages must equal 100%",
      path: ["categories"],
    },
  );

export const NewTemplateForm = () => {
  const router = useRouter();
  const { mutate, isPending } = useCreateTemplate();
  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
      categories: [
        {
          name: "Essential expenses",
          percentage: 50,
          description: "Rent, groceries, utilities, and transportation",
          editable: true,
        },
      ],
    },
    validators: {
      // @ts-expect-error
      onSubmit: formSchema,
    },
    onSubmitInvalid: (form) => {
      const errorMessages: string[] = [];
      const values = form.value;

      if (!values.name || values.name.trim() === "") {
        errorMessages.push("Template name is required");
      }

      if (!values.categories || values.categories.length === 0) {
        errorMessages.push("At least one category is required");
      } else {
        values.categories.forEach((cat, index) => {
          if (!cat.name || cat.name.trim() === "") {
            errorMessages.push(`Category ${index + 1}: Name is required`);
          }
          if (cat.percentage < 0) {
            errorMessages.push(
              `Category ${index + 1}: Percentage must be at least 0`,
            );
          }
          if (cat.percentage > 100) {
            errorMessages.push(
              `Category ${index + 1}: Percentage must be less than or equal to 100`,
            );
          }
        });

        const percentages = values.categories.map((cat) => cat.percentage || 0);
        const sum = percentages.reduce(
          (acc, percentage) => acc + percentage,
          0,
        );
        if (!sumsTo100(percentages)) {
          errorMessages.push(
            `Category percentages sum to ${sum.toFixed(2)}%. They must sum to exactly 100%.`,
          );
        }
      }

      if (errorMessages.length > 0) {
        toast.add({ type: "error", title: errorMessages.join(". ") });
      } else {
        toast.add({
          type: "error",
          title: "Please fill in all required fields correctly.",
        });
      }
    },
    onSubmit: async ({ value }) => {
      mutate(value, {
        onSuccess: () => {
          toast.add({
            type: "success",
            title: "Template created",
          });
          router.navigate({ to: "/settings/templates" });
        },
        onError: () => {
          toast.add({ type: "error", title: "Failed to create template" });
        },
      });
    },
  });

  useHotkey(appHotkeys["form.submit"], () => form.handleSubmit());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-col items-start gap-4"
    >
      <form.Field
        name="name"
        children={(field) => {
          return (
            <Input
              aria-invalid={
                !field.state.meta.isValid && field.state.meta.isTouched
              }
              type="text"
              className="border-transparent"
              placeholder="Template name"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          );
        }}
      />

      <form.Field
        name="description"
        children={(field) => {
          return (
            <Textarea
              aria-invalid={
                !field.state.meta.isValid && field.state.meta.isTouched
              }
              className="resize-none border-transparent"
              placeholder="Template description"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          );
        }}
      />

      <form.Field
        name="categories"
        children={(field) => {
          return (
            <Categories
              field={{
                state: {
                  value: (field.state.value as CategoryValue[]).map((cat) => ({
                    ...cat,
                    description: cat.description ?? "",
                  })),
                },
                handleChange: field.handleChange,
              }}
            />
          );
        }}
      />

      <div className="flex items-center gap-2 self-end">
        <Link to="/settings/templates">
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>
        <Button disabled={isPending} type="submit">
          {isPending ? (
            <Spinner />
          ) : (
            <>
              Create
              <HotkeyHint id="form.submit" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

type EditTemplateFormProps = {
  template: TemplateWithCategories;
};

export const EditTemplateForm = ({ template }: EditTemplateFormProps) => {
  const router = useRouter();

  const form = useForm({
    defaultValues: {
      name: template.name,
      description: template.description ?? "",
      categories: template.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        percentage: cat.percentage,
        description: cat.description ?? "",
        editable: cat.editable,
      })),
    },
    validators: {
      // @ts-expect-error
      onSubmit: formSchema,
    },
    onSubmitInvalid: (form) => {
      const errorMessages: string[] = [];
      const values = form.value;

      if (!values.name || values.name.trim() === "") {
        errorMessages.push("Template name is required");
      }

      if (!values.categories || values.categories.length === 0) {
        errorMessages.push("At least one category is required");
      } else {
        values.categories.forEach((cat, index) => {
          if (!cat.name || cat.name.trim() === "") {
            errorMessages.push(`Category ${index + 1}: Name is required`);
          }
          if (cat.percentage < 0) {
            errorMessages.push(
              `Category ${index + 1}: Percentage must be at least 0`,
            );
          }
          if (cat.percentage > 100) {
            errorMessages.push(
              `Category ${index + 1}: Percentage must be less than or equal to 100`,
            );
          }
        });

        const percentages = values.categories.map((cat) => cat.percentage || 0);
        const sum = percentages.reduce(
          (acc, percentage) => acc + percentage,
          0,
        );
        if (!sumsTo100(percentages)) {
          errorMessages.push(
            `Category percentages sum to ${sum.toFixed(
              2,
            )}%. They must sum to exactly 100%.`,
          );
        }
      }

      if (errorMessages.length > 0) {
        toast.add({ type: "error", title: errorMessages.join(". ") });
      } else {
        toast.add({
          type: "error",
          title: "Please fill in all required fields correctly.",
        });
      }
    },
    onSubmit: async ({ value }) => {
      mutate(
        {
          templateId: template.id,
          name: value.name,
          description: value.description,
          categories: value.categories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            percentage: cat.percentage,
            description: cat.description ?? "",
            editable: cat.editable,
          })),
        },
        {
          onSuccess: () => {
            toast.add({
              type: "success",
              title: "Template updated successfully!",
            });
          },
          onError: () => {
            toast.add({ type: "error", title: "Failed to update template" });
          },
        },
      );
    },
  });

  const { mutate, isPending } = useUpdateTemplate();

  useHotkey(appHotkeys["form.submit"], () => form.handleSubmit());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-col items-start gap-4"
    >
      <form.Field
        name="name"
        children={(field) => {
          return (
            <Input
              aria-invalid={
                !field.state.meta.isValid && field.state.meta.isTouched
              }
              type="text"
              className="border-transparent"
              placeholder="Template name"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          );
        }}
      />

      <form.Field
        name="description"
        children={(field) => {
          return (
            <Textarea
              aria-invalid={
                !field.state.meta.isValid && field.state.meta.isTouched
              }
              className="resize-none border-transparent"
              placeholder="Template description"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          );
        }}
      />

      <form.Field
        name="categories"
        children={(field) => {
          return (
            <Categories
              field={{
                state: {
                  value: (field.state.value as CategoryValue[]).map((cat) => ({
                    ...cat,
                    description: cat.description ?? "",
                  })),
                },
                handleChange: field.handleChange as (
                  updater: (prev: CategoryValue[]) => CategoryValue[],
                ) => void,
              }}
            />
          );
        }}
      />

      <div className="flex items-center gap-2 self-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.navigate({ to: "/settings/templates" })}
        >
          Cancel
        </Button>
        <Button disabled={isPending} type="submit">
          {isPending ? (
            <Spinner />
          ) : (
            <>
              Save changes
              <HotkeyHint id="form.submit" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
};

export const TemplateReadonly = ({ template }: EditTemplateFormProps) => {
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex w-full flex-col gap-2">
        <h2 className="text-lg font-medium">{template.name}</h2>
        {template.description && (
          <p className="text-sm text-muted-foreground">
            {template.description}
          </p>
        )}
      </div>

      <div className="flex w-full flex-col items-start gap-4">
        <h2 className="text-lg">Categories</h2>
        <span className="text-sm text-muted-foreground">
          Categories are used to group your expenses.
        </span>

        {template.categories.map((category, index) => (
          <ReadonlyCategory key={index} category={category} index={index} />
        ))}
      </div>
    </div>
  );
};

const ReadonlyCategory = (props: {
  category: {
    name: string;
    percentage: number;
    description: string | null;
    editable: boolean;
  };
  index: number;
}) => {
  return (
    <Card className="w-full" key={props.index}>
      <CardContent>
        <div className="flex flex-col items-start gap-2">
          <div className="flex w-full flex-col gap-1">
            <h3 className="text-sm font-medium">{props.category.name}</h3>
            {props.category.description && (
              <p className="text-sm text-muted-foreground">
                {props.category.description}
              </p>
            )}
          </div>
          <div className="flex w-full items-center gap-2">
            <span className="text-sm text-muted-foreground">Percentage:</span>
            <span className="text-sm font-medium tabular-nums">
              {props.category.percentage}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

type CategoryValue = {
  id?: Id<"templateCategories">;
  name: string;
  percentage: number;
  description: string;
  editable: boolean;
};

const Categories = (props: {
  field: {
    state: {
      value: CategoryValue[];
    };
    handleChange: (updater: (prev: CategoryValue[]) => CategoryValue[]) => void;
  };
}) => {
  const categories = props.field.state.value;

  const addCategory = () => {
    props.field.handleChange((prev) => [
      ...prev,
      { name: "", percentage: 0, description: "", editable: true },
    ]);
  };

  const removeCategory = (index: number) => {
    props.field.handleChange((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCategory = (
    index: number,
    updates: Partial<{
      name: string;
      percentage: number;
      description: string;
      editable: boolean;
    }>,
  ) => {
    props.field.handleChange((prev) =>
      prev.map((cat, i) => (i === index ? { ...cat, ...updates } : cat)),
    );
  };

  const sum = categories.reduce((acc, cat) => acc + (cat.percentage || 0), 0);
  const getBackgroundColor = () => {
    if (sum > 100) return "var(--destructive)";
    if (sum < 100) return "var(--primary)";
    if (sum === 100) return "var(--color-green-600)";
    return "var(--primary)";
  };

  return (
    <div className="flex w-full flex-col items-start gap-4">
      <h2 className="text-lg">Categories</h2>
      <span className="text-sm text-muted-foreground">
        Categories are used to group your expenses. The sum of all categories
        must be 100% to make the template valid.
      </span>
      <div className="relative h-2 w-full">
        <div className="h-2 w-full rounded bg-border" />
        <div
          className="absolute top-0 left-0 h-2 rounded transition-[width,background-color] duration-300 ease-out-quint"
          style={{
            width: `${sum > 100 ? 100 : sum}%`,
            backgroundColor: getBackgroundColor(),
          }}
        />
      </div>
      {categories.map((category, index) => (
        <Category
          key={index}
          category={category}
          index={index}
          onRemove={removeCategory}
          onAdd={addCategory}
          onUpdate={updateCategory}
        />
      ))}
    </div>
  );
};

const Category = (props: {
  category: {
    name: string;
    percentage: number;
    description: string;
    editable: boolean;
  };
  index: number;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onUpdate: (
    index: number,
    updates: Partial<{
      name: string;
      percentage: number;
      description: string;
      editable: boolean;
    }>,
  ) => void;
}) => {
  return (
    <Card className="w-full" key={props.index}>
      <CardContent>
        <div className="flex flex-col items-start gap-2">
          <Input
            className="border-transparent"
            type="text"
            placeholder="Category name"
            value={props.category.name}
            onChange={(e) =>
              props.onUpdate(props.index, { name: e.target.value })
            }
          />
          <InputGroup className="border-none">
            <InputGroupNumericInput
              aria-invalid={
                (!props.category.percentage && props.category.percentage < 0) ||
                props.category.percentage > 100
              }
              type="number"
              placeholder="Category percentage"
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
              value={props.category.percentage || ""}
              onChange={(e) =>
                props.onUpdate(props.index, {
                  percentage: parseFloat(e.target.value) || 0,
                })
              }
            />
            <InputGroupAddon align="inline-end">%</InputGroupAddon>
          </InputGroup>
          <Textarea
            className="resize-none border-none"
            placeholder="Category description"
            value={props.category.description || ""}
            onChange={(e) =>
              props.onUpdate(props.index, { description: e.target.value })
            }
          />
          <div className="flex items-center space-x-2">
            <Switch
              id="editable"
              checked={props.category.editable}
              onCheckedChange={(checked) =>
                props.onUpdate(props.index, { editable: checked })
              }
            />
            <Label htmlFor="editable">
              Allow users to add expenses to this category
            </Label>
          </div>
        </div>
      </CardContent>
      {props.index === 0 ? (
        <CardFooter>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={props.onAdd}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              Add category
            </Button>
          </div>
        </CardFooter>
      ) : (
        <CardFooter>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => props.onRemove(props.index)}
            >
              <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
              Remove category
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
};
