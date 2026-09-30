import 'dotenv/config';
import readline from 'readline';
import { Command } from '@langchain/langgraph';
import { buildThreadId } from './utils/thread_id.ts';
import { supervisor } from './graph/supervisor.ts';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
    return new Promise<string>((resolve) => rl.question(question, resolve));
}

type InterruptPayload = { preview?: string; action?: string; details?: string };
type SupervisorResponse = Awaited<ReturnType<typeof supervisor.invoke>> & {
    __interrupt__?: { value: InterruptPayload }[];
};

const repoContext = {
    repoPath: import.meta.dirname,
    owner: "muhammadSaadXCII",
    repo: "repo_pilot_agent",
};
const config = {
    configurable: { thread_id: buildThreadId('localdev', repoContext.owner, repoContext.repo) },
    recursionLimit: 50
};

async function main() {
    rl.question("You: ", async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
            main();
            return;
        }

        if (["e", "exit", "q", "quit"].includes(trimmed.toLowerCase())) {
            rl.close();
            return;
        }

        try {
            const response = await supervisor.invoke(
                { question: trimmed, repoContext, answer: "", generatedDoc: "", approved: false },
                config
            );
            await handleInterrupt(response);
        } catch (err) {
            console.error("Error:", err);
        }
        
        main();
    });
}

async function handleInterrupt(response: SupervisorResponse): Promise<void> {
    const interrupts = response.__interrupt__;
    if (interrupts?.length) {
        const payload = interrupts[0]!.value;

        if (payload.preview) {
            console.log("\n--- DOC PREVIEW ---\n");
            console.log(payload.preview);
            console.log("\n-------------------\n");
        } else if (payload.action) {
            console.log(`\n--- AGENT IS REQUESTING APPROVAL ---`);
            console.log(`Action: ${payload.action}`);
            console.log(`Details: ${payload.details}`);
            console.log("-------------------------------------\n");
        }

        const answer = await ask("Approve? (y/n): ");
        const approved = answer.trim().toLowerCase() === "y";

        const resumed = await supervisor.invoke(new Command({ resume: { approved } }), config);
        await handleInterrupt(resumed);
        return;
    }

    console.log(`\n🤖: ${response.answer}\n`);
    // for await (const [messageChunk] of response) {
    //     if (messageChunk.content) process.stdout.write(messageChunk.content);
    // }
}

main();