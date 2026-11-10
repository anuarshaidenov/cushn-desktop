import { Route } from "@/routes/dashboard.index";
import { DashboardHeaderWrapper } from "./ui/dashboard-header-wrapper";
import { useLabels } from "@/data/labels";
import { useTemplates } from "@/data/templates";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUpNarrowWideIcon,
  ArrowDownWideNarrowIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { ButtonGroup } from "./ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Checkbox } from "./ui/checkbox";
import { CURRENCIES } from "@/constants";
import { CurrencyPicker } from "./CurrencyPicker";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectTrigger,
} from "./ui/select-themed";
import { sortByLabels } from "@/lib/budgetListSearch";

export const BudgetAppliedFilters = () => {
  const filters = Route.useSearch();
  const filtersApplied = Boolean(
    (filters.labelIds && filters.labelIds.length > 0) ||
      (filters.templateIds && filters.templateIds.length > 0) ||
      (filters.currencies && filters.currencies.length > 0) ||
      filters.q ||
      (filters.sortBy && filters.sortOrder),
  );

  if (!filtersApplied) {
    return null;
  }

  return (
    <DashboardHeaderWrapper
      className="h-auto"
      displayTrigger={false}
      as={"div"}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <LabelFilter />
          <TemplateFilter />
          <SearchFilter />
          <CurrencyFilter />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AppliedSort />
        </div>
      </div>
    </DashboardHeaderWrapper>
  );
};

const LabelFilter = () => {
  const { data: labelsData } = useLabels();
  const filters = Route.useSearch();
  const navigate = useNavigate();

  const handleRemoveFilter = (filterKey: keyof typeof filters) => {
    const newFilters = { ...filters };
    delete newFilters[filterKey as keyof typeof newFilters];

    navigate({
      to: "/dashboard",
      search: () => ({ ...newFilters }),
    });
  };

  if (!filters.labelIds || !filters.labelIds.length) {
    return null;
  }

  if (!labelsData) {
    return null;
  }

  const handleLabelCheckboxChange = (labelId: string, checked: boolean) => {
    const currentLabelIds = filters.labelIds ? filters.labelIds.split(",") : [];
    let newLabelIds: string[];
    if (checked) {
      newLabelIds = [...currentLabelIds, labelId];
    } else {
      newLabelIds = currentLabelIds.filter((id) => id !== labelId);
    }
    const newFilters = {
      ...filters,
      labelIds: newLabelIds.length > 0 ? newLabelIds.join(",") : undefined,
    };
    navigate({
      to: "/dashboard",
      search: (old) => ({ ...old, ...newFilters }),
    });
  };

  return (
    <ButtonGroup>
      <Button variant="outline" size="xs">
        Label
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="xs" />
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            {filters.labelIds
              .split(",")
              .slice(0, 2)
              .map((labelId) => {
                const label = labelsData.labels.find((l) => l.id === labelId);
                if (!label) return null;
                return (
                  <div
                    key={label.id}
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: label.color }}
                    title={label.name}
                  ></div>
                );
              })}
            {filters.labelIds.split(",").length > 2 ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                +{filters.labelIds.split(",").length - 2} more...
              </span>
            ) : null}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {labelsData.labels.map((label) => (
            <DropdownMenuItem
              key={label.id}
              onClick={() =>
                handleLabelCheckboxChange(
                  label.id,
                  !filters.labelIds?.includes(label.id),
                )
              }
            >
              <Checkbox
                onCheckedChange={(checked) => {
                  const checkedBoolean = checked;
                  handleLabelCheckboxChange(label.id, checkedBoolean);
                }}
                defaultChecked={filters.labelIds?.includes(label.id) || false}
                checked={filters.labelIds?.includes(label.id) || false}
              />
              <div
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: label.color }}
              ></div>
              {label.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        onClick={() => handleRemoveFilter("labelIds")}
        variant="outline"
        size="icon-xs"
        className="after:left-0"
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </ButtonGroup>
  );
};

