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

// Lists the signed-in user's own public repositories for the dropdown.
router.get("/repos", async (_req, res) => {
    const user = res.locals.user as SessionUser;
    try {
        const repos: { name: string; description: string | null }[] = [];
        for (let page = 1; page <= 3; page++) {
            const ghRes = await fetch(
                `https://api.github.com/user/repos?visibility=public&affiliation=owner&sort=updated&per_page=100&page=${page}`,
                { headers: { Authorization: `Bearer ${user.token}`, Accept: "application/vnd.github+json" } }
            );
            if (ghRes.status === 401) {
                res.clearCookie("session");
                res.status(401).json({ error: "GitHub rejected your session. Sign in again." });
                return;
            }
            if (!ghRes.ok) throw new Error(`GitHub responded with ${ghRes.status}`);
            const batch = (await ghRes.json()) as { name: string; description: string | null }[];
            repos.push(...batch.map((r) => ({ name: r.name, description: r.description })));
            if (batch.length < 100) break;
        }
        res.json({ owner: user.login, repos });
    } catch (err) {
        console.error("repos error:", err);
        res.status(502).json({ error: "Could not load your repositories from GitHub." });
    }
});

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