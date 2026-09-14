const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROLE_PREFIX = Object.freeze({
  domain: "1",
  application: "2",
  presentation: "3",
  infrastructure: "4",
});

function compiledJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? compiledJavaScriptFiles(entryPath)
        : entry.name.endsWith(".js")
          ? [entryPath]
          : [];
    })
    .sort((left, right) => left.localeCompare(right, "en"));
}

function flattenedName(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts.length === 1) return parts[0];

  const [role, ...rest] = parts;
  const prefix = ROLE_PREFIX[role];
  if (!prefix) {
    throw new Error(`Unsupported compiled module directory: ${role}`);
  }
  return `${prefix}_${role}__${rest.join("__")}`;
}

function unsupported(fileName, detail) {
  throw new Error(`Unsupported module syntax in ${fileName}: ${detail}`);
}

function relativeSpecifier(statement) {
  return statement.moduleSpecifier?.text?.startsWith(".");
}

function validateSupportedModuleSyntax(source, fileName) {
  if (source.parseDiagnostics.length > 0) {
    unsupported(fileName, "invalid JavaScript");
  }

  function visit(node) {
    if (
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword
      )
    ) {
      unsupported(fileName, "default export");
    } else if (ts.isImportDeclaration(node)) {
      if (!relativeSpecifier(node)) unsupported(fileName, "non-relative import");
      const clause = node.importClause;
      if (clause?.name) unsupported(fileName, "default import");
      if (clause && ts.isNamespaceImport(clause.namedBindings)) {
        unsupported(fileName, "namespace import");
      }
      if (clause && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (element.propertyName) unsupported(fileName, "aliased import");
        }
      }
    } else if (ts.isExportAssignment(node)) {
      unsupported(fileName, "default export");
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && !relativeSpecifier(node)) {
        unsupported(fileName, "non-relative export");
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          if (element.propertyName) unsupported(fileName, "aliased export");
        }
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      unsupported(fileName, "dynamic import");
    } else if (
      ts.isMetaProperty(node) &&
      node.keywordToken === ts.SyntaxKind.ImportKeyword
    ) {
      unsupported(fileName, "import.meta");
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function stripModuleSyntax(content, fileName) {
  const source = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.ES2019,
    true,
    ts.ScriptKind.JS
  );
  validateSupportedModuleSyntax(source, fileName);

  const edits = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
      edits.push([statement.getStart(source), statement.end, ""]);
      continue;
    }
    for (const modifier of statement.modifiers ?? []) {
      if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
        const end = content[modifier.end] === " " ? modifier.end + 1 : modifier.end;
        edits.push([modifier.getStart(source), end, ""]);
      }
    }
  }

  return edits
    .sort((left, right) => right[0] - left[0])
    .reduce(
      (result, [start, end, replacement]) =>
        result.slice(0, start) + replacement + result.slice(end),
      content
    );
}

function bindingNames(name) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
  );
}

function exportedGlobalNames(content, fileName) {
  const source = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.ES2019,
    true,
    ts.ScriptKind.JS
  );
  const names = [];
  for (const statement of source.statements) {
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    );
    if (!exported) continue;
    if (ts.isVariableStatement(statement)) {
      names.push(
        ...statement.declarationList.declarations.flatMap((declaration) =>
          bindingNames(declaration.name)
        )
      );
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      names.push(statement.name.text);
    }
  }
  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      names.push(...statement.exportClause.elements.map((element) => element.name.text));
    }
  }
  return names;
}

function flattenCompiledLib(root) {
  const distLib = path.join(root, "dist", "lib");
  const files = compiledJavaScriptFiles(distLib);
  const outputs = new Map();
  const globals = new Map();
  const prepared = [];

  for (const sourcePath of files) {
    const relativePath = path.relative(distLib, sourcePath);
    const outputName = flattenedName(relativePath);
    const previousSource = outputs.get(outputName);
    if (previousSource) {
      throw new Error(
        `Duplicate flattened name ${outputName}: ${previousSource} and ${relativePath}`
      );
    }
    outputs.set(outputName, relativePath);

    const content = fs.readFileSync(sourcePath, "utf8");
    for (const name of exportedGlobalNames(content, relativePath)) {
      const previousSource = globals.get(name);
      if (previousSource) {
        throw new Error(
          `Duplicate exported global ${name}: ${previousSource} and ${relativePath}`
        );
      }
      globals.set(name, relativePath);
    }
    prepared.push({
      outputPath: path.join(distLib, outputName),
      content: stripModuleSyntax(content, relativePath),
    });
  }

  for (const { outputPath, content } of prepared) {
    fs.writeFileSync(outputPath, content);
  }

  for (const entry of fs.existsSync(distLib)
    ? fs.readdirSync(distLib, { withFileTypes: true })
    : []) {
    if (entry.isDirectory()) {
      fs.rmSync(path.join(distLib, entry.name), { recursive: true });
    }
  }
}

function build(root = path.join(__dirname, "..")) {
  flattenCompiledLib(root);
  fs.copyFileSync(
    path.join(root, "src", "appsscript.json"),
    path.join(root, "dist", "appsscript.json")
  );
}

if (require.main === module) {
  build();
}

module.exports = { build, flattenCompiledLib };
