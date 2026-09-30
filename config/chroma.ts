import { embedding } from "./llm.ts";
import type { Document } from "@langchain/core/documents";
import { Chroma } from "@langchain/community/vectorstores/chroma";

async function loadChromaDB(collectionName: string): Promise<Chroma> {
    return new Chroma(embedding, { collectionName, url: "http://localhost:8000" });
}

async function chromaDBFromDoc(docs: Document[], collectionName: string): Promise<Chroma> {
    return await Chroma.fromDocuments(docs, embedding, {
        collectionName,
        url: "http://localhost:8000",
    });
}

export { loadChromaDB, chromaDBFromDoc };