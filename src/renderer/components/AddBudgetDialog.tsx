import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupNumericInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { useAddBudgetDialogStore } from "@/stores/useAddBudgetDialogStore";
import { Spinner } from "./ui/spinner";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useShallow } from "zustand/shallow";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  selectTriggerClassName,
} from "@/components/ui/select-themed";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";
import { toast } from "@/components/ui/toast";
import type { Id } from "@shared/domain";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { BudgetLabelOption, useBudgetLabelItems } from "./BudgetLabel";
import { useCreateBudget, useLatestBudget } from "@/data/budgets";
import { useLabels } from "@/data/labels";
import { useSettings } from "@/data/settings";
import { useTemplates } from "@/data/templates";
import { useViews } from "@/data/views";
import { HugeiconsIcon } from "@hugeicons/react";
import { Layers01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { IconPicker } from "./IconPicker";
import { CurrencyPicker } from "./CurrencyPicker";
import { useHotkey } from "@tanstack/react-hotkeys";
import { appHotkeys } from "@/lib/hotkeys";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  income: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  templateId: z.string().min(1, "Template is required"),
  labelId: z.string().optional(),
  viewId: z.string().optional(),
  icon: z.string().nullable(),
});

function useDashboardViewIdFromRoute(): Id<"budgetViews"> | undefined {
  return useRouterState({
    select: (s) => {
      const path = s.location.pathname.replace(/\/$/, "");
      const m = /^\/dashboard\/views\/([^/]+)$/.exec(path);
      return m ? (m[1] as Id<"budgetViews">) : undefined;
    },
  });
}

