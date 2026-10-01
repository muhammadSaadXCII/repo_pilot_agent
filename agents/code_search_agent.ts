import { llm } from "../config/llm.ts";
import listFiles from "../tools/list_files_tool.ts";
import searchCode from "../tools/code_search_tool.ts";
import { createAgent, type ReactAgent } from "langchain";
import { CODE_SEARCH_AGENT_PROMPT } from "../utils/prompts.ts";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import requestHumanApproval from "../tools/human_approval_tool.ts";
import type { ClientTool, ServerTool } from "@langchain/core/tools";

const codeSearchAgents = new Map<string, ReactAgent>();
function getCodeSearchAgent(repoPath: string, checkpointer: BaseCheckpointSaver): ReactAgent {
    let agent = codeSearchAgents.get(repoPath);
    if (!agent) {
        agent = createCodeSearchAgent(repoPath, checkpointer);
        codeSearchAgents.set(repoPath, agent);
    }
    return agent;
}

function createCodeSearchAgent(repoPath: string, checkpointer: BaseCheckpointSaver) {
    return createAgent({
        model: llm,
        tools: [listFiles(repoPath), searchCode(repoPath), requestHumanApproval] as (ClientTool | ServerTool)[],
        systemPrompt: CODE_SEARCH_AGENT_PROMPT,
        checkpointer
    });
}

export { getCodeSearchAgent };