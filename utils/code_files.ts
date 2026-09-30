import fs from "fs";
import path from "path";

export function generateCodeFiles(dir: string, exts = [".js", ".ts", ".jsx", ".tsx"]) {
    let results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(generateCodeFiles(fullPath, exts));
        } else if (exts.includes(path.extname(entry.name))) {
            results.push(fullPath);
        }
    }
    return results;
}