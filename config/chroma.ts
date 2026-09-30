import { embedding } from "./llm.ts";
import type { Document } from "@langchain/core/documents";
import { Chroma } from "@langchain/community/vectorstores/chroma";

const CHROMA_CLIENT = { host: "localhost", port: 8000, ssl: false };

async function loadChromaDB(collectionName: string): Promise<Chroma> {
    return new Chroma(embedding, { collectionName, clientParams: CHROMA_CLIENT });
}

async function chromaDBFromDoc(docs: Document[], collectionName: string): Promise<Chroma> {
    return await Chroma.fromDocuments(docs, embedding, {
        collectionName,
        clientParams: CHROMA_CLIENT,
    });
}

export { loadChromaDB, chromaDBFromDoc };