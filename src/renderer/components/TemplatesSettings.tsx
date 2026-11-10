import type { Template } from "@shared/domain";
import {
  Card,
  CardTitle,
  CardHeader,
  CardContent,
  CardAction,
  CardDescription,
} from "./ui/card";
import { Button } from "./ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CopyPlusIcon,
  MoreVerticalCircle01Icon,
  Edit01Icon,
  Add01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Link, useNavigate } from "@tanstack/react-router";
import { useDeleteTemplate, useDuplicateTemplate } from "@/data/templates";
import { Spinner } from "./ui/spinner";
import type { MouseEventHandler } from "react";
import { toast } from "@/components/ui/toast";

type Props = {
  templates: Template[];
};

export const TemplatesSettings = (props: Props) => {
  const navigate = useNavigate();

  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b px-4 [.border-b]:pb-6">
        <CardTitle className="tabular-nums">
          {props.templates.length} budget templates
        </CardTitle>
        <CardDescription>
          Manage your budget templates and their allocations.
        </CardDescription>
        <CardAction className="-mt-1.5">
          <Button
            variant={"ghost"}
            size={"icon-sm"}
            render={<Link to="/settings/template/new" />}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            <span className="sr-only">Create new template</span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0 py-0">
        <ul className="flex flex-col" role="list">
          {props.templates.map((template) => (
            <li
              role="listitem"
              key={template.id}
              className="hover:bg-accent px-4 py-4 last:rounded-b-xl"
              onClick={() => {
                navigate({
                  to: "/settings/template/$templateId",
                  params: { templateId: template.id },
                });
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium">{template.name}</h3>
                  <p className="text-muted-foreground text-sm">
                    {template.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TemplateActions template={template} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

// The mutations live here: menu items unmount on click, which skips `mutate` callbacks.
const TemplateActions = (props: { template: Template }) => {
  const duplicateTemplate = useDuplicateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const isPending = duplicateTemplate.isPending || deleteTemplate.isPending;

  const onErrorToast = (message: string) => (error: Error) => {
    console.error(error);
    toast.add({ type: "error", title: message });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            onClick={(e) => {
              e.stopPropagation();
            }}
            variant={"ghost"}
            size={"icon-sm"}
          />
        }
      >
        {isPending ? <Spinner /> : <HugeiconsIcon icon={MoreVerticalCircle01Icon} strokeWidth={2} />}
        <span className="sr-only">Actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DuplicateTemplateAction
          isPending={duplicateTemplate.isPending}
          onAction={() =>
            duplicateTemplate.mutate(
              { templateId: props.template.id },
              { onError: onErrorToast("Failed to duplicate template") },
            )
          }
        />
        {props.template.isDefault ? null : (
          <DropdownMenuItem>
            <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} />
            Edit
          </DropdownMenuItem>
        )}
        {props.template.isDefault ? null : (
          <DeleteTemplateAction
            isPending={deleteTemplate.isPending}
            onAction={() =>
              deleteTemplate.mutate(
                { templateId: props.template.id },
                { onError: onErrorToast("Failed to delete template") },
              )
            }
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

type ActionProps = {
  isPending: boolean;
  onAction: () => void;
};

const DuplicateTemplateAction = (props: ActionProps) => {
  const handleDuplicate: MouseEventHandler<HTMLDivElement> = (e) => {
    e.stopPropagation();
    props.onAction();
  };

  return (
    <DropdownMenuItem onClick={handleDuplicate} disabled={props.isPending}>
      {props.isPending ? <Spinner /> : <HugeiconsIcon icon={CopyPlusIcon} strokeWidth={2} />} Duplicate
    </DropdownMenuItem>
  );
};

const DeleteTemplateAction = (props: ActionProps) => {
  const handleDelete: MouseEventHandler<HTMLDivElement> = (e) => {
    e.stopPropagation();
    props.onAction();
  };

  return (
    <DropdownMenuItem
      variant="destructive"
      onClick={handleDelete}
      disabled={props.isPending}
    >
      {props.isPending ? <Spinner /> : <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />}
      Delete
    </DropdownMenuItem>
  );
};
