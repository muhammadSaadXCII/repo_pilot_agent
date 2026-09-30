import { buildVectorStoreFromRepo } from "./vector_store.ts";
import type { VectorStore } from "@langchain/core/vectorstores";

const cache = new Map<string, Promise<VectorStore>>();

function createVectorStore(repoPath: string): Promise<VectorStore> {
    let promise = cache.get(repoPath);
    if (!promise) {
        promise = buildVectorStoreFromRepo(repoPath).catch((err: Error) => {
            cache.delete(repoPath);
            throw err;
        });
        cache.set(repoPath, promise);
    }
    return promise;
}

export default createVectorStore;