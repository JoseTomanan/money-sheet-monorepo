# ADR-0014: Organize clasp by explicit dependency roles

**Status:** Accepted

## Context

The `clasp` package must support two different environments: ordinary TypeScript modules for local testing and a Google Apps Script deployment that executes a flat global program with named entrypoints. Its existing numbered runtime files and ambient declarations preserve that constraint, but the source tree does not make dependency direction obvious. Optimizing only for fewer files would hide responsibilities in large modules without improving testability or locality.

## Decision

Organize production implementation under `clasp/src/lib/` using four explicit roles containing focused modules:

- **Domain** owns Entry, Direction, Category, Tag, calendar/week concepts, and invariant validation. It depends on no other role and contains no GAS globals or sheet coordinates.
- **Application** owns use-case orchestration, dispatching, repository interfaces, planning, and result/error contracts. It may depend on Domain.
- **Presentation** translates HTTP, menu, and trigger input into Application calls. It may depend on Application and Domain, but not Infrastructure.
- **Infrastructure** implements Application interfaces using Google Sheets, formula/layout realization, locking, properties, trigger installation, and setup. It may depend on Application interfaces and Domain.

Only a composition root may depend on both Presentation and Infrastructure. A focused architecture test enforces these import rules and rejects circular role dependencies.

The source root retains only `appsscript.json`, thin globally named GAS entrypoints, one hand-maintained `_globals.ts` bridge using `typeof import(...)`, and the unavoidable GAS-global wire-type parity guard. The existing `tsc -> strip-exports -> clasp` pipeline and flat GAS runtime remain. Its post-build step recursively flattens nested compiled modules in deterministic dependency order and fails on ambiguous filenames, duplicate exported globals, unsupported module forms, or surviving module syntax.

Issue #166 is an umbrella delivered through behavior-preserving child issues. External action names, request/response envelopes, trigger names, sheet behavior, domain invariants, cross-package contracts, and Mock Mode's GAS-free imports remain stable. Internal module interfaces and import paths may change. Pure moves require deterministic local checks; the final infrastructure/composition migration requires explicitly authorized live verification against a safe spreadsheet copy.

## Consequences

- Success is measured by enforceable dependency direction, testability, depth, and locality—not a target file count.
- Necessary GAS adapters remain separate when they concentrate platform-specific implementation.
- Modules that mix roles are split by responsibility rather than moved intact.
- The migration is incremental; every child issue must leave the package buildable and behaviorally unchanged unless a separate defect is explicitly identified.

## Considered options

- **Four large role files:** rejected because it would reduce artifact count by creating shallow or god-like modules.
- **Roles as documentation only:** rejected because dependency drift would not fail CI.
- **Replace the pipeline with a bundler:** rejected because it adds risk around GAS global entrypoints without improving the chosen dependency model.
