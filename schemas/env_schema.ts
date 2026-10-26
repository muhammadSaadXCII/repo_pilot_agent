import z from "zod";

// const envSchema = z.object({
//     AI_MODEL: z.string(),
//     GITHUB_URL: z.string(),
//     PORT: z.coerce.number(),
//     GITHUB_TOKEN: z.string(),
//     TAVILY_API_KEY: z.string(),
//     OPENROUTER_API_KEY: z.string(),
//     AI_EMBEDDING_MODEL: z.string(),
//     OPENROUTER_ENDPOINT: z.string()
// });

const envSchema = z.object({
    AI_MODEL: z.string(),
    GITHUB_URL: z.string(),
    PORT: z.coerce.number(),
    GITHUB_TOKEN: z.string(),
    TAVILY_API_KEY: z.string(),
    OPENROUTER_API_KEY: z.string(),
    AI_EMBEDDING_MODEL: z.string(),
    OPENROUTER_ENDPOINT: z.string(),
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    SESSION_SECRET: z.string().min(32),
    NODE_ENV: z.string().default("development"),
});

export default envSchema;
