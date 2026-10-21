export interface ErrorDetail {
    field?: string;
    message: string;
}

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly status: "error";
    public readonly isOperational: boolean;
    public readonly errors: ErrorDetail[];

    constructor(
        message: string,
        statusCode: number = 500,
        errors: ErrorDetail[] = [],
    ) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.status = "error";
        this.isOperational = true;
        this.errors = errors;

        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this, this.constructor);
    }

    static badRequest(message: string, errors: ErrorDetail[] = []): AppError {
        return new AppError(message, 400, errors);
    }

    static unauthorized(message: string = "Authentication required"): AppError {
        return new AppError(message, 401);
    }

    static forbidden(message: string = "Access denied"): AppError {
        return new AppError(message, 403);
    }

    static notFound(message: string = "Resource not found"): AppError {
        return new AppError(message, 404);
    }

    static conflict(message: string = "Resource already exists", errors: ErrorDetail[] = []): AppError {
        return new AppError(message, 409, errors);
    }

    static internal(message: string = "Internal server error"): AppError {
        const error = new AppError(message, 500);
        (error as { isOperational: boolean }).isOperational = false;
        return error;
    }
}
