const SENSITIVE_KEYS = new Set([
    "password",
    "confirmpassword",
    "token",
    "accesstoken",
    "refreshtoken",
    "authorization",
    "cookie",
    "secret",
    "jwt_access_secret",
    "jwt_refresh_secret",
    "mongodb_uri",
]);

function sanitizeValue(key: string, value: unknown): unknown {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        return "[REDACTED]";
    }

    if (Array.isArray(value)) {
        return value.map((item) => (typeof item === "object" && item !== null ? sanitizeObject(item) : item));
    }

    if (typeof value === "object" && value !== null) {
        return sanitizeObject(value as Record<string, unknown>);
    }

    return value;
}

export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeValue(key, value);
    }

    return sanitized;
}

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogPayload {
    level: LogLevel;
    message: string;
    timestamp: string;
    requestId?: string;
    context?: Record<string, unknown>;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
}

function writeLog(payload: LogPayload): void {
    const isProduction = process.env.NODE_ENV === "production";
    const line = JSON.stringify(payload);

    if (payload.level === "error") {
        console.error(line);
    } else if (payload.level === "warn") {
        console.warn(line);
    } else if (payload.level === "debug") {
        if (!isProduction) {
            console.debug(line);
        }
    } else {
        console.log(line);
    }
}

export const logger = {
    info(message: string, context?: Record<string, unknown>, requestId?: string): void {
        writeLog({
            level: "info",
            message,
            timestamp: new Date().toISOString(),
            ...(requestId ? { requestId } : {}),
            ...(context ? { context: sanitizeObject(context) } : {}),
        });
    },

    warn(message: string, context?: Record<string, unknown>, requestId?: string): void {
        writeLog({
            level: "warn",
            message,
            timestamp: new Date().toISOString(),
            ...(requestId ? { requestId } : {}),
            ...(context ? { context: sanitizeObject(context) } : {}),
        });
    },

    error(
        message: string,
        err?: unknown,
        context?: Record<string, unknown>,
        requestId?: string,
    ): void {
        const errorDetails =
            err instanceof Error
                ? {
                      name: err.name,
                      message: err.message,
                      ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
                  }
                : undefined;

        writeLog({
            level: "error",
            message,
            timestamp: new Date().toISOString(),
            ...(requestId ? { requestId } : {}),
            ...(context ? { context: sanitizeObject(context) } : {}),
            ...(errorDetails ? { error: errorDetails } : {}),
        });
    },

    debug(message: string, context?: Record<string, unknown>, requestId?: string): void {
        writeLog({
            level: "debug",
            message,
            timestamp: new Date().toISOString(),
            ...(requestId ? { requestId } : {}),
            ...(context ? { context: sanitizeObject(context) } : {}),
        });
    },
};
