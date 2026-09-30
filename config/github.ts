import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import env from './env.ts';

const githubMCP: MultiServerMCPClient = new MultiServerMCPClient({
    mcpServers: {
        github: {
            transport: "http",
            url: env.GITHUB_URL,
            headers: {
                Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            },
        },
    },
});

export default githubMCP;