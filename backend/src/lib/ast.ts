import { parse } from "@typescript-eslint/typescript-estree";
import Parser from "tree-sitter";
// @ts-ignore — tree-sitter-python doesn't ship TS types
import Python from "tree-sitter-python";

export interface ImportEdge {
  source: string;
  importedPath: string;
  isRelative: boolean;
}

const JS_TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const PYTHON_EXTENSIONS = [".py"];

/**
 * Language-aware router: detects file language by extension, dispatches
 * to the right parser, returns the same ImportEdge[] shape regardless
 * of which parser ran — so nothing downstream (Cartographer, Neo4j)
 * needs to know or care which language a file is written in.
 */
export function extractImports(filePath: string, sourceCode: string): ImportEdge[] {
  if (JS_TS_EXTENSIONS.some((ext) => filePath.endsWith(ext))) {
    return extractJsTsImports(filePath, sourceCode);
  }
  if (PYTHON_EXTENSIONS.some((ext) => filePath.endsWith(ext))) {
    return extractPythonImports(filePath, sourceCode);
  }
  return []; // unsupported language — no imports extracted, not an error
}

// ---------- JS/TS parser (unchanged from before) ----------

function extractJsTsImports(filePath: string, sourceCode: string): ImportEdge[] {
  let ast;
  try {
    ast = parse(sourceCode, {
      jsx: filePath.endsWith(".tsx") || filePath.endsWith(".jsx"),
      loc: false,
      range: false,
    });
  } catch (err) {
    console.warn(`[ast] Failed to parse JS/TS ${filePath}, skipping: ${(err as Error).message}`);
    return [];
  }

  const edges: ImportEdge[] = [];

  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") {
      pushEdge(node.source.value as string);
    }
    if (node.type === "ExportNamedDeclaration" && node.source) {
      pushEdge(node.source.value as string);
    }
    if (node.type === "ExportAllDeclaration" && node.source) {
      pushEdge(node.source.value as string);
    }
    if (node.type === "VariableDeclaration") {
      for (const decl of node.declarations) {
        if (
          decl.init?.type === "CallExpression" &&
          decl.init.callee.type === "Identifier" &&
          decl.init.callee.name === "require" &&
          decl.init.arguments[0]?.type === "Literal"
        ) {
          pushEdge(decl.init.arguments[0].value as string);
        }
      }
    }
  }

  function pushEdge(importedPath: string) {
    edges.push({
      source: filePath,
      importedPath,
      isRelative: importedPath.startsWith(".") || importedPath.startsWith("/"),
    });
  }

  return edges;
}

// ---------- Python parser (new, via tree-sitter) ----------

const pythonParser = new Parser();
pythonParser.setLanguage(Python);

function extractPythonImports(filePath: string, sourceCode: string): ImportEdge[] {
  let tree;
  try {
    tree = pythonParser.parse(sourceCode);
  } catch (err) {
    console.warn(`[ast] Failed to parse Python ${filePath}, skipping: ${(err as Error).message}`);
    return [];
  }

  const edges: ImportEdge[] = [];

  function walk(node: Parser.SyntaxNode) {
    if (node.type === "import_statement") {
      // import foo / import foo.bar
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === "dotted_name") {
          edges.push({ source: filePath, importedPath: child.text, isRelative: false });
        }
      }
    }

    if (node.type === "import_from_statement") {
      // from .core import X / from ..utils import Y / from foo.bar import Z
      const relativeImport = findChild(node, "relative_import");

      if (relativeImport) {
        // Relative import: from . / from .core / from ..utils
        const prefix = findChild(relativeImport, "import_prefix");
        const dottedName = findChild(relativeImport, "dotted_name");
        const dots = prefix ? prefix.text.length : 0;
        const moduleName = dottedName ? dottedName.text : "";
        const importedPath = ".".repeat(dots) + moduleName;

        if (importedPath) {
          edges.push({ source: filePath, importedPath, isRelative: true });
        }
      } else {
        // Absolute import: from foo.bar import X
        const dottedName = findChild(node, "dotted_name");
        if (dottedName) {
          edges.push({ source: filePath, importedPath: dottedName.text, isRelative: false });
        }
      }
    }

    // Walk all children to catch nested imports (e.g., inside if/try blocks)
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }

  walk(tree.rootNode);

  // Deduplicate — Python files often import multiple names from the same module
  // (from .core import A, B, C) which our walker sees as one import_from_statement
  // but the above logic only produces one edge per statement, which is correct.
  // However, walking into children can produce duplicates from nested scopes.
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.source}:${e.importedPath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findChild(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}