import z from "zod";
import { Router } from "express";
import { Command } from "@langchain/langgraph";
import { supervisor } from "../graph/supervisor.ts";
import requireAuth from "../middleware/require_auth.ts";
import { buildThreadId } from "../utils/thread_id.ts";
import type { SessionUser } from "../utils/session.ts";
import { ensureRepoCloned, isValidRepoName } from "../utils/clone_repo.ts";

const router = Router();
router.use(requireAuth);

const repoField = z.string().refine(isValidRepoName, "Invalid name");
const chatBody = z.object({ owner: repoField, repo: repoField, question: z.string().trim().min(1).max(4000) });
const resumeBody = z.object({ owner: repoField, repo: repoField, approved: z.boolean() });

type InterruptPayload = { preview?: string; action?: string; details?: string };
type SupervisorResponse = Awaited<ReturnType<typeof supervisor.invoke>> & {
    __interrupt__?: { value: InterruptPayload }[];
};

function toPayload(response: SupervisorResponse) {
    const interrupts = response.__interrupt__;
    if (interrupts?.length) {
        return { status: "interrupt", interrupt: interrupts[0]!.value };
    }
    return { status: "done", answer: response.answer };
}

function threadConfig(user: SessionUser, owner: string, repo: string) {
    return {
        configurable: { thread_id: buildThreadId(String(user.id), owner, repo) },
        recursionLimit: 50,
    };
}

router.post("/chat", async (req, res) => {
    const parsed = chatBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
        return;
    }
    const { owner, repo, question } = parsed.data;
    const user = res.locals.user as SessionUser;

    try {
        const repoPath = await ensureRepoCloned(user.id, user.token, owner, repo);
        const response = await supervisor.invoke(
            { question, repoContext: { repoPath, owner, repo }, answer: "", generatedDoc: "", approved: false },
            threadConfig(user, owner, repo)
        );
        res.json(toPayload(response as SupervisorResponse));
    } catch (err) {
        console.error("chat error:", err);
        res.status(500).json({ error: "Something went wrong while answering. Check that the repo exists and is accessible." });
    }
});

// Called after a response with status "interrupt" to approve or reject the pending action.
router.post("/chat/resume", async (req, res) => {
    const parsed = resumeBody.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
        return;
    }
    const { owner, repo, approved } = parsed.data;
    const user = res.locals.user as SessionUser;

    try {
        const response = await supervisor.invoke(
            new Command({ resume: { approved } }),
            threadConfig(user, owner, repo)
        );
        res.json(toPayload(response as SupervisorResponse));
    } catch (err) {
        console.error("resume error:", err);
        res.status(500).json({ error: "Could not resume the request." });
    }
});

export default router;
