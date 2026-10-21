import { z } from "zod";

const envSchema = z.object({
    PORT: z
        .string()
        .optional()
        .default("5000")
        .transform((val) => parseInt(val, 10))
        .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
            message: "PORT must be a valid port number between 1 and 65535",
        }),

    NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),

    MONGODB_URI: z
        .string()
        .min(1, "MONGODB_URI is required to connect to the database"),

    CLIENT_URL: z
        .string()
        .url("CLIENT_URL must be a valid URL")
        .default("http://localhost:3000"),

    JWT_ACCESS_SECRET: z
        .string()
        .min(16, "JWT_ACCESS_SECRET must be at least 16 characters long")
        .optional(),

    JWT_REFRESH_SECRET: z
        .string()
        .min(16, "JWT_REFRESH_SECRET must be at least 16 characters long")
        .optional(),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function getEnv(): Env {
    if (validatedEnv) {
        return validatedEnv;
    }

    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
        const issues = parsed.error.issues.map(
            (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
        );
        console.error("❌ Environment configuration validation failed:\n" + issues.join("\n"));
        throw new Error("Invalid application environment configuration");
    }

    validatedEnv = parsed.data;
    return validatedEnv;
}
