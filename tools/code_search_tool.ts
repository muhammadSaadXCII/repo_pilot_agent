import { tool } from "@langchain/core/tools";
import codeSearchSchema from "../schemas/code_search_schema.ts";
import createVectorStore from "../vectorStore/create_vector_store.ts";

const searchCode = (repoPath: string) => {
    return tool(
        async ({ query }) => {
            const vectorStore = await createVectorStore(repoPath);
            const results = await vectorStore.similaritySearch(query, 4);
            return results
                .map((r) => `// From ${r.metadata.source}\n${r.pageContent}`)
                .join("\n\n---\n\n");
        },
        {
            name: "searchCode",
            description: "Semantically search the codebase for relevant code snippets. Use this when you need to see actual code to answer a question about how something works.",
            schema: codeSearchSchema,
        }
    );
}

export default searchCode;