import z from "zod";
import path from "path";
import { tool } from "@langchain/core/tools";
import { generateCodeFiles } from "../utils/code_files.ts";

const listFiles = (repoPath: string) =>
    tool(
        async () =>
            generateCodeFiles(repoPath)
                .map((f) => path.relative(repoPath, f).replace(/\\/g, "/"))
                .sort()
                .join("\n"),
        {
            name: "listFiles",
            description: "Lists every indexed file in the repository as repo-relative paths. Call this first to learn the real project structure and exact file names.",
            schema: z.object({}),
        }
    );

export default listFiles;