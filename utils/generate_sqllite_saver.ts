import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

export function generateSqlLiteSaver(path: string): SqliteSaver {
    return SqliteSaver.fromConnString(path);
}