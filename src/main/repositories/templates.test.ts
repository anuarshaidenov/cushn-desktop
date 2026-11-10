import { resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TemplateCategoryInput } from "@shared/api";
import { type Id, asId } from "@shared/domain";
import { CushnError, type CushnErrorCode } from "@shared/errors";
import { type DatabaseHandle, openDatabase } from "../db";
import { DEFAULT_TEMPLATES } from "../db/seed";
import {
  budgets,
  templateCategories as templateCategoriesTable,
  templates as templatesTable,
} from "../db/schema";
import * as templates from "./templates";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

const missingId = asId<"templates">("00000000-0000-0000-0000-000000000000");

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder });
  // Built-ins only: the seed's sample template would sit among the ones these tests create.
  handle.db.delete(templatesTable).where(eq(templatesTable.isDefault, false)).run();
});

afterEach(() => {
  handle.close();
});

function expectError(fn: () => unknown, code: CushnErrorCode, message: string) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CushnError);
  expect(caught).toMatchObject({ code, message });
}

/** The first seeded built-in ("50/30/20"). */
function builtInTemplate() {
  const builtIn = templates.list(handle.db).templates.find((t) => t.isDefault);
  if (!builtIn) throw new Error("the seed has no built-in template");
  return builtIn;
}

/** The id of the user template called `name`. */
function userTemplateId(name: string): Id<"templates"> {
  const template = templates.list(handle.db).templates.find((t) => !t.isDefault && t.name === name);
  if (!template) throw new Error(`no user template named ${name}`);
  return template.id;
}

/** Editable categories "C1", "C2", … with the given percentages. */
function split(...percentages: number[]): TemplateCategoryInput[] {
  return percentages.map((percentage, index) => ({
    name: `C${index + 1}`,
    percentage,
    editable: true,
  }));
}

/** Creates a user template with `split(...percentages)` and returns its id. */
function createTemplate(name: string, ...percentages: number[]): Id<"templates"> {
  templates.create(handle.db, { name, categories: split(...percentages) });
  return userTemplateId(name);
}

/** The stored `sort_order`s of a template's categories, in `get` order. */
function sortOrders(templateId: Id<"templates">): number[] {
  return handle.db
    .select({ sortOrder: templateCategoriesTable.sortOrder })
    .from(templateCategoriesTable)
    .where(eq(templateCategoriesTable.templateId, templateId))
    .orderBy(templateCategoriesTable.sortOrder)
    .all()
    .map((c) => c.sortOrder);
}

describe("templates.list", () => {
  it("returns { templates }: user templates first, then built-ins, each in creation order", () => {
    handle.db
      .insert(templatesTable)
      .values([
        { id: asId<"templates">("b"), name: "Second", createdAt: 2 },
        { id: asId<"templates">("a"), name: "First", createdAt: 1 },
        { id: asId<"templates">("c"), name: "Same ms, larger id", createdAt: 2 },
      ])
      .run();

    const { templates: rows } = templates.list(handle.db);

    expect(rows.map((t) => t.name)).toEqual([
      "First",
      "Second",
      "Same ms, larger id",
      ...DEFAULT_TEMPLATES.map((t) => t.name),
    ]);
    expect(rows[0]).toEqual({
      id: "a",
      name: "First",
      description: null,
      isDefault: false,
      createdAt: 1,
    });
    expect(rows.at(-1)?.isDefault).toBe(true);
  });
});

describe("templates.get", () => {
  it("returns { template } with its categories ordered by sort_order", () => {
    // Ordered by sort_order, not insertion.
    const templateId = asId<"templates">("t");
    handle.db.insert(templatesTable).values({ id: templateId, name: "Mine", createdAt: 1 }).run();
    handle.db
      .insert(templateCategoriesTable)
      .values([
        {
          id: asId<"templateCategories">("c2"),
          templateId,
          name: "Second",
          percentage: 40,
          sortOrder: 2,
          editable: false,
        },
        {
          id: asId<"templateCategories">("c1"),
          templateId,
          name: "First",
          percentage: 60,
          sortOrder: 1,
          description: "d",
          editable: true,
        },
      ])
      .run();

    expect(templates.get(handle.db, { templateId })).toEqual({
      template: {
        id: templateId,
        name: "Mine",
        description: null,
        isDefault: false,
        createdAt: 1,
        categories: [
          { id: "c1", name: "First", percentage: 60, description: "d", editable: true },
          { id: "c2", name: "Second", percentage: 40, description: null, editable: false },
        ],
      },
    });
  });

  it("reads built-in templates", () => {
    // Built-in templates are readable like the user's own.
    const builtIn = builtInTemplate();

    const { template } = templates.get(handle.db, { templateId: builtIn.id });

    expect(template).toMatchObject({ name: DEFAULT_TEMPLATES[0].name, isDefault: true });
    expect(template.categories.map((c) => c.name)).toEqual(
      DEFAULT_TEMPLATES[0].categories.map((c) => c.name),
    );
  });

  it("throws NOT_FOUND 'Template not found' for a missing id", () => {
    expectError(
      () => templates.get(handle.db, { templateId: missingId }),
      "NOT_FOUND",
      "Template not found",
    );
  });
});

