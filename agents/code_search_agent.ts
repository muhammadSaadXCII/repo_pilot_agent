import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { createAgent } from "langchain";
import { llm } from "../config/llm.ts";
import searchCode from "../tools/code_search_tool.ts";
import requestHumanApproval from "../tools/human_approval_tool.ts";
import type { ClientTool, ServerTool } from "@langchain/core/tools";

function createCodeSearchAgent(repoPath: string, checkpointer: BaseCheckpointSaver) {
    return createAgent({
        model: llm,
        tools: [searchCode(repoPath), requestHumanApproval] as (ClientTool | ServerTool)[],
        systemPrompt: `You answer questions about a codebase's structure and behavior.
Only use the searchCode tool when you actually need to see code to answer accurately — for greetings or general questions, just answer directly.
Always cite which file(s) your answer came from, using the "// From ..." markers in the tool results.
If the question isn't about code, say you only handle code-structure questions.`,
        checkpointer
    });
}

export { createCodeSearchAgent };