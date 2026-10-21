
import bcrypt from "bcryptjs";
import User from "./user.model.js";
import type { RegisterInput } from "./auth.validation.js";
import { AppError } from "../../utils/app-error.js";

export class AuthServiceError extends AppError {
    constructor(
        message: string,
        statusCode: number = 400,
    ) {
        super(message, statusCode);
        this.name = "AuthServiceError";
    }
}


export async function registerUser(input: RegisterInput) {
    const { name, email, password } = input;

    // 1. Check whether the email is already registered
    const existingUser = await User.findOne({ email });

    if (existingUser) {
        throw new AuthServiceError(
            "An account with this email already exists",
            409,
        );
    }

    // 2. Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 12);

    // 3. Create the user without confirmPassword
    try {
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
        });

        // 4. Return only safe user fields
        return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            createdAt: user.createdAt,
        };
    } catch (error: unknown) {
        // Handle duplicate emails even if two requests arrive together
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === 11000
        ) {
            throw new AuthServiceError(
                "An account with this email already exists",
                409,
            );
        }

        throw error;
    }
}
