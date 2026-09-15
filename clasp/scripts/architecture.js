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

function hasDeclareModifier(statement) {
  return statement.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword
  );
}

function isCompositionTypeQuery(type, name, source) {
  if (!type) return false;
  const text = type.getText(source).replaceAll(/\s+/g, "");
  return text === `typeofimport(\"./lib/composition\").${name}` ||
    text === `typeofimport('./lib/composition').${name}`;
}

function isModuleDerivedType(type, source) {
  const text = type.getText(source).replaceAll(/\s+/g, "");
  return /^(?:typeof)?import\((["']).+\1\)\.[A-Za-z_$][\w$]*$/.test(text);
}

function exportedValueNames(source, fileName) {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const names = new Set();
  for (const statement of parsed.statements) {
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    );
    if (!exported) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }
  return names;
}

function identifierNames(source, fileName, candidates) {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const names = new Set();
  function visit(node) {
    if (ts.isIdentifier(node) && candidates.has(node.text)) names.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return names;
}

function analyzeGlobalBridge(files, rootEntrypoints) {
  const normalizedFiles = Object.fromEntries(
    Object.entries(files).map(([filePath, source]) => [normalized(filePath), source])
  );
  const bridgePath = "src/_globals.ts";
  const bridge = normalizedFiles[bridgePath];
  const violations = Object.keys(normalizedFiles)
    .filter((filePath) => /^src\/_[^/]+_globals\.ts$/.test(filePath))
    .sort()
    .map((filePath) => `${filePath} is an extra ambient GAS bridge`);
  if (bridge === undefined) return [...violations, `${bridgePath} is missing`];

  const source = ts.createSourceFile(
    bridgePath,
    bridge,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const declarations = new Set();
  for (const statement of source.statements) {
    if (ts.isTypeAliasDeclaration(statement)) {
      if (!isModuleDerivedType(statement.type, source)) {
        violations.push(
          `${bridgePath} type ${statement.name.text} must use import(...)`
        );
      }
      continue;
    }
    if (ts.isInterfaceDeclaration(statement)) {
      violations.push(
        `${bridgePath} interface ${statement.name.text} must use import(...)`
      );
      continue;
    }
    if (!ts.isVariableStatement(statement) || !hasDeclareModifier(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const name = declaration.name.text;
      if (name.startsWith("composition")) declarations.add(name);
      if (
        name.startsWith("composition") &&
        !isCompositionTypeQuery(declaration.type, name, source)
      ) {
        violations.push(
          `${bridgePath} declaration ${name} must use typeof import(\"./lib/composition\")`
        );
      }
    }
  }

  const compositionPath = "src/lib/composition.ts";
  const composition = normalizedFiles[compositionPath];
  if (composition === undefined) {
    violations.push(`${compositionPath} is missing`);
    return violations;
  }
  const compositionExports = exportedValueNames(composition, compositionPath);
  const usedByRoots = new Set();
  for (const rootEntrypoint of rootEntrypoints) {
    const rootPath = normalized(rootEntrypoint);
    const root = normalizedFiles[rootPath];
    if (root === undefined) continue;
    for (const name of identifierNames(root, rootPath, compositionExports)) {
      usedByRoots.add(name);
      if (!declarations.has(name)) {
        violations.push(
          `${rootPath} uses ${name}, which is missing from ${bridgePath}`
        );
      }
    }
  }
  for (const name of declarations) {
    if (!compositionExports.has(name)) {
      violations.push(
        `${bridgePath} declaration ${name} is not exported by ${compositionPath}`
      );
    } else if (!usedByRoots.has(name)) {
      violations.push(
        `${bridgePath} declaration ${name} is not used by a root entrypoint`
      );
    }
  }
  return violations;
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
  analyzeGlobalBridge,
  CURRENT_ARCHITECTURE_POLICY,
  readProductionFiles,
};
