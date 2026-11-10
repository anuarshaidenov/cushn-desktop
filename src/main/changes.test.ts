import { describe, expect, it } from "vitest";
import type { ChangedEvent } from "@shared/api";
import { type ChangeTarget, createChangeNotifier } from "./changes";

function fakeTarget(destroyed = false) {
  const sent: [string, ChangedEvent][] = [];
  const target: ChangeTarget = {
    isDestroyed: () => destroyed,
    send: (channel, event) => sent.push([channel, event]),
  };
  return { target, sent };
}

describe("createChangeNotifier", () => {
  it("sends the roots on cushn:changed to every live window", () => {
    const first = fakeTarget();
    const second = fakeTarget();
    const notify = createChangeNotifier(() => [first.target, second.target]);

    notify(["budgets", "home"]);

    expect(first.sent).toEqual([["cushn:changed", { roots: ["budgets", "home"] }]]);
    expect(second.sent).toEqual(first.sent);
  });

  it("skips destroyed windows", () => {
    const live = fakeTarget();
    const destroyed = fakeTarget(true);
    const notify = createChangeNotifier(() => [destroyed.target, live.target]);

    notify(["expenses"]);

    expect(destroyed.sent).toEqual([]);
    expect(live.sent).toHaveLength(1);
  });

  it("sends each root once", () => {
    const window = fakeTarget();
    const notify = createChangeNotifier(() => [window.target]);

    notify(["budgets", "home", "budgets"]);

    expect(window.sent).toEqual([["cushn:changed", { roots: ["budgets", "home"] }]]);
  });

  it("sends nothing for no roots", () => {
    const window = fakeTarget();
    const notify = createChangeNotifier(() => [window.target]);

    notify([]);

    expect(window.sent).toEqual([]);
  });

  it("reads the windows at each notification, not once", () => {
    const windows: ChangeTarget[] = [];
    const notify = createChangeNotifier(() => windows);
    const opened = fakeTarget();
    windows.push(opened.target);

    notify(["labels"]);

    expect(opened.sent).toHaveLength(1);
  });
});
