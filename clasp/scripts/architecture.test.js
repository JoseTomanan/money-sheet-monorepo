import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  analyzeArchitecture,
  CURRENT_ARCHITECTURE_POLICY,
  readProductionFiles,
} = require("./architecture.js");

describe("clasp dependency roles", () => {
  it("reports a Domain module that imports Application", () => {
    const violations = analyzeArchitecture({
      "src/lib/domain/entry.ts":
        'import { saveEntry } from "../application/save-entry";\n',
      "src/lib/application/save-entry.ts": "export const saveEntry = () => {};\n",
    });

    expect(violations).toEqual([
      expect.stringMatching(
        /src\/lib\/domain\/entry\.ts.*src\/lib\/application\/save-entry\.ts/
      ),
    ]);
  });

  it("enforces every Domain, Application, Presentation, and Infrastructure direction", () => {
    const roles = ["domain", "application", "presentation", "infrastructure"];
    const allowed = new Set([
      "domain->domain",
      "application->application",
      "application->domain",
      "presentation->presentation",
      "presentation->application",
      "presentation->domain",
      "infrastructure->infrastructure",
      "infrastructure->application",
      "infrastructure->domain",
    ]);

    for (const importerRole of roles) {
      for (const targetRole of roles) {
        const files = {
          [`src/lib/${importerRole}/importer.ts`]:
            `import { target } from "../${targetRole}/target";\n`,
          [`src/lib/${targetRole}/target.ts`]: "export const target = 1;\n",
        };
        const violations = analyzeArchitecture(files);
        const direction = `${importerRole}->${targetRole}`;

        expect(violations, direction).toHaveLength(allowed.has(direction) ? 0 : 1);
      }
    }
  });

  it("reports circular dependencies between role modules", () => {
    const violations = analyzeArchitecture({
      "src/lib/domain/entry.ts":
        'import { saveEntry } from "../application/save-entry";\n',
      "src/lib/application/save-entry.ts":
        'import { Entry } from "../domain/entry";\nexport const saveEntry = (entry: Entry) => entry;\n',
    });

    expect(violations).toContainEqual(
      expect.stringMatching(
        /circular dependency(?=.*domain\/entry\.ts)(?=.*application\/save-entry\.ts)/i
      )
    );
  });

  it("reserves Presentation plus Infrastructure wiring for the composition root", () => {
    const files = {
      "src/lib/presentation/http.ts": "export const http = {};\n",
      "src/lib/infrastructure/sheets.ts": "export const sheets = {};\n",
      "src/lib/composition.ts":
        'import { http } from "./presentation/http";\nimport { sheets } from "./infrastructure/sheets";\n',
      "src/lib/legacy-wiring.ts":
        'import { http } from "./presentation/http";\nimport { sheets } from "./infrastructure/sheets";\n',
    };

    expect(analyzeArchitecture(files)).toEqual([
      expect.stringMatching(
        /src\/lib\/legacy-wiring\.ts.*presentation.*infrastructure.*composition root/i
      ),
    ]);
  });

  it("rejects unapproved root and flat production artifacts", () => {
    const violations = analyzeArchitecture(
      {
        "src/appsscript.json": "{}\n",
        "src/_globals.ts": "export {};\n",
        "src/_contract_parity.ts": "export {};\n",
        "src/9_main.ts": "function doGet() {}\n",
        "src/unexpected.ts": "export {};\n",
        "src/lib/legacy.ts": "export {};\n",
        "src/lib/new-flat.ts": "export {};\n",
        "src/rogue/helper.ts": "export {};\n",
      },
      {
        rootEntrypoints: ["src/9_main.ts"],
        legacyRootArtifacts: [],
        legacyFlatModules: ["src/lib/legacy.ts"],
      }
    );

    expect(violations).toEqual([
      expect.stringMatching(/src\/lib\/new-flat\.ts.*not an approved role module/i),
      expect.stringMatching(/src\/rogue\/helper\.ts.*not an approved source artifact/i),
      expect.stringMatching(/src\/unexpected\.ts.*not an approved root artifact/i),
    ]);
  });

  it("allows listed legacy modules to coexist but not become role dependencies", () => {
    const policy = {
      rootEntrypoints: [],
      legacyRootArtifacts: [],
      legacyFlatModules: ["src/lib/legacy.ts"],
    };
    const violations = analyzeArchitecture(
      {
        "src/lib/legacy.ts":
          'import { entry } from "./domain/entry";\nexport const legacy = entry;\n',
        "src/lib/domain/entry.ts":
          'import { legacy } from "../legacy";\nexport const entry = legacy;\n',
      },
      policy
    );

    expect(violations).toEqual([
      expect.stringMatching(
        /src\/lib\/domain\/entry\.ts.*src\/lib\/legacy\.ts.*legacy flat module/i
      ),
    ]);
  });

  it("enforces dependencies expressed through type imports and re-exports", () => {
    const violations = analyzeArchitecture({
      "src/lib/domain/types.ts":
        'type SheetPort = typeof import("../infrastructure/sheets").SheetPort;\nexport type { AppPort } from "../application/port";\n',
      "src/lib/application/port.ts": "export interface AppPort {}\n",
      "src/lib/infrastructure/sheets.ts": "export interface SheetPort {}\n",
    });

    expect(violations).toEqual([
      expect.stringMatching(/domain\/types\.ts.*infrastructure\/sheets\.ts/),
      expect.stringMatching(/domain\/types\.ts.*application\/port\.ts/),
    ]);
  });

  it("keeps the production source tree inside the transitional architecture policy", () => {
    const files = readProductionFiles(join(import.meta.dirname, "..", "src"));

    expect(analyzeArchitecture(files, CURRENT_ARCHITECTURE_POLICY)).toEqual([]);
  });

  it("finishes the migration with only explicit root entrypoints and no exemptions", () => {
    expect(CURRENT_ARCHITECTURE_POLICY).toEqual({
      rootEntrypoints: [
        "src/5_visibility.ts",
        "src/6_category_sync.ts",
        "src/6_menu.ts",
        "src/7_setup.ts",
        "src/9_main.ts",
      ],
      legacyRootArtifacts: [],
      legacyFlatModules: [],
    });
  });

  it("makes every migration exemption exact and removable", () => {
    const violations = analyzeArchitecture(
      { "src/appsscript.json": "{}\n" },
      {
        rootEntrypoints: [],
        legacyRootArtifacts: ["src/removed-root.ts"],
        legacyFlatModules: ["src/lib/removed-flat.ts"],
      }
    );

    expect(violations).toEqual([
      expect.stringMatching(/src\/lib\/removed-flat\.ts.*obsolete exemption/i),
      expect.stringMatching(/src\/removed-root\.ts.*obsolete exemption/i),
    ]);
  });

  it("resolves directory-index and JavaScript-style TypeScript imports", () => {
    const violations = analyzeArchitecture({
      "src/lib/domain/entry.ts":
        'import { save } from "../application";\nimport { sheets } from "../infrastructure/sheets.js";\n',
      "src/lib/application/index.ts": "export const save = 1;\n",
      "src/lib/infrastructure/sheets.ts": "export const sheets = 1;\n",
    });

    expect(violations).toEqual([
      expect.stringMatching(/domain\/entry\.ts.*application\/index\.ts/),
      expect.stringMatching(/domain\/entry\.ts.*infrastructure\/sheets\.ts/),
    ]);
  });

  it("enforces TypeScript import-equals dependencies", () => {
    const violations = analyzeArchitecture({
      "src/lib/domain/entry.ts":
        'import sheets = require("../infrastructure/sheets");\nexport const entry = sheets;\n',
      "src/lib/infrastructure/sheets.ts": "export const sheets = 1;\n",
    });

    expect(violations).toEqual([
      expect.stringMatching(/domain\/entry\.ts.*infrastructure\/sheets\.ts/),
    ]);
  });
});
