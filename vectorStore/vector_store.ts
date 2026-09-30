import fs from 'fs';
import type { Document } from "@langchain/core/documents";
import { generateCodeFiles } from '../utils/code_files.ts';
import { chromaDBFromDoc, loadChromaDB } from '../config/chroma.ts';
import type { Chroma } from '@langchain/community/vectorstores/chroma';
import { repoNameToCollectionName } from '../utils/collection_name.ts';
import { RecursiveCharacterTextSplitter } from '@langchain/classic/text_splitter';

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100,
});

async function chunkFiles(filePaths: string[]): Promise<Document[]> {
    const docs: Document[] = [];

    for (const filePath of filePaths) {
        const content = fs.readFileSync(filePath, "utf-8");
        const chunks = await splitter.createDocuments([content], [{ source: filePath }]);
        docs.push(...chunks);
    }
    return docs;
}

async function buildVectorStore(docs: Document[], repoPath: string): Promise<Chroma> {
    const collectionName = repoNameToCollectionName(repoPath);
    const vectorStore = chromaDBFromDoc(docs, collectionName);
    return vectorStore;
}

async function buildVectorStoreFromRepo(repoPath: string): Promise<Chroma> {
    const collectionName = repoNameToCollectionName(repoPath);
    const existing = await loadChromaDB(collectionName);
    const collection = await existing.ensureCollection();
    if ((await collection.count()) > 0) return existing;

    const files = generateCodeFiles(repoPath);
    const docs = await chunkFiles(files);
    return await buildVectorStore(docs, repoPath);
}

export { buildVectorStoreFromRepo };