export function AddBudgetDialog() {
  const form = useForm({
    defaultValues: {
      title: "",
      description: "",
      income: "",
      // Filled in by SelectBudgetCurrency.
      currency: "",
      templateId: "",
      labelId: "none",
      viewId: "none",
      icon: null as string | null,
    },
    validators: {
      // @ts-expect-error
      onSubmit: formSchema,
    },
    onSubmitInvalid: (form) => {
      if (!form.value.title) {
        toast.add({
          type: "error",
          title: "Please enter a title for the budget.",
        });
      } else if (!form.value.currency) {
        toast.add({
          type: "error",
          title: "Please select a currency for the budget.",
        });
      } else if (!form.value.templateId) {
        toast.add({
          type: "error",
          title: "Please select a template for the budget.",
        });
      }
    },
    onSubmit: async ({ value }) => {
      mutate(
        {
          templateId: value.templateId as Id<"templates">,
          currency: value.currency,
          title: value.title,
          description: value.description,
          income: value.income ? Number(value.income) : 0,
          labelId:
            value.labelId === "none"
              ? null
              : (value.labelId as Id<"budgetLabels">),
          viewId:
            value.viewId === "none" || !value.viewId
              ? null
              : (value.viewId as Id<"budgetViews">),
          icon: value.icon,
        },
        {
          onSuccess: (data) => {
            closeDialog();
            router.navigate({
              to: "/dashboard/$budgetId",
              params: { budgetId: data.budgetId.toString() },
            });
            form.reset();
          },
          onError: (e) => {
            const msg =
              e instanceof Error ? e.message : "Could not create budget";
            toast.add({ type: "error", title: msg });
          },
        },
      );
    },
  });

  const { isOpen, closeDialog } = useAddBudgetDialogStore(
    useShallow((state) => ({
      isOpen: state.isOpen,
      closeDialog: state.closeDialog,
    })),
  );
  const router = useRouter();
  const routeViewId = useDashboardViewIdFromRoute();
  const { data: budgetViewsData } = useViews();
  const { data: settingsData } = useSettings();
  const [currencyDisplayed, setCurrencyDisplayed] = useState("");
  const { data: latestBudgetData } = useLatestBudget();
  const viewIdSyncedForSessionRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      viewIdSyncedForSessionRef.current = false;
      return;
    }
    if (!budgetViewsData?.views || viewIdSyncedForSessionRef.current) {
      return;
    }
    const validRouteView =
      routeViewId && budgetViewsData.views.some((v) => v.id === routeViewId)
        ? routeViewId
        : undefined;
    form.setFieldValue("viewId", validRouteView ?? "none");
    viewIdSyncedForSessionRef.current = true;
  }, [isOpen, routeViewId, budgetViewsData]);

  const { mutate, isPending } = useCreateBudget();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      {/* The icon picker comes first in tab order, but typing starts with the title. */}
      <DialogContent className="p-0" initialFocus={titleRef}>
        <SubmitFormHotkey
          enabled={isOpen && !isPending}
          onSubmit={() => form.handleSubmit()}
        />
        <DialogHeader className="px-6 pt-5 text-left">
          <DialogTitle className="text-sm font-normal text-muted-foreground/60">
            New budget
          </DialogTitle>
          <DialogDescription className="sr-only">
            Create a new budget
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-6 pb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
            className="flex flex-col gap-2"
          >
            <form.Field
              name="icon"
              children={(field) => (
                <IconPicker
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  size="lg"
                  aria-label="Budget icon"
                  className="-ml-2"
                />
              )}
            />

            <form.Field
              name="title"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Input
                    ref={titleRef}
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    placeholder="Budget title"
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                    autoComplete="off"
                    className="rounded-none border-0 border-none bg-popover p-0 py-0 text-xl shadow-none ring-0 outline-none focus-within:outline-0 focus:border-none focus:bg-background focus:ring-0 focus:outline-0 focus:outline-none focus-visible:bg-background focus-visible:ring-0 aria-invalid:shadow-none aria-invalid:placeholder:text-destructive md:text-xl dark:bg-popover"
                  />
                );
              }}
            />

            <form.Field
              name="description"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    placeholder="Add description"
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                    className="resize-none! rounded-none border-0 border-none bg-popover p-0 py-0 text-sm text-muted-foreground shadow-none ring-0 outline-none focus-within:outline-0 focus:border-none focus:bg-background focus:ring-0 focus:outline-0 focus:outline-none focus-visible:bg-background focus-visible:ring-0 aria-invalid:shadow-none md:text-base dark:bg-popover"
                  />
                );
              }}
            />

            <form.Field
              name="income"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <InputGroup className="mb-6 [appearance:textfield] rounded-none border-0 border-none bg-popover p-0 py-0 pl-0 text-2xl shadow-none ring-0 outline-none focus-within:outline-0 focus:border-none focus:bg-background focus:shadow-none focus:ring-0 focus:outline-0 focus:outline-none focus-visible:bg-background focus-visible:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-none has-[[data-slot=input-group-control]:focus-visible]:shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot][aria-invalid=true]]:shadow-none md:text-3xl dark:bg-popover [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none">
                    <InputGroupNumericInput
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      placeholder="Enter income"
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      autoComplete="off"
                      className="[appearance:textfield] pl-0 text-xl md:text-xl [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText className="text-lg">
                        {currencyDisplayed.toUpperCase()}
                      </InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                );
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <SelectBudgetCurrency
                defaultValue={
                  latestBudgetData?.latestBudget?.currency ||
                  settingsData?.settings.currency
                }
                onSelect={(currency) => {
                  form.setFieldValue("currency", currency);
                  setCurrencyDisplayed(currency);
                }}
              />
              <SelectTemplate
                defaultValue={
                  latestBudgetData?.latestBudget?.templateId ?? undefined
                }
                onSelect={(templateId) => {
                  form.setFieldValue("templateId", templateId);
                }}
              />
              <SelectBudgetLabel
                defaultValue={
                  latestBudgetData?.latestBudget?.labelId ?? undefined
                }
                onSelect={(labelId) => {
                  form.setFieldValue("labelId", labelId ?? "none");
                }}
              />
              <form.Field
                name="viewId"
                children={(field) => (
                  <SelectBudgetView
                    value={field.state.value ?? "none"}
                    onValueChange={(viewId) => field.handleChange(viewId)}
                  />
                )}
              />
            </div>
            <button
              disabled={isPending}
              type="submit"
              className="hidden"
            ></button>
          </form>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            disabled={isPending}
            size={"sm"}
            onClick={() => form.handleSubmit()}
          >
            {isPending && <Spinner className="size-4" />}
            Create budget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Rendered inside DialogContent so it belongs to the dialog's hotkey scope.
const SubmitFormHotkey = (props: {
  enabled: boolean;
  onSubmit: () => void;
}) => {
  useHotkey(appHotkeys["form.submit"], props.onSubmit, {
    enabled: props.enabled,
  });
  return null;
};

