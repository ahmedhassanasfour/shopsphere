import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { z, ZodError } from "zod";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import app from "../src/app.js";
import { AppError } from "../src/utils/app-error.js";
import { requestIdMiddleware } from "../src/middlewares/request-id.middleware.js";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";

describe("ShopSphere Error Handling & Middleware Foundation", () => {
    let mainServer: Server;
    let mainBaseUrl: string;

    before(() => {
        return new Promise<void>((resolve) => {
            mainServer = app.listen(0, "127.0.0.1", () => {
                const port = (mainServer.address() as AddressInfo).port;
                mainBaseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(() => {
        return new Promise<void>((resolve) => {
            mainServer.close(() => resolve());
        });
    });

    describe("1. Health Endpoint & Correlation ID", () => {
        it("GET /api/v1/health returns 200 with success status", async () => {
            const res = await fetch(`${mainBaseUrl}/api/v1/health`);
            const data = (await res.json()) as { status: string; message: string };

            assert.equal(res.status, 200);
            assert.equal(data.status, "success");
            assert.equal(data.message, "ShopSphere API is running");
        });

        it("assigns and returns x-request-id header when none is provided", async () => {
            const res = await fetch(`${mainBaseUrl}/api/v1/health`);
            const requestId = res.headers.get("x-request-id");

            assert.ok(requestId, "x-request-id should be present");
            assert.match(
                requestId,
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
                "x-request-id should be a valid UUID",
            );
        });

        it("preserves incoming x-request-id header", async () => {
            const customId = "custom-test-trace-12345";
            const res = await fetch(`${mainBaseUrl}/api/v1/health`, {
                headers: { "x-request-id": customId },
            });
            const requestId = res.headers.get("x-request-id");

            assert.equal(requestId, customId);
        });
    });

    describe("2. Unmatched Route 404 Handler", () => {
        it("returns 404 with standardized JSON error response for unknown route", async () => {
            const res = await fetch(`${mainBaseUrl}/api/v1/unknown-endpoint`);
            const data = (await res.json()) as {
                status: string;
                message: string;
                errors: unknown[];
            };

            assert.equal(res.status, 404);
            assert.equal(data.status, "error");
            assert.equal(data.message, "Route GET /api/v1/unknown-endpoint not found");
            assert.deepEqual(data.errors, []);
            assert.ok(res.headers.get("x-request-id"), "Error response must include correlation ID");
        });
    });

    describe("3. Malformed JSON Body Parsing", () => {
        it("returns 400 with standardized error when body is invalid JSON", async () => {
            const res = await fetch(`${mainBaseUrl}/api/v1/health`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "invalid-json{not-json",
            });
            const data = (await res.json()) as {
                status: string;
                message: string;
                errors: unknown[];
            };

            assert.equal(res.status, 400);
            assert.equal(data.status, "error");
            assert.equal(data.message, "Malformed JSON payload in request body");
            assert.deepEqual(data.errors, []);
        });
    });

    describe("4. Error Transformation Suite (Simulated Scenarios)", () => {
        let testServer: Server;
        let testBaseUrl: string;

        before(() => {
            const testApp = express();
            testApp.use(requestIdMiddleware);
            testApp.use(express.json());

            // Route throwing AppError
            testApp.get("/test/app-error", () => {
                throw new AppError("Invalid credentials provided", 401);
            });

            // Route throwing Zod validation error
            testApp.post("/test/zod-error", (req) => {
                const schema = z.object({
                    email: z.string().email("Invalid email format"),
                    age: z.number().min(18, "Must be at least 18"),
                });
                schema.parse(req.body);
            });

            // Route throwing MongoDB duplicate key error (code 11000)
            testApp.get("/test/duplicate-key", () => {
                const err = new Error("E11000 duplicate key error") as Error & {
                    code: number;
                    keyValue: Record<string, unknown>;
                };
                err.code = 11000;
                err.keyValue = { email: "test@example.com" };
                throw err;
            });

            // Route throwing Mongoose CastError
            testApp.get("/test/cast-error", () => {
                const castErr = new mongoose.Error.CastError("ObjectId", "invalid-id-xyz", "userId");
                throw castErr;
            });

            // Route throwing Mongoose ValidationError
            testApp.get("/test/mongoose-validation", () => {
                const valErr = new mongoose.Error.ValidationError();
                valErr.addError(
                    "price",
                    new mongoose.Error.ValidatorError({
                        message: "Price must be positive",
                        path: "price",
                        value: -10,
                    }),
                );
                throw valErr;
            });

            // Route throwing JWT TokenExpiredError
            testApp.get("/test/jwt-expired", () => {
                throw new jwt.TokenExpiredError("jwt expired", new Date());
            });

            // Route throwing JWT JsonWebTokenError
            testApp.get("/test/jwt-invalid", () => {
                throw new jwt.JsonWebTokenError("invalid signature");
            });

            // Route with async rejected promise (Express 5 async handling)
            testApp.get("/test/async-rejection", async () => {
                await Promise.resolve();
                throw new AppError("Async operational error", 403);
            });

            testApp.use(notFoundMiddleware);
            testApp.use(errorHandler);

            return new Promise<void>((resolve) => {
                testServer = testApp.listen(0, "127.0.0.1", () => {
                    const port = (testServer.address() as AddressInfo).port;
                    testBaseUrl = `http://127.0.0.1:${port}`;
                    resolve();
                });
            });
        });

        after(() => {
            return new Promise<void>((resolve) => {
                testServer.close(() => resolve());
            });
        });

        it("handles AppError with exact status code and message", async () => {
            const res = await fetch(`${testBaseUrl}/test/app-error`);
            const data = (await res.json()) as {
                status: string;
                message: string;
                errors: unknown[];
            };

            assert.equal(res.status, 401);
            assert.equal(data.status, "error");
            assert.equal(data.message, "Invalid credentials provided");
            assert.deepEqual(data.errors, []);
        });

        it("handles ZodError with 400 and structured field-level errors", async () => {
            const res = await fetch(`${testBaseUrl}/test/zod-error`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: "invalid-email", age: 16 }),
            });
            const data = (await res.json()) as {
                status: string;
                message: string;
                errors: Array<{ field: string; message: string }>;
            };

            assert.equal(res.status, 400);
            assert.equal(data.status, "error");
            assert.equal(data.message, "Validation failed");
            assert.equal(data.errors.length, 2);

            const emailErr = data.errors.find((e) => e.field === "email");
            const ageErr = data.errors.find((e) => e.field === "age");
            assert.ok(emailErr && emailErr.message.includes("Invalid email"));
            assert.ok(ageErr && ageErr.message.includes("Must be at least 18"));
        });

        it("handles MongoDB duplicate key (11000) with 409 Conflict", async () => {
            const res = await fetch(`${testBaseUrl}/test/duplicate-key`);
            const data = (await res.json()) as {
                status: string;
                message: string;
                errors: Array<{ field: string; message: string }>;
            };

            assert.equal(res.status, 409);
            assert.equal(data.status, "error");
            assert.ok(data.message.includes("email already exists"));
            assert.equal(data.errors[0]?.field, "email");
        });

        it("handles Mongoose CastError with 400 and field indicator", async () => {
            const res = await fetch(`${testBaseUrl}/test/cast-error`);
            const data = (await res.json()) as {
                status: string;
                message: string;
                errors: Array<{ field: string; message: string }>;
            };

            assert.equal(res.status, 400);
            assert.equal(data.status, "error");
            assert.ok(data.message.includes("userId"));
            assert.equal(data.errors[0]?.field, "userId");
        });

        it("handles Mongoose ValidationError with 400 and mapped fields", async () => {
            const res = await fetch(`${testBaseUrl}/test/mongoose-validation`);
            const data = (await res.json()) as {
                status: string;
                message: string;
                errors: Array<{ field: string; message: string }>;
            };

            assert.equal(res.status, 400);
            assert.equal(data.status, "error");
            assert.equal(data.message, "Validation failed");
            assert.equal(data.errors[0]?.field, "price");
            assert.ok(data.errors[0]?.message.includes("positive"));
        });

        it("handles JWT TokenExpiredError with 401 Unauthorized", async () => {
            const res = await fetch(`${testBaseUrl}/test/jwt-expired`);
            const data = (await res.json()) as { status: string; message: string };

            assert.equal(res.status, 401);
            assert.equal(data.status, "error");
            assert.ok(data.message.toLowerCase().includes("expired"));
        });

        it("handles JWT JsonWebTokenError with 401 Unauthorized", async () => {
            const res = await fetch(`${testBaseUrl}/test/jwt-invalid`);
            const data = (await res.json()) as { status: string; message: string };

            assert.equal(res.status, 401);
            assert.equal(data.status, "error");
            assert.ok(data.message.toLowerCase().includes("invalid"));
        });

        it("Express 5 natively forwards async promise rejections to the error handler", async () => {
            const res = await fetch(`${testBaseUrl}/test/async-rejection`);
            const data = (await res.json()) as { status: string; message: string };

            assert.equal(res.status, 403);
            assert.equal(data.status, "error");
            assert.equal(data.message, "Async operational error");
        });
    });

    describe("5. Production Information Concealment", () => {
        let prodServer: Server;
        let prodBaseUrl: string;
        const originalEnv = process.env.NODE_ENV;

        before(() => {
            process.env.NODE_ENV = "production";
            const prodApp = express();
            prodApp.use(requestIdMiddleware);

            // Buggy route that throws an unhandled internal exception
            prodApp.get("/test/unexpected-crash", () => {
                throw new Error("Sensitive database connection password: SECRET_DB_PASSWORD");
            });

            prodApp.use(errorHandler);

            return new Promise<void>((resolve) => {
                prodServer = prodApp.listen(0, "127.0.0.1", () => {
                    const port = (prodServer.address() as AddressInfo).port;
                    prodBaseUrl = `http://127.0.0.1:${port}`;
                    resolve();
                });
            });
        });

        after(() => {
            process.env.NODE_ENV = originalEnv;
            return new Promise<void>((resolve) => {
                prodServer.close(() => resolve());
            });
        });

        it("suppresses internal error message and stack trace in production mode", async () => {
            const res = await fetch(`${prodBaseUrl}/test/unexpected-crash`);
            const data = (await res.json()) as {
                status: string;
                message: string;
                errors: unknown[];
                stack?: unknown;
            };

            assert.equal(res.status, 500);
            assert.equal(data.status, "error");
            assert.equal(data.message, "Internal server error");
            assert.equal(data.stack, undefined);
            assert.ok(!JSON.stringify(data).includes("SECRET_DB_PASSWORD"));
        });
    });
});
