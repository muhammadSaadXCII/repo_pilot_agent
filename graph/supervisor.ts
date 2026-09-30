import fs from 'fs';
import type { ReactAgent } from "langchain";
import { createDocGenAgent } from "../agents/doc_gen_agent.ts";
import { createCodeSearchAgent } from "../agents/code_search_agent.ts";
import { generateSqlLiteSaver } from "../utils/generate_sqllite_saver.ts";
import { createGithubActivityAgent } from "../agents/github_activity_agent.ts";
import { Annotation, END, interrupt, START, StateGraph } from "@langchain/langgraph";
import { llm } from "../config/llm.ts";
import { generateMarkdownFromDoc } from "../utils/generate_markdown_from_doc.ts";
import routeDecisionSchema from "../schemas/route_decision_schema.ts";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { BaseMessage } from "@langchain/core/messages";
import onBoardingDocSchema from '../schemas/on_boarding_doc_schema.ts';

const checkpointer = generateSqlLiteSaver("./repopilot-checkpoints.db");
type RepoContext = { repoPath: string; owner?: string; repo?: string };

type State = typeof SupervisorState.State;

const SupervisorState = Annotation.Root({
    question: Annotation<string>(),
    answer: Annotation<string>(),
    repoContext: Annotation<RepoContext>(),
    generatedDoc: Annotation<string>(),
    approved: Annotation<boolean>(),
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
        {
            role: "system",
            content: `Classify the user's question into exactly one category:
- docGenNode: user wants generated onboarding documentation or a written guide for the codebase
- githubActivityNode: about GitHub activity — commits, issues, pull requests, who changed what, recent changes
- codeSearchNode: about how the code works, its structure, purpose, logic, functions, classes — including general questions like "what is this codebase" or "what does this project do"
- generalNode: greetings, small talk, or anything unrelated to this specific repository`,
        },
        { role: "user", content: state.question },
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
        { messages: [{ role: "user", content: state.question }] },
        config
    );
    return { answer: lastMessageText(result) };
}

async function githubActivityNode(state: State, config: RunnableConfig) {
    const agent = await getGithubActivityAgent();
    const { owner, repo } = state.repoContext || {};
    const contextPrefix = owner && repo ? `(Repository: ${owner}/${repo}) ` : "";
    const result = await agent.invoke(
        { messages: [{ role: "user", content: contextPrefix + state.question }] },
        config
    );
    return { answer: lastMessageText(result) };
}

async function docGenNode(state: State, config: RunnableConfig) {
    const repoPath = state.repoContext?.repoPath;
    if (!repoPath) {
        return { answer: "I need a local repo path (repoContext.repoPath) to generate docs." };
    }
    const agent = getDocGenAgent(repoPath);
    const result = await agent.invoke(
        { messages: [{ role: "user", content: state.question }] },
        config
    );
    const doc = onBoardingDocSchema.parse(result.structuredResponse);
    return { generatedDoc: generateMarkdownFromDoc(doc) };
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
        {
            role: "system", content: `You are RepoPilot, an AI assistant that helps developers understand and work with the "${repoLabel}" codebase.

You handle general conversation, greetings, and questions that don't fit your specialized capabilities. Your specialized capabilities — handled elsewhere, not by you — are:
- Explaining how the code works, its structure, and logic
- Reporting on GitHub activity: commits, issues, and pull requests
- Generating onboarding documentation for the codebase

If the user's message is a greeting or small talk, respond warmly and briefly mention what you can help with for this repo.
If the user asks something clearly related to code, GitHub activity, or documentation that seems to have been misrouted here, let them know you didn't quite catch that and ask them to rephrase — don't try to answer it yourself without real information.
Keep responses brief — a sentence or two.`
        },
        { role: "human", content: state.question },
    ]);
    return { answer: response.content };
}

const supervisor = new StateGraph(SupervisorState)
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
    .addEdge("docGenNode", "approveDoc")
    .addEdge("approveDoc", "writeDocNode")
    .addEdge("writeDocNode", END)
    .addEdge("generalNode", END)
    .compile({ checkpointer });

export { supervisor };