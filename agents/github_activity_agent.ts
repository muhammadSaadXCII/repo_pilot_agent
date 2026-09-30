import { createAgent, type ReactAgent } from "langchain";
import { llm } from "../config/llm.ts";
import githubMCP from "../config/github.ts";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import requestHumanApproval from "../tools/human_approval_tool.ts";
import type { ClientTool, ServerTool } from "@langchain/core/tools";

async function createGithubActivityAgent(checkpointer: BaseCheckpointSaver): Promise<ReactAgent> {
    const tools = await githubMCP.getTools();

    return createAgent({
        model: llm,
        tools: [...tools, requestHumanApproval] as (ClientTool | ServerTool)[],
        systemPrompt: `You answer questions about GitHub repository activity: recent commits, who changed what, open issues, and pull requests.
You are NOT for explaining how code works — only for reporting on repo activity and metadata.
Always ask for or infer the owner/repo from context; if missing, say you need a repo to look at.`,
        checkpointer
    });
}

export { createGithubActivityAgent };