export const AddBudgetDialogSkeleton = () => {
  const { isOpen, closeDialog } = useAddBudgetDialogStore(
    useShallow((state) => ({
      isOpen: state.isOpen,
      closeDialog: state.closeDialog,
    })),
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New budget</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-scroll">
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const SelectBudgetView = (props: {
  value: string;
  onValueChange: (viewId: string) => void;
  triggerClassName?: string;
}) => {
  const { data: viewData } = useViews();
  const items = useMemo(() => {
    const map: Record<string, ReactNode> = { none: "No view" };
    for (const view of viewData?.views ?? []) {
      map[view.id] = view.title;
    }
    return map;
  }, [viewData]);

  if (!viewData) {
    return null;
  }

  return (
    <Select
      value={props.value}
      items={items}
      onValueChange={(value) => {
        if (value !== null) props.onValueChange(value);
      }}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "relative h-6 max-w-[130px] px-2 text-xs after:absolute after:inset-x-0 after:-inset-y-1",
          props.triggerClassName,
        )}
      >
        <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="size-3" />
        <SelectValue placeholder="View">
          {(value: string | null) => (
            <span className="truncate">{value ? items[value] : null}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          <SelectLabel>Budget views</SelectLabel>
          <SelectItem value="none">
            <span className="truncate">No view</span>
          </SelectItem>
          {viewData.views.map((view) => (
            <SelectItem key={view.id} value={view.id}>
              <span className="block max-w-[140px] truncate">{view.title}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export const SelectBudgetLabel = (props: {
  defaultValue?: Id<"budgetLabels">;
  onSelect: (labelId: Id<"budgetLabels"> | undefined) => void;
}) => {
  const { data: labelData } = useLabels();
  const items = useBudgetLabelItems(labelData?.labels);

  useEffect(() => {
    if (props.defaultValue) {
      props.onSelect(props.defaultValue);
    }
  }, [props.defaultValue]);

  useEffect(() => {
    if (labelData && labelData.labels.length > 0 && !props.defaultValue) {
      props.onSelect(undefined);
    }
  }, [labelData, props.defaultValue]);

  if (!labelData) {
    return null;
  }

  return (
    <Select
      defaultValue={props.defaultValue ? props.defaultValue.toString() : "none"}
      items={items}
      onValueChange={(value) => {
        if (value === "none") {
          props.onSelect(undefined);
        } else {
          props.onSelect(value as Id<"budgetLabels">);
        }
      }}
    >
      <SelectTrigger className="h-8! w-[100px] px-2! py-1 text-xs">
        <SelectValue placeholder="Label" className="truncate" />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          <SelectItem value={"none"}>
            <BudgetLabelOption color="#eee" name="No label" />
          </SelectItem>

          {labelData?.labels.map((label) => (
            <SelectItem key={label.id} value={label.id.toString()}>
              <BudgetLabelOption color={label.color} name={label.name} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

const SelectBudgetCurrency = ({
  defaultValue,
  onSelect,
}: {
  defaultValue?: string;
  onSelect: (currency: string) => void;
}) => {
  useEffect(() => {
    if (defaultValue) {
      onSelect(defaultValue);
    }
  }, [defaultValue]);

  return (
    <CurrencyPicker
      defaultValue={defaultValue}
      onValueChange={(value) => {
        if (value !== null) onSelect(value);
      }}
      trigger={
        <button
          type="button"
          data-size="sm"
          className={cn(
            selectTriggerClassName,
            "relative h-6 px-2 text-xs after:absolute after:inset-x-0 after:-inset-y-1",
          )}
        />
      }
    />
  );
};

export const SelectTemplate = (props: {
  defaultValue?: string;
  onSelect: (templateId: string) => void;
}) => {
  const { data } = useTemplates();
  const items = useMemo(() => {
    const map: Record<string, ReactNode> = {};
    for (const template of data?.templates ?? []) {
      map[template.id] = template.name;
    }
    return map;
  }, [data]);

  useEffect(() => {
    if (props.defaultValue) {
      props.onSelect(props.defaultValue);
    }
  }, [props.defaultValue]);

  useEffect(() => {
    if (data && data.templates.length > 0 && !props.defaultValue) {
      props.onSelect(data.templates[0].id);
    }
  }, [props.defaultValue, data]);

  if (!data) {
    return null;
  }

  return (
    <Select
      defaultValue={props.defaultValue || data.templates[0]?.id}
      items={items}
      onValueChange={(value) => {
        if (value !== null) props.onSelect(value);
      }}
    >
      <SelectTrigger
        size="sm"
        className="relative h-6 max-w-[140px] px-2 text-xs after:absolute after:inset-x-0 after:-inset-y-1"
      >
        <SelectValue placeholder="">
          {(value: string | null) => (
            <span className="truncate">{value ? items[value] : null}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          <SelectLabel>Budget templates</SelectLabel>
          {data.templates.map((template, index) => (
            <SelectItem key={index} value={template.id}>
              <span className="block w-24 truncate">{template.name}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
