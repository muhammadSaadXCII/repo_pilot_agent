import crypto from "node:crypto";
import { Router } from "express";
import env from "../config/env.ts";
import requireAuth from "../middleware/require_auth.ts";
import { sealSession, SESSION_TTL_MS, type SessionUser } from "../utils/session.ts";

const router = Router();
const isProd = env.NODE_ENV === "production";

// public_repo = public repositories only. Change to "repo" if users need private repos.
const SCOPE = "read:user public_repo";

router.get("/github", (_req, res) => {
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("oauth_state", state, { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 10 * 60 * 1000 });

    const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        scope: SCOPE,
        state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.get("/github/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    if (!code || !state || state !== req.cookies?.oauth_state) {
        res.status(400).send("Invalid OAuth state. Please try logging in again.");
        return;
    }
    res.clearCookie("oauth_state");

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
        }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
        res.status(400).send(`GitHub login failed: ${tokenData.error ?? "unknown error"}`);
        return;
    }

    const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/vnd.github+json" },
    });
    if (!userRes.ok) {
        res.status(502).send("Could not fetch your GitHub profile.");
        return;
    }
    const profile = (await userRes.json()) as { id: number; login: string };

    res.cookie("session", sealSession({ id: profile.id, login: profile.login, token: tokenData.access_token }), {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        maxAge: SESSION_TTL_MS,
    });
    res.redirect("/");
});

router.get("/me", requireAuth, (_req, res) => {
    const user = res.locals.user as SessionUser;
    res.json({ id: user.id, login: user.login });
});

router.post("/logout", (_req, res) => {
    res.clearCookie("session");
    res.json({ ok: true });
});

export default router;
