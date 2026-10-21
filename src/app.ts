import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { requestIdMiddleware } from "./middlewares/request-id.middleware.js";
import { notFoundMiddleware } from "./middlewares/not-found.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

// 1. Request correlation ID
app.use(requestIdMiddleware);

// 2. Security headers
app.use(helmet());

// 3. CORS
app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        credentials: true,
    }),
);

// 4. Body and cookie parsing
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// 5. System Health Check
app.get("/api/v1/health", (_req, res) => {
    res.status(200).json({
        status: "success",
        message: "ShopSphere API is running",
    });
});

// 6. Centralized 404 for unmatched routes
app.use(notFoundMiddleware);

// 7. Centralized global error handling middleware (Must be last)
app.use(errorHandler);

export default app;