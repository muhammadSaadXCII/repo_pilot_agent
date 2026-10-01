import type { NextFunction, Request, Response } from "express";
import { openSession } from "../utils/session.ts";

function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const cookie = req.cookies?.session as string | undefined;
    const user = cookie ? openSession(cookie) : null;
    if (!user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }
    res.locals.user = user;
    next();
}

export default requireAuth;
