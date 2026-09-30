import { llm } from "../config/llm.ts";
import { createAgent } from "langchain";
import searchCode from "../tools/code_search_tool.ts";
import { CODE_SEARCH_AGENT_PROMPT } from "../utils/prompts.ts";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import requestHumanApproval from "../tools/human_approval_tool.ts";
import type { ClientTool, ServerTool } from "@langchain/core/tools";

function createCodeSearchAgent(repoPath: string, checkpointer: BaseCheckpointSaver) {
    return createAgent({
        model: llm,
        tools: [searchCode(repoPath), requestHumanApproval] as (ClientTool | ServerTool)[],
        systemPrompt: CODE_SEARCH_AGENT_PROMPT,
        checkpointer
    });
}

export { createCodeSearchAgent };