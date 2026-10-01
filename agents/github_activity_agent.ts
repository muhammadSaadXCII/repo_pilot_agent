import { llm } from "../config/llm.ts";
import githubMCP from "../config/github.ts";
import { createAgent, type ReactAgent } from "langchain";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import requestHumanApproval from "../tools/human_approval_tool.ts";
import { GITHUB_ACTIVITY_AGENT_PROMPT } from "../utils/prompts.ts";
import type { ClientTool, ServerTool } from "@langchain/core/tools";

let githubActivityAgentPromise: Promise<ReactAgent> | null = null;
function getGithubActivityAgent(checkpointer: BaseCheckpointSaver) {
    if (!githubActivityAgentPromise) {
        githubActivityAgentPromise = createGithubActivityAgent(checkpointer).catch((err) => {
            githubActivityAgentPromise = null;
            throw err;
        });
    }
    return githubActivityAgentPromise;
}

async function createGithubActivityAgent(checkpointer: BaseCheckpointSaver): Promise<ReactAgent> {
    const tools = await githubMCP.getTools();

    return createAgent({
        model: llm,
        tools: [...tools, requestHumanApproval] as (ClientTool | ServerTool)[],
        systemPrompt: GITHUB_ACTIVITY_AGENT_PROMPT,
        checkpointer
    });
}

export { getGithubActivityAgent };