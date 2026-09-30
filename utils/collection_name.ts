export function repoNameToCollectionName(repoPath: string) {
    const base = repoPath
        .replace(/[\\/:]/g, "_")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .replace(/^[^a-zA-Z0-9]+/, "")
        .replace(/[^a-zA-Z0-9]+$/, "") || "repo";
    const tail = base.slice(-55).replace(/^[^a-zA-Z0-9]+/, "");
    return `${tail}`;
}