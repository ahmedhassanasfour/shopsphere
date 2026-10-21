
import { z } from "zod";

export const registerSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, "Name must be at least 2 characters")
            .max(80, "Name cannot exceed 80 characters"),

        email: z
            .string()
            .trim()
            .toLowerCase()
            .email("Please provide a valid email address")
            .max(254, "Email is too long"),

        password: z
            .string()
            .min(8, "Password must be at least 8 characters")
            .max(72, "Password cannot exceed 72 characters"),

        confirmPassword: z
            .string()
            .min(1, "Please confirm your password"),
    })
    .refine(
        (data) => data.password === data.confirmPassword,
        {
            message: "Passwords do not match",
            path: ["confirmPassword"],
        },
    );

export type RegisterInput = z.infer<typeof registerSchema>;
