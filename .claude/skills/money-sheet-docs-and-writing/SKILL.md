---
name: money-sheet-docs-and-writing
description: Maintain money-sheet-monorepo documentation as an accurate decision and operating record: README/setup guidance, CONTEXT.md glossary, ADRs, CLAUDE.md, agent skills, and issue/PR text. Use when documentation must change with implementation, a contract or workflow needs recording, or existing docs conflict with repository evidence.
---

# Documentation and writing

Treat repository docs as operational interfaces. Update the smallest document that owns the fact, then remove or correct stale copies that would misdirect a future maintainer.

## Choose the document of record

| Information | Owner |
|---|---|
| Domain terms, sheet schema, policies, current behavioral contracts | `CONTEXT.md` |
| Why a durable architectural constraint exists | `docs/adr/NNNN-slug.md` |
| Setup and user-facing operation | `README.md` |
| Repository structure, commands, and agent constraints | `CLAUDE.md` |
| Agent task procedure or specialized reference | `.claude/skills/<name>/SKILL.md` and optional `REFERENCE.md` |
| Work intent, triage, acceptance criteria | GitHub issue / PR |

## Update loop

1. Read the implementation, tests, relevant ADRs, and the existing document before editing.
2. Write the current truth, not a proposed future state. Qualify known gaps with issue numbers when useful.
3. Prefer a pointer to the single source of truth over copying volatile scripts, line numbers, or configuration values.
4. Search for contradictory descriptions across `README.md`, `CONTEXT.md`, `CLAUDE.md`, ADRs, and skills; reconcile material conflicts in the same change.
5. Validate commands against `package.json` and workflows, then review the rendered Markdown and links.

## ADRs

Create an ADR for a decision that constrains future work: data layout, write/auth semantics, locking, queue behavior, deployment model, component policy, or source of derived financial values. State context, decision, consequences, and rejected alternatives. If a change contradicts an existing ADR, make that conflict explicit before implementation rather than silently editing history.

## Agent skills

- Keep the frontmatter description a precise trigger pointer; only create a model-invoked skill when autonomous discovery is useful.
- Put the repeatable procedure in `SKILL.md`; move deep, branch-specific evidence to a sibling `REFERENCE.md`.
- Make every route named in a skill resolve to a committed skill or an explicit repository document.
- Give volatile claims a short provenance/re-verification section instead of presenting them as timeless facts.

## When NOT to use this skill

- Deciding whether a code change is authorized or ready to merge → `money-sheet-change-control`.
- Building a new skill's general writing mechanics → the shared `writing-for-agents` guidance.
- Domain design choices themselves → `money-sheet-architecture-contract` and the relevant ADR.

## Provenance

- Documentation ownership: `CLAUDE.md`, `CONTEXT.md`, and `docs/adr/`.
- Issue and triage process: `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`.