describe("templates.create", () => {
  it("saves a user template with its categories in input order and returns { success: true }", () => {
    const result = templates.create(handle.db, {
      name: "Mine",
      description: "split",
      categories: [
        { name: "Needs", percentage: 50, description: "rent", editable: true },
        { name: "Wants", percentage: 30, editable: true },
        { name: "Savings", percentage: 20, description: null, editable: false },
      ],
    });

    expect(result).toEqual({ success: true });
    const { template } = templates.get(handle.db, { templateId: userTemplateId("Mine") });
    expect(template).toMatchObject({ name: "Mine", description: "split", isDefault: false });
    expect(template.categories).toEqual([
      {
        id: expect.any(String),
        name: "Needs",
        percentage: 50,
        description: "rent",
        editable: true,
      },
      { id: expect.any(String), name: "Wants", percentage: 30, description: null, editable: true },
      {
        id: expect.any(String),
        name: "Savings",
        percentage: 20,
        description: null,
        editable: false,
      },
    ]);
  });

  it("numbers sort_order from 1 in input order, like the seed", () => {
    // src/main/db/seed.ts (index + 1).
    templates.create(handle.db, { name: "Mine", categories: split(60, 40) });

    expect(sortOrders(userTemplateId("Mine"))).toEqual([1, 2]);
  });

  it("lists new templates after older user templates and before the built-ins", () => {
    // Creation order; built-ins last.
    templates.create(handle.db, { name: "First", categories: split(100) });
    templates.create(handle.db, { name: "Second", categories: split(100) });

    const rows = templates.list(handle.db).templates;
    expect(rows.map((t) => t.name)).toEqual([
      "First",
      "Second",
      ...DEFAULT_TEMPLATES.map((t) => t.name),
    ]);
  });

  it.each([[[50, 40]], [[50, 30, 21]], [[]]])(
    "rejects percentages %j with BAD_REQUEST 'Categories percentage must be 100%' and writes nothing",
    (percentages) => {
      expectError(
        () => templates.create(handle.db, { name: "Bad", categories: split(...percentages) }),
        "BAD_REQUEST",
        "Categories percentage must be 100%",
      );
      expect(templates.list(handle.db).templates).toHaveLength(DEFAULT_TEMPLATES.length);
    },
  );

  it.each([[[50, 30, 20]], [[33.3, 33.3, 33.4]], [[33.33, 33.33, 33.34]], [[12.5, 12.5, 75]]])(
    "accepts the realistic split %j",
    (percentages) => {
      // Rounded to cents, not an exact `=== 100` on the float sum.
      expect(
        templates.create(handle.db, { name: "Ok", categories: split(...percentages) }),
      ).toEqual({ success: true });
    },
  );

  it("accepts 33.4/33.3/33.3, whose float sum is 99.99999999999999, by rounding the sum to cents", () => {
    // An exact `=== 100` on the float sum would reject it; the template form allows
    // 0.01 off, so this must pass too.
    expect(
      templates.create(handle.db, { name: "Thirds", categories: split(33.4, 33.3, 33.3) }),
    ).toEqual({ success: true });
    const { template } = templates.get(handle.db, { templateId: userTemplateId("Thirds") });
    expect(template.categories).toMatchObject([
      { percentage: 33.4 },
      { percentage: 33.3 },
      { percentage: 33.3 },
    ]);
  });

  it.each([[[33.33, 33.33, 33.33]], [[50, 50.01]]])(
    "still rejects %j, a sum a cent off 100, with BAD_REQUEST 'Categories percentage must be 100%'",
    (percentages) => {
      expectError(
        () => templates.create(handle.db, { name: "Off", categories: split(...percentages) }),
        "BAD_REQUEST",
        "Categories percentage must be 100%",
      );
      expect(templates.list(handle.db).templates).toHaveLength(DEFAULT_TEMPLATES.length);
    },
  );
});

