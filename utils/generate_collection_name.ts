export function repoNameToCollectionName(repoPath: string) {
    return repoPath
        .replace(/[\\/:]/g, "_")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 63)
        .replace(/^[^a-zA-Z0-9]+/, "")
        .replace(/[^a-zA-Z0-9]+$/, "") || "repo";
}