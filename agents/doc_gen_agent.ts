import { llm } from "../config/llm.ts";
import searchCode from "../tools/code_search_tool.ts";
import { DOC_GEN_AGENT_PROMPT } from "../utils/prompts.ts";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import requestHumanApproval from "../tools/human_approval_tool.ts";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import onBoardingDocSchema from "../schemas/on_boarding_doc_schema.ts";
import { createAgent, toolStrategy, type ReactAgent } from "langchain";

function createDocGenAgent(repoPath: string, checkpointer: BaseCheckpointSaver): ReactAgent {
    return createAgent({
        model: llm,
        tools: [searchCode(repoPath), requestHumanApproval] as (ClientTool | ServerTool)[],
        systemPrompt: DOC_GEN_AGENT_PROMPT,
        responseFormat: toolStrategy(onBoardingDocSchema),
        checkpointer
    });
}

export { createDocGenAgent };