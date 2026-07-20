import { parse } from "@typescript-eslint/typescript-estree";

export interface ImportEdge {
  source: string;       // the file doing the importing
  importedPath: string; // the raw string from the import statement, e.g. "./utils" or "react"
  isRelative: boolean;  // true for "./x" or "../x", false for package imports like "react"
}

/**
 * Parses a single file's raw source into an AST and extracts every
 * import/require target. Returns an empty array (not a throw) on files
 * that fail to parse — a malformed or unusual file shouldn't crash the
 * whole repo analysis, just get skipped with a warning.
 */
export function extractImports(filePath: string, sourceCode: string): ImportEdge[] {
  let ast;
  try {
    ast = parse(sourceCode, {
      jsx: filePath.endsWith(".tsx") || filePath.endsWith(".jsx"),
      loc: false,
      range: false,
    });
  } catch (err) {
    console.warn(`[ast] Failed to parse ${filePath}, skipping: ${(err as Error).message}`);
    return [];
  }

  const edges: ImportEdge[] = [];

  for (const node of ast.body) {
    // ES modules: import x from "./y"; import { x } from "y";
    if (node.type === "ImportDeclaration") {
      pushEdge(node.source.value as string);
    }

    // ES modules: export { x } from "./y";  (re-exports still create a dependency edge)
    if (node.type === "ExportNamedDeclaration" && node.source) {
      pushEdge(node.source.value as string);
    }
    if (node.type === "ExportAllDeclaration" && node.source) {
      pushEdge(node.source.value as string);
    }

    // CommonJS: const x = require("./y");
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