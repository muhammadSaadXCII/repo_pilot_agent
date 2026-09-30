import z from "zod";

const codeSearchSchema = z.object({ query: z.string() });

export default codeSearchSchema;