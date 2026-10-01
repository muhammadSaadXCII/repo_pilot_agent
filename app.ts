import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import env from "./config/env.ts";
import authRoutes from "./routes/auth_routes.ts";
import chatRoutes from "./routes/chat_routes.ts";
import cors from 'cors';

const app = express();


// Render terminates TLS at its proxy, so trust it for secure cookies and correct client info.
app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(cors());

// Render uses this to check the service is up.
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.use("/auth", authRoutes);
app.use("/api", chatRoutes);

// Frontend: public/index.html is served at "/".
app.use(express.static(path.join(import.meta.dirname, "public")));

app.listen(env.PORT, () => {
    console.log(`RepoPilot API listening on port ${env.PORT}`);
});