import z from "zod";

const routeDecisionSchema = z.object({
    route: z.enum(["docGenNode", "githubActivityNode", "codeSearchNode", "generalNode"]),
});

export default routeDecisionSchema;