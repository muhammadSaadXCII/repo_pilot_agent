import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import humanApprovalSchema from "../schemas/human_approval_schema.ts";

const requestHumanApproval = tool(
    async ({ action, details }) => {
        const decision = interrupt({ action, details });
        return decision?.approved
            ? `Approved. Proceeding with: ${action}`
            : `Rejected by the user. Do not proceed with: ${action}`;
    },
    {
        name: "requestHumanApproval",
        description: "Call this BEFORE any consequential or irreversible action (writing a file, closing an issue, posting a comment). Pauses execution and asks a human to approve or reject.",
        schema: humanApprovalSchema
    }
);

export default requestHumanApproval;