const TemplateFilter = () => {
  const { data: templatesData } = useTemplates();
  const filters = Route.useSearch();
  const navigate = useNavigate();

  const handleRemoveFilter = (filterKey: keyof typeof filters) => {
    const newFilters = { ...filters };
    delete newFilters[filterKey as keyof typeof newFilters];

    navigate({
      to: "/dashboard",
      search: () => ({ ...newFilters }),
    });
  };

  const handleTemplateCheckboxChange = (
    templateId: string,
    checked: boolean,
  ) => {
    const currentTemplateIds = filters.templateIds
      ? filters.templateIds.split(",")
      : [];
    let newTemplateIds: string[];
    if (checked) {
      newTemplateIds = [...currentTemplateIds, templateId];
    } else {
      newTemplateIds = currentTemplateIds.filter((id) => id !== templateId);
    }
    const newFilters = {
      ...filters,
      templateIds:
        newTemplateIds.length > 0 ? newTemplateIds.join(",") : undefined,
    };
    navigate({
      to: "/dashboard",
      search: (old) => ({ ...old, ...newFilters }),
    });
  };

  if (!filters.templateIds || !filters.templateIds.length) {
    return null;
  }

  if (!templatesData) {
    return null;
  }

  return (
    <ButtonGroup>
      <Button variant="outline" size="xs">
        Template
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              className="break-all tabular-nums"
              variant="outline"
              size="xs"
            />
          }
        >
          {filters.templateIds.split(",").length === 1
            ? templatesData.templates.find((t) => t.id === filters.templateIds)
                ?.name
            : `${filters.templateIds.split(",").length} templates`}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {templatesData.templates.map((template) => (
            <DropdownMenuItem
              key={template.id}
              onClick={() =>
                handleTemplateCheckboxChange(
                  template.id,
                  !filters.templateIds?.includes(template.id),
                )
              }
            >
              <Checkbox
                onCheckedChange={(checked) => {
                  const checkedBoolean = checked;
                  handleTemplateCheckboxChange(template.id, checkedBoolean);
                }}
                defaultChecked={
                  filters.templateIds?.includes(template.id) || false
                }
                checked={filters.templateIds?.includes(template.id) || false}
              />
              {template.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        onClick={() => handleRemoveFilter("templateIds")}
        variant="outline"
        size="icon-xs"
        className="after:left-0"
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </ButtonGroup>
  );
};

const SearchFilter = () => {
  const filters = Route.useSearch();
  const navigate = useNavigate();

  const handleRemoveFilter = (filterKey: keyof typeof filters) => {
    const newFilters = { ...filters };
    delete newFilters[filterKey as keyof typeof newFilters];

    navigate({
      to: "/dashboard",
      search: () => ({ ...newFilters }),
    });
  };

  if (!filters.q) {
    return null;
  }

  return (
    <ButtonGroup>
      <Button variant="outline" size="xs">
        Search
      </Button>
      <Button variant="outline" size="xs">
        {filters.q}
      </Button>
      <Button
        onClick={() => handleRemoveFilter("q")}
        variant="outline"
        size="icon-xs"
        className="after:left-0"
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </ButtonGroup>
  );
};

const CurrencyFilter = () => {
  const filters = Route.useSearch();
  const navigate = useNavigate();
  const handleRemoveFilter = (filterKey: keyof typeof filters) => {
    const newFilters = { ...filters };
    delete newFilters[filterKey as keyof typeof newFilters];

    navigate({
      to: "/dashboard",
      search: () => ({ ...newFilters }),
    });
  };

  if (!filters.currencies || !filters.currencies.length) {
    return null;
  }
  const selected = filters.currencies.split(",");
  return (
    <ButtonGroup>
      <Button variant="outline" size="xs">
        Currency
      </Button>
      <CurrencyPicker
        multiple
        value={selected}
        onValueChange={(codes) => {
          navigate({
            to: "/dashboard",
            search: (old) => ({
              ...old,
              currencies: codes.length > 0 ? codes.join(",") : undefined,
            }),
          });
        }}
        trigger={
          <Button
            className="break-all tabular-nums"
            variant="outline"
            size="xs"
          />
        }
      >
        {selected.length === 1
          ? CURRENCIES.find((c) => c.code === selected[0])?.name
          : `${selected.length} currencies`}
      </CurrencyPicker>
      <Button
        onClick={() => handleRemoveFilter("currencies")}
        variant="outline"
        size="icon-xs"
        className="after:left-0"
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </ButtonGroup>
  );
};

const AppliedSort = () => {
  const filters = Route.useSearch();
  const navigate = useNavigate();

  if (!filters.sortBy || !filters.sortOrder) {
    return null;
  }

  const sortByLabel =
    filters.sortBy === "createdAt"
      ? "Creation Date"
      : filters.sortBy === "income"
        ? "Income"
        : filters.sortBy;

  const handleRemoveSort = () => {
    const newFilters = { ...filters };
    delete newFilters.sortBy;
    delete newFilters.sortOrder;

    navigate({
      to: "/dashboard",
      search: () => ({ ...newFilters }),
    });
  };

  const handleSelectSortBy = (value: "createdAt" | "income") => {
    navigate({
      to: "/dashboard",
      search: (old) => ({
        ...old,
        sortBy: value,
      }),
    });
  };

  const handleChangeOrder = () => {
    const newSortOrder = filters.sortOrder === "asc" ? "desc" : "asc";
    navigate({
      to: "/dashboard",
      search: (old) => ({
        ...old,
        sortOrder: newSortOrder,
      }),
    });
  };

  return (
    <ButtonGroup>
      <Button variant="outline" size="xs">
        Sort
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="xs" />
          }
        >
          {filters.sortOrder === "asc" ? (
            <HugeiconsIcon
              icon={ArrowUpNarrowWideIcon}
              strokeWidth={2}
              className="size-3"
            />
          ) : (
            <HugeiconsIcon
              icon={ArrowDownWideNarrowIcon}
              strokeWidth={2}
              className="size-3"
            />
          )}
          {`${sortByLabel}`}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-38">
          <div className="flex items-center gap-1">
            <Select
              defaultValue={filters.sortBy}
              items={sortByLabels}
              onValueChange={(value) => {
                if (value !== null) handleSelectSortBy(value);
              }}
            >
              <SelectTrigger size="sm" className="w-full text-xs" autoFocus>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Created</SelectItem>
                <SelectItem value="income">Income</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleChangeOrder}
              variant={"outline"}
              size={"icon-sm"}
            >
              {filters.sortOrder === "asc" ? (
                <HugeiconsIcon icon={ArrowUpNarrowWideIcon} strokeWidth={2} />
              ) : (
                <HugeiconsIcon icon={ArrowDownWideNarrowIcon} strokeWidth={2} />
              )}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        onClick={handleRemoveSort}
        variant="outline"
        size="icon-xs"
        className="after:left-0"
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </ButtonGroup>
  );
};
