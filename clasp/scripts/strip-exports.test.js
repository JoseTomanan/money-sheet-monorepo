import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const vm = require("node:vm");
const ts = require("typescript");
const { build, flattenCompiledLib } = require("./strip-exports.js");

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "money-sheet-build-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "appsscript.json"), "{}\n");
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, "dist", "lib", relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return root;
}

function productionFixture() {
  const root = mkdtempSync(join(tmpdir(), "money-sheet-production-build-"));
  const sourceRoot = join(import.meta.dirname, "..", "src");

  function compileDirectory(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const sourcePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        compileDirectory(sourcePath);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        const relativePath = sourcePath
          .slice(sourceRoot.length + 1)
          .replace(/\.ts$/, ".js");
        const outputPath = join(root, "dist", relativePath);
        mkdirSync(dirname(outputPath), { recursive: true });
        const output = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
          compilerOptions: {
            alwaysStrict: true,
            module: ts.ModuleKind.ES2015,
            target: ts.ScriptTarget.ES2019,
          },
          fileName: sourcePath,
        }).outputText;
        writeFileSync(outputPath, output);
      }
    }
  }

  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "appsscript.json"),
    readFileSync(join(sourceRoot, "appsscript.json"), "utf8"),
  );
  compileDirectory(sourceRoot);
  return root;
}

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name);
      return entry.isDirectory() ? javascriptFiles(entryPath) : [entryPath];
    })
    .filter((filePath) => filePath.endsWith(".js"))
    .sort();
}

describe("GAS module flattening", () => {
  it("evaluates the complete generated program in GAS shared-global order", () => {
    const root = productionFixture();
    build(root);
    const context = vm.createContext({});

    expect(() => {
      for (const filePath of javascriptFiles(join(root, "dist"))) {
        vm.runInContext(readFileSync(filePath, "utf8"), context, {
          filename: filePath,
        });
      }
    }).not.toThrow();
  });

  it("flattens a nested Domain module and removes cross-directory module syntax", () => {
    const root = fixture({
      "domain/rules.js":
        'import { Entry } from "../shared/entry.js";\nexport function isValid(entry) { return Boolean(entry); }\n',
    });

    flattenCompiledLib(root);

    const output = readFileSync(
      join(root, "dist", "lib", "1_domain__rules.js"),
      "utf8"
    );
    expect(output).toBe(
      "\nfunction isValid(entry) { return Boolean(entry); }\n"
    );
  });

  it("rejects source paths that flatten to the same output name", () => {
    const root = fixture({
      "domain/money__entry.js": "export const first = 1;\n",
      "domain/money/entry.js": "export const second = 2;\n",
    });

    expect(() => flattenCompiledLib(root)).toThrow(
      /duplicate flattened name.*1_domain__money__entry\.js/i
    );
  });

  it("rejects duplicate exported global names", () => {
    const root = fixture({
      "domain/entry.js": "export const parseEntry = () => 1;\n",
      "application/entry.js": "export function parseEntry() { return 2; }\n",
    });

    expect(() => flattenCompiledLib(root)).toThrow(
      /duplicate exported global parseEntry(?=.*domain)(?=.*application)/i
    );
  });

  it("rejects module syntax that cannot preserve flat-global behavior", () => {
    const root = fixture({
      "application/use-case.js":
        'import { parseEntry as parse } from "../domain/entry.js";\nexport const run = parse;\n',
    });

    expect(() => flattenCompiledLib(root)).toThrow(
      /unsupported module syntax.*application.*use-case\.js.*aliased import/i
    );
  });

  it("rejects default exports before writing deployment files", () => {
    const root = fixture({
      "domain/default-entry.js":
        "export default function parseEntry() { return 1; }\n",
    });

    expect(() => flattenCompiledLib(root)).toThrow(
      /unsupported module syntax.*domain.*default-entry\.js.*default export/i
    );
  });

  it("emits every role deterministically while pruning legacy artifacts", () => {
    const root = fixture({
      "domain/value.js": "export const domainValue = 1;\n",
      "application/use-case.js": "export const applicationValue = 2;\n",
      "presentation/http.js": "export const presentationValue = 3;\n",
      "infrastructure/sheets.js": "export const infrastructureValue = 4;\n",
      "composition.js": "export const compositionValue = 5;\n",
      "legacy.js": "export const legacyValue = 0;\n",
    });
    writeFileSync(join(root, "src", "appsscript.json"), '{"timeZone":"UTC"}\n');
    writeFileSync(join(root, "src", "9_main.ts"), "function doGet() {}\n");
    writeFileSync(join(root, "dist", "9_main.js"), "function doGet() {}\n");

    build(root);
    const first = readdirSync(join(root, "dist", "lib"))
      .sort()
      .map((name) => [name, readFileSync(join(root, "dist", "lib", name), "utf8")]);
    build(root);
    const second = readdirSync(join(root, "dist", "lib"))
      .sort()
      .map((name) => [name, readFileSync(join(root, "dist", "lib", name), "utf8")]);

    expect({
      first,
      second,
      manifest: readFileSync(join(root, "dist", "appsscript.json"), "utf8"),
      entrypoint: readFileSync(join(root, "dist", "9_main.js"), "utf8"),
    }).toEqual({
      first: [
        ["1_domain__value.js", "const domainValue = 1;\n"],
        ["2_application__use-case.js", "const applicationValue = 2;\n"],
        ["3_presentation__http.js", "const presentationValue = 3;\n"],
        ["4_infrastructure__sheets.js", "const infrastructureValue = 4;\n"],
        ["composition.js", "const compositionValue = 5;\n"],
      ],
      second: first,
      manifest: '{"timeZone":"UTC"}\n',
      entrypoint: "function doGet() {}\n",
    });
  });

  it("validates every module before writing any flattened output", () => {
    const root = fixture({
      "domain/valid.js": "export const valid = true;\n",
      "infrastructure/invalid.js":
        'import { valid as renamed } from "../domain/valid.js";\nexport const invalid = renamed;\n',
    });

    expect(() => flattenCompiledLib(root)).toThrow(/aliased import/i);
    expect(
      existsSync(join(root, "dist", "lib", "1_domain__valid.js"))
    ).toBe(false);
  });

  it("prunes compiled root files whose TypeScript entrypoints were removed", () => {
    const root = fixture({
      "domain/value.js": "export const domainValue = 1;\n",
    });
    writeFileSync(join(root, "dist", "2_entries.js"), "function stale() {}\n");

    build(root);

    expect(existsSync(join(root, "dist", "2_entries.js"))).toBe(false);
  });

  it("replaces stale flattened role artifacts on an incremental build", () => {
    const root = fixture({
      "application/action.js": "export const action = 'new';\n",
      "2_application__action.js": "const action = 'stale';\n",
    });

    flattenCompiledLib(root);

    expect(readFileSync(
      join(root, "dist", "lib", "2_application__action.js"),
      "utf8",
    )).toBe("const action = 'new';\n");
  });

  it("detects globals exported through a local export list", () => {
    const root = fixture({
      "domain/entry.js":
        "const parseEntry = () => 1;\nexport { parseEntry };\n",
      "application/entry.js":
        "export function parseEntry() { return 2; }\n",
    });

    expect(() => flattenCompiledLib(root)).toThrow(
      /duplicate exported global parseEntry(?=.*domain)(?=.*application)/i
    );
  });
});
