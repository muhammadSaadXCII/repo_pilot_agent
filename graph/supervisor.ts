import fs from 'fs';
import { llm } from "../config/llm.ts";
import type { ReactAgent } from "langchain";
import type { BaseMessage } from "@langchain/core/messages";
import { createDocGenAgent } from "../agents/doc_gen_agent.ts";
import type { RunnableConfig } from "@langchain/core/runnables";
import { generateSqlLiteSaver } from "../utils/sqllite_saver.ts";
import routeDecisionSchema from "../schemas/route_decision_schema.ts";
import { createCodeSearchAgent } from "../agents/code_search_agent.ts";
import { createGithubActivityAgent } from "../agents/github_activity_agent.ts";
import { GENERAL_NODE_PROMPT, ROUTE_DECISION_PROMPT } from '../utils/prompts.ts';
import { Annotation, END, interrupt, START, StateGraph } from "@langchain/langgraph";

const checkpointer = generateSqlLiteSaver("./repopilot-checkpoints.db");

type RepoContext = { repoPath: string; owner: string; repo: string };
type State = typeof supervisorState.State;

const supervisorState = Annotation.Root({
    question: Annotation<string>(),
    answer: Annotation<string>({ reducer: (_, next) => next, default: () => "" }),
    repoContext: Annotation<RepoContext>(),
    generatedDoc: Annotation<string>({ reducer: (_, next) => next, default: () => "" }),
    approved: Annotation<boolean>({ reducer: (_, next) => next, default: () => false }),
});

const codeSearchAgents = new Map<string, ReactAgent>();
const docGenAgents = new Map<string, ReactAgent>();
let githubActivityAgentPromise: Promise<ReactAgent> | null = null;

function getCodeSearchAgent(repoPath: string): ReactAgent {
    let agent = codeSearchAgents.get(repoPath);
    if (!agent) {
        agent = createCodeSearchAgent(repoPath, checkpointer);
        codeSearchAgents.set(repoPath, agent);
    }
    return agent;
}

function getDocGenAgent(repoPath: string): ReactAgent {
    let agent = docGenAgents.get(repoPath);
    if (!agent) {
        agent = createDocGenAgent(repoPath, checkpointer);
        docGenAgents.set(repoPath, agent);
    }
    return agent;
}

function getGithubActivityAgent() {
    if (!githubActivityAgentPromise) {
        githubActivityAgentPromise = createGithubActivityAgent(checkpointer).catch((err) => {
            githubActivityAgentPromise = null;
            throw err;
        });
    }
    return githubActivityAgentPromise;
}

async function routeQuestion(state: State) {
    const structuredLlm = llm.withStructuredOutput(routeDecisionSchema);
    const result = await structuredLlm.invoke([
        { role: "system", content: ROUTE_DECISION_PROMPT },
        { role: "human", content: state.question },
    ]);
    console.log(result.route);

    return result.route;
}

function lastMessageText(result: { messages: BaseMessage[] }): string {
    const content = result.messages.at(-1)?.content;
    return typeof content === "string" ? content : JSON.stringify(content ?? "");
}

async function codeSearchNode(state: State, config: RunnableConfig) {
    const repoPath = state.repoContext?.repoPath;
    if (!repoPath) {
        return { answer: "I need a local repo path (repoContext.repoPath) to search code." };
    }
    const agent = getCodeSearchAgent(repoPath);
    const result = await agent.invoke(
        { messages: [{ role: "human", content: state.question }] },
        config
    );
    return { answer: lastMessageText(result) };
}

async function githubActivityNode(state: State, config: RunnableConfig) {
    const agent = await getGithubActivityAgent();
    const { owner, repo } = state.repoContext || {};
    const contextPrefix = owner && repo ? `(Repository: ${owner}/${repo}) ` : "";
    const result = await agent.invoke(
        { messages: [{ role: "human", content: contextPrefix + state.question }] },
        config
    );
    return { answer: lastMessageText(result) };
}

async function docGenNode(state: State, config: RunnableConfig) {
    const repoPath = state.repoContext?.repoPath;
    if (!repoPath) {
        return { answer: "I need a local repo path (repoContext.repoPath) to generate docs.", generatedDoc: "" };
    }

    const agent = getDocGenAgent(repoPath);
    const result = await agent.invoke(
        { messages: [{ role: "human", content: state.question }] },
        config
    );

    let generatedDoc = lastMessageText(result);

    if (!generatedDoc.trim()) {
        const retry = await agent.invoke(
            { messages: [{ role: "human", content: "Using only the code you already retrieved, write the complete Markdown document now. Do not call any tools." }] },
            config
        );
        generatedDoc = lastMessageText(retry);
    }

    if (!generatedDoc.trim()) {
        return { answer: "Doc generation failed: the agent returned no content.", generatedDoc: "", approved: false };
    }
    return { generatedDoc };
}

function approveDoc(state: State) {
    const decision = interrupt({ preview: state.generatedDoc });
    console.log(decision);

    return { approved: decision.approved };
}

async function writeDocNode(state: State) {
    if (!state.approved) {
        return { answer: "Doc generation cancelled — not approved." };
    }

    const outPath = `./generated-docs/${Date.now()}-onboarding.md`;
    fs.mkdirSync("./generated-docs", { recursive: true });
    fs.writeFileSync(outPath, state.generatedDoc);
    return { answer: `Doc approved and saved to ${outPath}\n\n${state.generatedDoc}` };
}

async function generalNode(state: State) {
    const { owner, repo } = state.repoContext || {};
    const repoLabel = owner && repo ? `${owner}/${repo}` : "the connected repository";

    const response = await llm.invoke([
        { role: "system", content: GENERAL_NODE_PROMPT(repoLabel) },
        { role: "human", content: state.question },
    ]);
    return { answer: response.content };
}

const supervisor = new StateGraph(supervisorState)
    .addNode("codeSearchNode", codeSearchNode)
    .addNode("githubActivityNode", githubActivityNode)
    .addNode("docGenNode", docGenNode)
    .addNode("approveDoc", approveDoc)
    .addNode("writeDocNode", writeDocNode)
    .addNode("generalNode", generalNode)
    .addConditionalEdges(START, routeQuestion, {
        codeSearchNode: "codeSearchNode",
        githubActivityNode: "githubActivityNode",
        docGenNode: "docGenNode",
        generalNode: "generalNode",
    })
    .addEdge("codeSearchNode", END)
    .addEdge("githubActivityNode", END)
    // .addEdge("docGenNode", "approveDoc")
    .addConditionalEdges(
        "docGenNode",
        (s: State) => (s.generatedDoc?.trim() ? "approveDoc" : END),
        { approveDoc: "approveDoc", [END]: END }
    )
    .addEdge("approveDoc", "writeDocNode")
    .addEdge("writeDocNode", END)
    .addEdge("generalNode", END)
    .compile({ checkpointer });

export { supervisor };