describe("templates.update", () => {
  it("throws NOT_FOUND 'Template not found' for a missing id", () => {
    expectError(
      () =>
        templates.update(handle.db, { templateId: missingId, name: "X", categories: split(100) }),
      "NOT_FOUND",
      "Template not found",
    );
  });

  it("throws FORBIDDEN 'Forbidden' on a built-in template and changes nothing", () => {
    const builtIn = builtInTemplate();
    const before = templates.get(handle.db, { templateId: builtIn.id });

    expectError(
      () =>
        templates.update(handle.db, {
          templateId: builtIn.id,
          name: "Mine now",
          categories: split(100),
        }),
      "FORBIDDEN",
      "Forbidden",
    );
    expect(templates.get(handle.db, { templateId: builtIn.id })).toEqual(before);
  });

  it("patches name and description and returns { success: true }", () => {
    const templateId = createTemplate("Old", 100);
    const [category] = templates.get(handle.db, { templateId }).template.categories;

    const result = templates.update(handle.db, {
      templateId,
      name: "New",
      description: "now described",
      categories: [category],
    });

    expect(result).toEqual({ success: true });
    expect(templates.get(handle.db, { templateId }).template).toMatchObject({
      name: "New",
      description: "now described",
    });
  });

  it("clears the description when it is omitted", () => {
    const templateId = createTemplate("Mine", 100);
    templates.update(handle.db, {
      templateId,
      name: "Mine",
      description: "set",
      categories: templates.get(handle.db, { templateId }).template.categories,
    });

    templates.update(handle.db, {
      templateId,
      name: "Mine",
      categories: templates.get(handle.db, { templateId }).template.categories,
    });

    expect(templates.get(handle.db, { templateId }).template.description).toBeNull();
  });

  it("deletes categories left out, patches those with an id and inserts those without, in input order", () => {
    // sort_order follows the input.
    const templateId = createTemplate("Mine", 50, 30, 20);
    const [kept, dropped, alsoKept] = templates.get(handle.db, { templateId }).template.categories;

    templates.update(handle.db, {
      templateId,
      name: "Mine",
      categories: [
        { name: "Inserted", percentage: 10, description: "new", editable: false },
        { ...alsoKept, name: "Renamed", percentage: 40 },
        { id: kept.id, name: kept.name, percentage: 50, editable: false },
      ],
    });

    const { categories } = templates.get(handle.db, { templateId }).template;
    expect(categories).toEqual([
      {
        id: expect.any(String),
        name: "Inserted",
        percentage: 10,
        description: "new",
        editable: false,
      },
      { id: alsoKept.id, name: "Renamed", percentage: 40, description: null, editable: true },
      { id: kept.id, name: "C1", percentage: 50, description: null, editable: false },
    ]);
    expect(categories.map((c) => c.id)).not.toContain(dropped.id);
    expect(sortOrders(templateId)).toEqual([1, 2, 3]);
  });

  it("re-checks that the percentages sum to 100 and changes nothing when they don't", () => {
    // update re-runs the create sum check.
    const templateId = createTemplate("Mine", 50, 50);
    const before = templates.get(handle.db, { templateId });
    const [first] = before.template.categories;

    expectError(
      () =>
        templates.update(handle.db, {
          templateId,
          name: "Changed",
          categories: [{ ...first, percentage: 60 }],
        }),
      "BAD_REQUEST",
      "Categories percentage must be 100%",
    );
    expect(templates.get(handle.db, { templateId })).toEqual(before);
  });

  it("accepts 33.4/33.3/33.3, whose float sum is 99.99999999999999, by rounding the sum to cents", () => {
    const templateId = createTemplate("Mine", 50, 50);

    expect(
      templates.update(handle.db, {
        templateId,
        name: "Thirds",
        categories: split(33.4, 33.3, 33.3),
      }),
    ).toEqual({ success: true });
    expect(templates.get(handle.db, { templateId }).template).toMatchObject({
      name: "Thirds",
      categories: [{ percentage: 33.4 }, { percentage: 33.3 }, { percentage: 33.3 }],
    });
  });

  it.each([[[33.33, 33.33, 33.33]], [[50, 50.01]]])(
    "still rejects %j, a sum a cent off 100, and changes nothing",
    (percentages) => {
      const templateId = createTemplate("Mine", 50, 50);
      const before = templates.get(handle.db, { templateId });

      expectError(
        () =>
          templates.update(handle.db, {
            templateId,
            name: "Off",
            categories: split(...percentages),
          }),
        "BAD_REQUEST",
        "Categories percentage must be 100%",
      );
      expect(templates.get(handle.db, { templateId })).toEqual(before);
    },
  );

  it("throws NOT_FOUND 'Category not found' for a category id of another template and changes neither", () => {
    // The category id must belong to the template being updated.
    const templateId = createTemplate("Mine", 100);
    const builtIn = builtInTemplate();
    const builtInBefore = templates.get(handle.db, { templateId: builtIn.id });
    const mineBefore = templates.get(handle.db, { templateId });
    const [foreign] = builtInBefore.template.categories;

    expectError(
      () =>
        templates.update(handle.db, {
          templateId,
          name: "Changed",
          categories: [{ ...foreign, name: "Hijacked", percentage: 100 }],
        }),
      "NOT_FOUND",
      "Category not found",
    );
    expect(templates.get(handle.db, { templateId: builtIn.id })).toEqual(builtInBefore);
    expect(templates.get(handle.db, { templateId })).toEqual(mineBefore);
  });

  it("throws NOT_FOUND 'Category not found' for an unknown category id", () => {
    const templateId = createTemplate("Mine", 100);

    expectError(
      () =>
        templates.update(handle.db, {
          templateId,
          name: "Mine",
          categories: [
            {
              id: asId<"templateCategories">("missing"),
              name: "X",
              percentage: 100,
              editable: true,
            },
          ],
        }),
      "NOT_FOUND",
      "Category not found",
    );
  });
});

