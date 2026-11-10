import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDataTransferVerticalIcon,
  ArrowLeft02Icon,
  BookOpen02Icon,
  Globe02Icon,
  ListFilterIcon,
  ArrowUpNarrowWideIcon,
  ArrowDownWideNarrowIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLabels } from "@/data/labels";
import { useTemplates } from "@/data/templates";
import { Route } from "@/routes/dashboard.index";
import { Checkbox } from "./ui/checkbox";
import { useHotkey } from "@tanstack/react-hotkeys";
import { appHotkeys } from "@/lib/hotkeys";
import { CURRENCIES } from "@/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select-themed";
import { sortByLabels } from "@/lib/budgetListSearch";

export const BudgetFiltersTrigger = () => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant={"ghost"}
                  size={"xs"}
                  className="max-md:pr-1.5"
                />
              }
            >
              <HugeiconsIcon icon={ListFilterIcon} strokeWidth={2} />
              <span className="hidden md:inline">Filter</span>
            </DialogTrigger>
            <DialogContent className="p-0">
              <MobileFilter />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <DesktopFilter />
      </div>
    </div>
  );
};

const DesktopFilter = () => {
  const navigate = useNavigate();
  const { data: templatesData } = useTemplates();
  const { data: labelsData } = useLabels();
  const filters = Route.useSearch();
  const [isOpen, setIsOpen] = useState(false);
  useHotkey(appHotkeys["budgets.filter"], () => {
    setIsOpen((open) => !open);
  });

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

  const handleCurrencyCheckboxChange = (
    currencyCode: string,
    checked: boolean,
  ) => {
    const currentCurrencies = filters.currencies
      ? filters.currencies.split(",")
      : [];
    let newCurrencies: string[];
    if (checked) {
      newCurrencies = [...currentCurrencies, currencyCode];
    } else {
      newCurrencies = currentCurrencies.filter((code) => code !== currencyCode);
    }
    const newFilters = {
      ...filters,
      currencies:
        newCurrencies.length > 0 ? newCurrencies.join(",") : undefined,
    };
    navigate({
      to: "/dashboard",
      search: (old) => ({ ...old, ...newFilters }),
    });
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger render={<Button variant={"ghost"} size={"xs"} />}>
        <HugeiconsIcon icon={ListFilterIcon} strokeWidth={2} />
        Filter
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-42">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} /> Label
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <Command>
              <CommandInput autoFocus placeholder="Filter..." />
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup>
                  {labelsData?.labels.map((label) => (
                    <CommandItem
                      key={label.id}
                      className="rounded-sm"
                      onSelect={() => {
                        handleLabelCheckboxChange(
                          label.id,
                          !filters.labelIds?.includes(label.id),
                        );
                      }}
                    >
                      <Checkbox
                        onCheckedChange={(checked) => {
                          const checkedBoolean = checked;
                          handleLabelCheckboxChange(label.id, checkedBoolean);
                        }}
                        defaultChecked={
                          filters.labelIds?.includes(label.id) || false
                        }
                        checked={filters.labelIds?.includes(label.id) || false}
                      />
                      <div
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: label.color }}
                      ></div>
                      {label.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={BookOpen02Icon} strokeWidth={2} />
            Template
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <Command>
              <CommandInput autoFocus placeholder="Filter..." />
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup>
                  {templatesData?.templates.map((template) => (
                    <CommandItem
                      key={template.id}
                      className="rounded-sm"
                      onSelect={() =>
                        handleTemplateCheckboxChange(
                          template.id,
                          !filters.templateIds?.includes(template.id),
                        )
                      }
                    >
                      <Checkbox
                        onCheckedChange={(checked) => {
                          const checkedBoolean = checked;
                          handleTemplateCheckboxChange(
                            template.id,
                            checkedBoolean,
                          );
                        }}
                        defaultChecked={
                          filters.templateIds?.includes(template.id) || false
                        }
                        checked={
                          filters.templateIds?.includes(template.id) || false
                        }
                      />
                      {template.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} />
            Currency
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <Command>
              <CommandInput autoFocus placeholder="Filter..." />
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup>
                  {CURRENCIES.map((currency) => (
                    <CommandItem
                      key={currency.code}
                      className="rounded-sm"
                      onSelect={() =>
                        handleCurrencyCheckboxChange(
                          currency.code,
                          !filters.currencies?.includes(currency.code),
                        )
                      }
                    >
                      <Checkbox
                        onCheckedChange={(checked) => {
                          const checkedBoolean = checked;
                          handleCurrencyCheckboxChange(
                            currency.code,
                            checkedBoolean,
                          );
                        }}
                        defaultChecked={
                          filters.currencies?.includes(currency.code) || false
                        }
                        checked={
                          filters.currencies?.includes(currency.code) || false
                        }
                      />
                      {currency.code.toUpperCase()} - {currency.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <SortItemDesktop />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const SortItemDesktop = () => {
  const filters = Route.useSearch();
  const navigate = useNavigate();

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

  const handleSelectSortBy = (value: "createdAt" | "income") => {
    navigate({
      to: "/dashboard",
      search: (old) => ({
        ...old,
        sortBy: value,
      }),
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <HugeiconsIcon icon={ArrowDataTransferVerticalIcon} strokeWidth={2} />
        Sort
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <div className="flex items-center gap-1">
          <Select<"createdAt" | "income">
            value={filters.sortBy ?? "createdAt"}
            items={sortByLabels}
            onValueChange={(value) => {
              if (value !== null) handleSelectSortBy(value);
            }}
          >
            <SelectTrigger autoFocus className="w-32" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Created</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
          <Button
            role="button"
            aria-label="Change sort order"
            aria-pressed={filters.sortOrder === "asc"}
            onClick={handleChangeOrder}
            variant="ghost"
            size="sm"
          >
            {filters.sortOrder === "asc" ? (
              <HugeiconsIcon icon={ArrowUpNarrowWideIcon} strokeWidth={2} />
            ) : (
              <HugeiconsIcon icon={ArrowDownWideNarrowIcon} strokeWidth={2} />
            )}
          </Button>
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};

const MobileFilter = () => {
  const [selectedFilter, setSelectedFilter] = useState<
    "label" | "template" | "currency" | null
  >(null);
  const navigate = useNavigate();
  const { data: templatesData } = useTemplates();
  const { data: labelsData } = useLabels();
  const filters = Route.useSearch();

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

  const handleCurrencyCheckboxChange = (
    currencyCode: string,
    checked: boolean,
  ) => {
    const currentCurrencies = filters.currencies
      ? filters.currencies.split(",")
      : [];
    let newCurrencies: string[];
    if (checked) {
      newCurrencies = [...currentCurrencies, currencyCode];
    } else {
      newCurrencies = currentCurrencies.filter((code) => code !== currencyCode);
    }
    const newFilters = {
      ...filters,
      currencies:
        newCurrencies.length > 0 ? newCurrencies.join(",") : undefined,
    };
    navigate({
      to: "/dashboard",
      search: (old) => ({ ...old, ...newFilters }),
    });
  };

  if (selectedFilter === "label") {
    return (
      <Command>
        <CommandInput autoFocus placeholder="Filter by label..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup>
            <CommandItem onSelect={() => setSelectedFilter(null)}>
              <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} /> Back
            </CommandItem>
            {labelsData?.labels.map((label) => (
              <CommandItem
                key={label.id}
                onSelect={() =>
                  handleLabelCheckboxChange(
                    label.id,
                    !filters.labelIds?.includes(label.id),
                  )
                }
              >
                <div
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: label.color }}
                ></div>
                <Checkbox
                  onCheckedChange={(checked) => {
                    const checkedBoolean = checked;
                    handleLabelCheckboxChange(label.id, checkedBoolean);
                  }}
                  defaultChecked={filters.labelIds?.includes(label.id) || false}
                  checked={filters.labelIds?.includes(label.id) || false}
                />
                {label.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    );
  }

  if (selectedFilter === "template") {
    return (
      <Command>
        <CommandInput autoFocus placeholder="Filter by template..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup>
            <CommandItem onSelect={() => setSelectedFilter(null)}>
              <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} /> Back
            </CommandItem>
            {templatesData?.templates.map((template) => (
              <CommandItem
                key={template.id}
                onSelect={() =>
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
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    );
  }

  if (selectedFilter === "currency") {
    return (
      <Command>
        <CommandInput autoFocus placeholder="Filter by currency..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup>
            <CommandItem onSelect={() => setSelectedFilter(null)}>
              <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} /> Back
            </CommandItem>
            {CURRENCIES.map((currency) => (
              <CommandItem
                key={currency.code}
                onSelect={() =>
                  handleCurrencyCheckboxChange(
                    currency.code,
                    !filters.currencies?.includes(currency.code),
                  )
                }
              >
                <Checkbox
                  onCheckedChange={(checked) => {
                    const checkedBoolean = checked;
                    handleCurrencyCheckboxChange(currency.code, checkedBoolean);
                  }}
                  defaultChecked={
                    filters.currencies?.includes(currency.code) || false
                  }
                  checked={filters.currencies?.includes(currency.code) || false}
                />
                {currency.code.toUpperCase()} - {currency.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    );
  }

  return (
    <Command>
      <CommandInput placeholder="Filter..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          <CommandItem onSelect={() => setSelectedFilter("label")}>
            <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} /> Label
          </CommandItem>
          <CommandItem onSelect={() => setSelectedFilter("template")}>
            <HugeiconsIcon icon={BookOpen02Icon} strokeWidth={2} /> Template
          </CommandItem>
          <CommandItem onSelect={() => setSelectedFilter("currency")}>
            <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} /> Currency
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
};
