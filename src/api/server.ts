import "dotenv/config";

import cors from "cors";
import express from "express";
import pulseRouter from "./pulse";
import shiftAgentRouter from "./shift-agent";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());
app.use('/api/pulse', pulseRouter);
app.use('/api/shift-agent', shiftAgentRouter);

app.get("/api/health", (_req, res) => {
  const routes: string[] = [];
  app._router?.stack?.forEach((r: { route?: { path: string; methods: Record<string, boolean> } }) => {
    if (r.route?.path) {
      const methods = Object.keys(r.route.methods).join(",");
      routes.push(`${methods.toUpperCase()} ${r.route.path}`);
    }
  });
  res.json({ ok: true, routes });
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
