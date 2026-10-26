import crypto from "node:crypto";
import env from "../config/env.ts";

type SessionUser = { id: number; login: string; token: string; exp: number };

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const key = crypto.createHash("sha256").update(env.SESSION_SECRET).digest();

// The whole session (including the user's GitHub token) is encrypted into the cookie,
// so no database is needed and nothing readable is ever stored in the browser.
function sealSession(user: Omit<SessionUser, "exp">): string {
    const payload = JSON.stringify({ ...user, exp: Date.now() + SESSION_TTL_MS });
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function openSession(value: string): SessionUser | null {
    try {
        const buf = Buffer.from(value, "base64url");
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const encrypted = buf.subarray(28);
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
        const session = JSON.parse(json) as SessionUser;
        return session.exp > Date.now() ? session : null;
    } catch {
        return null;
    }
}

export { sealSession, openSession, SESSION_TTL_MS };
export type { SessionUser };
