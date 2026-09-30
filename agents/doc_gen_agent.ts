import { llm } from "../config/llm.ts";
import searchCode from "../tools/code_search_tool.ts";
import { createAgent, type ReactAgent } from "langchain";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import requestHumanApproval from "../tools/human_approval_tool.ts";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import onBoardingDocSchema from "../schemas/on_boarding_doc_schema.ts";

function createDocGenAgent(repoPath: string, checkpointer: BaseCheckpointSaver): ReactAgent {
    return createAgent({
        model: llm,
        tools: [searchCode(repoPath), requestHumanApproval] as (ClientTool | ServerTool)[],
        systemPrompt: `You generate onboarding documentation for a codebase.
Use the searchCode tool to gather real details before writing — never invent function or file names.
Structure your answer as a title and a few clear sections (e.g. Overview, Key Files, How It Works).
Base every section on what searchCode actually returned.`,
        responseFormat: onBoardingDocSchema,
        checkpointer
    })
}

export { createDocGenAgent };