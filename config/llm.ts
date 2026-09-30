import env from './env.ts';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

const llm: ChatOpenAI = new ChatOpenAI({
    model: env.AI_MODEL,
    configuration: { baseURL: env.OPENROUTER_ENDPOINT },
    apiKey: env.OPENROUTER_API_KEY,
    modelKwargs: { provider: { require_parameters: true } }
});

const embedding: OpenAIEmbeddings = new OpenAIEmbeddings({
    model: env.AI_EMBEDDING_MODEL,
    configuration: { baseURL: env.OPENROUTER_ENDPOINT },
    apiKey: env.OPENROUTER_API_KEY
});

export { llm, embedding };