/**
 * The `cushn` skill Connect installs for Claude Code and Codex, as `cushn/SKILL.md`. It says when
 * to reach for the tools and how to work with them; the domain itself is in the server's
 * `CUSHN_INSTRUCTIONS`, which clients load alongside the tools.
 */
export const CUSHN_SKILL = `---
name: cushn
description: Read and change the user's budgets and expenses in Cushn, their budgeting app on this computer, through the cushn MCP tools. Use when the user asks about their budgets, income, spending, expenses, allocations or categories, wants to log or fix an expense, plan, archive or trash a budget, or mentions Cushn.
---

# Cushn

Cushn keeps the user's budgets on this computer. The \`cushn\` MCP server's tools read and change them in the running app; the server's own instructions explain budgets, allocations and money.

## When to use it

- Questions about the user's own money in Cushn: what was spent, what's left in a category, which budget is over, how a month went.
- Changes they ask for: log or correct expenses, create a budget from a template, archive or trash a budget, label it or move it to a View.
- Not for general money advice that needs none of their data, and not for other budgeting apps or spreadsheets.

## When Cushn isn't open

The tools start Cushn in the background when it isn't running, so the user doesn't need to open it. If the \`cushn\` tools are missing, or a call says Cushn couldn't start, ask the user to open Cushn and then reconnect (\`/mcp\` in Claude Code, a new session in Codex). Don't retry in a loop, and don't look for Cushn's data on disk.

## Changing things

- Look before you write: find budgets and expenses with the list and get tools, and use the ids they return.
- Do what was asked and no more. Before a broad change (many expenses, several budgets), say what you're about to do.
- Every change can be undone with the tools, so keep what a write returns until you're done: \`delete_expenses\` gives back the rows \`restore_expenses\` needs.
- Changes show up in the app at once.

## Afterwards

Tell the user what you changed: which budget, which expenses, the old and new values, and how to undo it. Offer to undo it yourself.
`;
