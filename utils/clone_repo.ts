import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

function isValidRepoName(value: unknown): value is string {
    return typeof value === "string" && value.length <= 100 && NAME_PATTERN.test(value) && value !== "." && value !== "..";
}

// Clones owner/repo into a per-user temp folder and returns its path.
// The token is passed through git's environment config, not the URL or argv,
// so it never ends up in .git/config or the process list.
async function ensureRepoCloned(userId: number, token: string, owner: string, repo: string): Promise<string> {
    const target = path.join(os.tmpdir(), "repopilot-repos", String(userId), `${owner}__${repo}`);
    if (fs.existsSync(path.join(target, ".git"))) return target;

    fs.mkdirSync(path.dirname(target), { recursive: true });
    const basicAuth = Buffer.from(`x-access-token:${token}`).toString("base64");

    await execFileAsync(
        "git",
        ["clone", "--depth", "1", `https://github.com/${owner}/${repo}.git`, target],
        {
            env: {
                ...process.env,
                GIT_TERMINAL_PROMPT: "0",
                GIT_CONFIG_COUNT: "1",
                GIT_CONFIG_KEY_0: "http.extraheader",
                GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basicAuth}`,
            },
            timeout: 120_000,
        }
    );
    return target;
}

export { ensureRepoCloned, isValidRepoName };
