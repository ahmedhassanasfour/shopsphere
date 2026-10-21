import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const existingId = req.headers["x-request-id"];
    const requestId =
        typeof existingId === "string" && existingId.trim().length > 0
            ? existingId.trim()
            : randomUUID();

    req.id = requestId;
    res.setHeader("x-request-id", requestId);
    next();
}
