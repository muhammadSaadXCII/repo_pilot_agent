import z from "zod";

const humanApprovalSchema = z.object({
    action: z.string().describe("Short description of the action you want to take"),
    details: z.string().describe("Relevant details the human needs to decide"),
});

export default humanApprovalSchema;