describe("templates.delete", () => {
  it("throws NOT_FOUND 'Template not found' for a missing id", () => {
    expectError(
      () => templates.delete(handle.db, { templateId: missingId }),
      "NOT_FOUND",
      "Template not found",
    );
  });

  it("throws FORBIDDEN 'Forbidden' on a built-in template and keeps it", () => {
    const builtIn = builtInTemplate();
    const before = templates.get(handle.db, { templateId: builtIn.id });

    expectError(
      () => templates.delete(handle.db, { templateId: builtIn.id }),
      "FORBIDDEN",
      "Forbidden",
    );
    expect(templates.get(handle.db, { templateId: builtIn.id })).toEqual(before);
  });

  it("deletes the template with its categories; its budgets stay, with template_id NULL", () => {
    const templateId = createTemplate("Mine", 60, 40);
    const otherId = createTemplate("Other", 100);
    handle.db
      .insert(budgets)
      .values([
        { id: asId<"budgets">("mine"), title: "From mine", currency: "usd", templateId },
        { id: asId<"budgets">("other"), title: "From other", currency: "usd", templateId: otherId },
      ])
      .run();

    expect(templates.delete(handle.db, { templateId })).toEqual({ success: true });

    expect(templates.list(handle.db).templates.map((t) => t.id)).not.toContain(templateId);
    expect(sortOrders(templateId)).toEqual([]);
    expect(templates.get(handle.db, { templateId: otherId }).template.categories).toHaveLength(1);
    const rows = handle.db
      .select({ id: budgets.id, templateId: budgets.templateId })
      .from(budgets)
      .where(inArray(budgets.id, [asId<"budgets">("mine"), asId<"budgets">("other")]))
      .orderBy(budgets.id)
      .all();
    expect(rows).toEqual([
      { id: "mine", templateId: null },
      { id: "other", templateId: otherId },
    ]);
  });
});

describe("templates.duplicate", () => {
  it("throws NOT_FOUND 'Template not found' for a missing id", () => {
    expectError(
      () => templates.duplicate(handle.db, { templateId: missingId }),
      "NOT_FOUND",
      "Template not found",
    );
  });

  it("copies a built-in as an editable user template named '<name> (Copy)' and returns { newTemplateId }", () => {
    // Built-in templates can be duplicated like the user's own.
    const builtIn = builtInTemplate();
    const source = templates.get(handle.db, { templateId: builtIn.id }).template;

    const { newTemplateId } = templates.duplicate(handle.db, { templateId: builtIn.id });

    const { template: copy } = templates.get(handle.db, { templateId: newTemplateId });
    expect(newTemplateId).not.toBe(builtIn.id);
    expect(copy).toMatchObject({
      name: `${source.name} (Copy)`,
      description: source.description,
      isDefault: false,
    });
    expect(copy.categories.map(({ id: _id, ...c }) => c)).toEqual(
      source.categories.map(({ id: _id, ...c }) => c),
    );
    expect(copy.categories.map((c) => c.id)).not.toContain(source.categories[0].id);
    expect(templates.get(handle.db, { templateId: builtIn.id }).template).toEqual(source);
    // Listed with the user templates, before the built-ins.
    expect(templates.list(handle.db).templates[0].id).toBe(newTemplateId);
  });

  it("copies every category of a user template, keeping their order", () => {
    const templateId = createTemplate("Mine", 10, 20, 30, 40);

    const { newTemplateId } = templates.duplicate(handle.db, { templateId });

    const { template: copy } = templates.get(handle.db, { templateId: newTemplateId });
    expect(copy.name).toBe("Mine (Copy)");
    expect(copy.categories.map((c) => [c.name, c.percentage])).toEqual([
      ["C1", 10],
      ["C2", 20],
      ["C3", 30],
      ["C4", 40],
    ]);
    expect(sortOrders(newTemplateId)).toEqual([1, 2, 3, 4]);
  });
});
