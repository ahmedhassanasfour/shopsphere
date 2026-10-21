import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { AppError, type ErrorDetail } from "../utils/app-error.js";
import { logger } from "../utils/logger.js";

interface FormattedError {
    statusCode: number;
    message: string;
    errors: ErrorDetail[];
    isOperational: boolean;
}

function normalizeError(err: unknown): FormattedError {
    // 1. Reusable AppError instances
    if (err instanceof AppError) {
        return {
            statusCode: err.statusCode,
            message: err.message,
            errors: err.errors,
            isOperational: err.isOperational,
        };
    }

    // 2. Zod validation errors
    if (err instanceof ZodError) {
        const errors: ErrorDetail[] = err.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
        }));

        return {
            statusCode: 400,
            message: "Validation failed",
            errors,
            isOperational: true,
        };
    }

    // 3. Mongoose CastError (e.g. malformed ObjectId)
    if (err instanceof mongoose.Error.CastError || (typeof err === "object" && err !== null && "name" in err && err.name === "CastError")) {
        const castErr = err as mongoose.Error.CastError;
        return {
            statusCode: 400,
            message: `Invalid format for field "${castErr.path}": ${String(castErr.value)}`,
            errors: [
                {
                    field: castErr.path,
                    message: `Invalid format for ${castErr.path}`,
                },
            ],
            isOperational: true,
        };
    }

    // 4. Mongoose ValidationError
    if (err instanceof mongoose.Error.ValidationError || (typeof err === "object" && err !== null && "name" in err && err.name === "ValidationError")) {
        const validationErr = err as mongoose.Error.ValidationError;
        const errors: ErrorDetail[] = Object.values(validationErr.errors).map((item) => ({
            field: item.path,
            message: item.message,
        }));

        return {
            statusCode: 400,
            message: "Validation failed",
            errors,
            isOperational: true,
        };
    }

    // 5. MongoDB Duplicate Key Error (Code 11000)
    if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: unknown }).code === 11000
    ) {
        const mongoErr = err as { keyValue?: Record<string, unknown> };
        const keys = mongoErr.keyValue ? Object.keys(mongoErr.keyValue) : [];
        const field = keys[0] ?? "field";

        return {
            statusCode: 409,
            message: `An account or record with this ${field} already exists`,
            errors: [
                {
                    field,
                    message: `Duplicate value entered for ${field}`,
                },
            ],
            isOperational: true,
        };
    }

    // 6. JWT TokenExpiredError
    if (
        err instanceof jwt.TokenExpiredError ||
        (typeof err === "object" && err !== null && "name" in err && err.name === "TokenExpiredError")
    ) {
        return {
            statusCode: 401,
            message: "Authentication token has expired. Please log in again.",
            errors: [],
            isOperational: true,
        };
    }

    // 7. JWT JsonWebTokenError / NotBeforeError
    if (
        err instanceof jwt.JsonWebTokenError ||
        err instanceof jwt.NotBeforeError ||
        (typeof err === "object" &&
            err !== null &&
            "name" in err &&
            (err.name === "JsonWebTokenError" || err.name === "NotBeforeError"))
    ) {
        return {
            statusCode: 401,
            message: "Invalid authentication token. Authorization denied.",
            errors: [],
            isOperational: true,
        };
    }

    // 8. Body parser invalid JSON SyntaxError
    if (
        err instanceof SyntaxError &&
        "status" in err &&
        (err as { status: unknown }).status === 400 &&
        "body" in err
    ) {
        return {
            statusCode: 400,
            message: "Malformed JSON payload in request body",
            errors: [],
            isOperational: true,
        };
    }

    // 9. Standard Error or unexpected/programming failure
    const isProd = process.env.NODE_ENV === "production";
    const rawMessage = err instanceof Error ? err.message : "Internal server error";

    return {
        statusCode: 500,
        message: isProd ? "Internal server error" : rawMessage,
        errors: [],
        isOperational: false,
    };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    // If response headers have already been sent, delegate to default Express handler
    if (res.headersSent) {
        return next(err);
    }

    const formatted = normalizeError(err);
    const requestId = req.id ?? (typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : undefined);

    // Make sure x-request-id header is present on error responses
    if (requestId && !res.getHeader("x-request-id")) {
        res.setHeader("x-request-id", requestId);
    }

    // Log internal/unexpected errors or 500s with full context and stack
    if (!formatted.isOperational || formatted.statusCode >= 500) {
        logger.error(
            `Unhandled exception on ${req.method} ${req.originalUrl}: ${formatted.message}`,
            err,
            {
                method: req.method,
                url: req.originalUrl,
                ip: req.ip,
                statusCode: formatted.statusCode,
            },
            requestId,
        );
    } else if (formatted.statusCode >= 400) {
        // Operational warning log
        logger.warn(
            `Operational error [${formatted.statusCode}] on ${req.method} ${req.originalUrl}: ${formatted.message}`,
            {
                errors: formatted.errors,
                method: req.method,
                url: req.originalUrl,
            },
            requestId,
        );
    }

    // Strictly adhere to standard API error contract: { status: "error", message: "...", errors: [] }
    res.status(formatted.statusCode).json({
        status: "error",
        message: formatted.message,
        errors: formatted.errors,
    });
};
