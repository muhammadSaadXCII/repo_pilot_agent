export function buildThreadId(userId: string, owner: string, repo: string): string {
    return `${userId}:${owner}/${repo}`;
}