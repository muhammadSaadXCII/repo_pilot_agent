import { llm } from "../config/llm.ts";
import listFiles from "../tools/list_files_tool.ts";
import searchCode from "../tools/code_search_tool.ts";
import { createAgent, type ReactAgent } from "langchain";
import { DOC_GEN_AGENT_PROMPT } from "../utils/prompts.ts";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import requestHumanApproval from "../tools/human_approval_tool.ts";
import type { ClientTool, ServerTool } from "@langchain/core/tools";

function createDocGenAgent(repoPath: string, checkpointer: BaseCheckpointSaver): ReactAgent {
    return createAgent({
        model: llm,
        tools: [listFiles(repoPath), searchCode(repoPath), requestHumanApproval] as (ClientTool | ServerTool)[],
        systemPrompt: DOC_GEN_AGENT_PROMPT,
        checkpointer
    });
}

export { createDocGenAgent };