import fs from "fs";
import path from "path";

const SKIP_DIRS = new Set([
    "node_modules", "generated-docs", "dist", "build", "out", "target", "bin", "obj",
    "vendor", "venv", "env", "__pycache__", "coverage", "chroma-data", "Pods",
    "DerivedData", ".gradle",
]);

const SKIP_FILES = new Set([
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "composer.lock",
    "Cargo.lock", "poetry.lock", "Gemfile.lock", "go.sum", "test.ts",
]);

const MAX_FILE_SIZE = 200 * 1024; // skip huge/generated files (200 KB)

export const CODE_EXTENSIONS = [
    // JavaScript / TypeScript
    ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".vue", ".svelte",
    // Python
    ".py", ".pyi",
    // JVM
    ".java", ".kt", ".kts", ".scala", ".groovy", ".gradle", ".clj",
    // C family
    ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hh", ".cs",
    // Systems / others
    ".go", ".rs", ".swift", ".m", ".mm", ".dart", ".zig",
    // Scripting
    ".rb", ".php", ".pl", ".lua", ".r", ".sh", ".bash", ".ps1", ".bat",
    // Functional
    ".ex", ".exs", ".erl", ".hs", ".ml", ".fs",
    // Web / data / query
    ".html", ".css", ".scss", ".sass", ".less", ".sql", ".graphql", ".proto",
    // Config / docs
    ".json", ".yaml", ".yml", ".toml", ".xml", ".md", ".env.example",
];

// Files with no extension that still matter
const SPECIAL_FILES = new Set(["Dockerfile", "Makefile", "Gemfile", "Rakefile"]);

export function generateCodeFiles(dir: string, exts: string[] = CODE_EXTENSIONS): string[] {
    let results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            results = results.concat(generateCodeFiles(fullPath, exts));
            continue;
        }

        if (SKIP_FILES.has(entry.name) || entry.name.endsWith(".min.js")) continue;

        const matches = exts.includes(path.extname(entry.name).toLowerCase()) || SPECIAL_FILES.has(entry.name);
        if (!matches) continue;

        if (fs.statSync(fullPath).size > MAX_FILE_SIZE) continue;
        results.push(fullPath);
    }
    return results;
}