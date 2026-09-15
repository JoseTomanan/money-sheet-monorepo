const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ALLOWED_ROLE_IMPORTS = Object.freeze({
  domain: new Set(["domain"]),
  application: new Set(["application", "domain"]),
  presentation: new Set(["presentation", "application", "domain"]),
  infrastructure: new Set(["infrastructure", "application", "domain"]),
  composition: new Set([
    "composition",
    "presentation",
    "infrastructure",
    "application",
    "domain",
  ]),
});

const CURRENT_ARCHITECTURE_POLICY = Object.freeze({
  rootEntrypoints: [],
  legacyRootArtifacts: [
    "src/0_types.ts",
    "src/1_sheets.ts",
    "src/2_entries.ts",
    "src/3_master.ts",
    "src/3_stats.ts",
    "src/4_categories.ts",
    "src/5_visibility.ts",
    "src/6_category_sync.ts",
    "src/6_menu.ts",
    "src/7_setup.ts",
    "src/8_config.ts",
    "src/9_main.ts",
    "src/_categorySync_globals.ts",
    "src/_config_globals.ts",
    "src/_dispatch_globals.ts",
    "src/_entries_globals.ts",
    "src/_locking_globals.ts",
    "src/_master_globals.ts",
    "src/_menu_globals.ts",
    "src/_repository_globals.ts",
    "src/_setup_globals.ts",
    "src/_sheetLayout_globals.ts",
    "src/_stats_globals.ts",
    "src/_visibility_globals.ts",
    "src/_week_globals.ts",
  ],
  legacyFlatModules: [
    "src/lib/0_sheetLayout.ts",
    "src/lib/categorySync.ts",
    "src/lib/config.ts",
    "src/lib/dispatch.ts",
    "src/lib/entries.ts",
    "src/lib/locking.ts",
    "src/lib/master.ts",
    "src/lib/menu.ts",
    "src/lib/repository.ts",
    "src/lib/setup.ts",
    "src/lib/stats.ts",
    "src/lib/visibility.ts",
  ],
});

function normalized(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function roleOf(filePath) {
  const match = normalized(filePath).match(
    /^src\/lib\/(domain|application|presentation|infrastructure)\//
  );
  if (match) return match[1];
  if (normalized(filePath) === "src/lib/composition.ts") return "composition";
  return null;
}

function resolvedImport(importer, specifier, files) {
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(normalized(importer)), specifier)
  );
  const candidates = /\.[cm]?[jt]sx?$/.test(base)
    ? [base, base.replace(/\.js$/, ".ts").replace(/\.jsx$/, ".tsx")]
    : [`${base}.ts`, `${base}/index.ts`];
  return candidates.find((candidate) => files[candidate] !== undefined) ?? candidates[0];
}

function staticImports(source, fileName) {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const specifiers = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
      return;
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
      return;
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
      return;
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return specifiers;
}

function readProductionFiles(srcRoot) {
  const files = {};
  function walk(directory) {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (
        (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) ||
        entry.name === "appsscript.json"
      ) {
        const relativePath = normalized(path.relative(srcRoot, entryPath));
        files[`src/${relativePath}`] = fs.readFileSync(entryPath, "utf8");
      }
    }
  }
  walk(srcRoot);
  return files;
}

function analyzeArchitecture(files, policy = null) {
  const normalizedFiles = Object.fromEntries(
    Object.entries(files).map(([filePath, source]) => [normalized(filePath), source])
  );
  const violations = [];
  const graph = new Map();
  const legacyFlat = new Set(
    (policy?.legacyFlatModules ?? []).map(normalized)
  );

  if (policy) {
    const allowedRoot = new Set([
      "src/appsscript.json",
      "src/_globals.ts",
      "src/_contract_parity.ts",
      ...(policy.rootEntrypoints ?? []).map(normalized),
      ...(policy.legacyRootArtifacts ?? []).map(normalized),
    ]);
    const migrationExemptions = [
      ...(policy.legacyRootArtifacts ?? []),
      ...(policy.legacyFlatModules ?? []),
    ]
      .map(normalized)
      .sort();
    for (const exemption of migrationExemptions) {
      if (normalizedFiles[exemption] === undefined) {
        violations.push(`${exemption} is an obsolete exemption`);
      }
    }
    for (const filePath of Object.keys(normalizedFiles).sort()) {
      if (/^src\/lib\/[^/]+\.ts$/.test(filePath)) {
        if (filePath !== "src/lib/composition.ts" && !legacyFlat.has(filePath)) {
          violations.push(`${filePath} is not an approved role module`);
        }
      } else if (/^src\/[^/]+$/.test(filePath) && !allowedRoot.has(filePath)) {
        violations.push(`${filePath} is not an approved root artifact`);
      } else if (
        filePath.startsWith("src/") &&
        !/^src\/[^/]+$/.test(filePath) &&
        !roleOf(filePath)
      ) {
        violations.push(`${filePath} is not an approved source artifact`);
      }
    }
  }

  for (const [importer, source] of Object.entries(normalizedFiles).sort()) {
    const importerRole = roleOf(importer);
    const imports = staticImports(source, importer)
      .filter((specifier) => specifier.startsWith("."))
      .map((specifier) => resolvedImport(importer, specifier, normalizedFiles));
    const importedRoles = new Set(imports.map(roleOf).filter(Boolean));
    if (
      importerRole !== "composition" &&
      importedRoles.has("presentation") &&
      importedRoles.has("infrastructure")
    ) {
      violations.push(
        `${importer} imports both presentation and infrastructure; only the composition root may wire both roles`
      );
    }
    if (!importerRole) continue;
    const targets = [];
    for (const target of imports) {
      const targetRole = roleOf(target);
      if (legacyFlat.has(target)) {
        violations.push(
          `${importer} (${importerRole}) may not import ${target}, a legacy flat module`
        );
      }
      if (targetRole && normalizedFiles[target] !== undefined) targets.push(target);
      if (targetRole && !ALLOWED_ROLE_IMPORTS[importerRole].has(targetRole)) {
        violations.push(
          `${importer} (${importerRole}) may not import ${target} (${targetRole})`
        );
      }
    }
    graph.set(importer, targets.sort());
  }

  const visited = new Set();
  const visiting = new Set();
  const stack = [];
  function findCycle(modulePath) {
    if (visiting.has(modulePath)) {
      const start = stack.indexOf(modulePath);
      const cycle = [...stack.slice(start), modulePath];
      if (new Set(cycle.map(roleOf)).size > 1) {
        violations.push(`Circular dependency: ${cycle.join(" -> ")}`);
      }
      return;
    }
    if (visited.has(modulePath)) return;
    visiting.add(modulePath);
    stack.push(modulePath);
    for (const target of graph.get(modulePath) ?? []) findCycle(target);
    stack.pop();
    visiting.delete(modulePath);
    visited.add(modulePath);
  }
  for (const modulePath of [...graph.keys()].sort()) findCycle(modulePath);

  return violations;
}

module.exports = {
  analyzeArchitecture,
  CURRENT_ARCHITECTURE_POLICY,
  readProductionFiles,
};
