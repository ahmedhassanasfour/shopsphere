import "dotenv/config";
import app from "./app.js";
import { connectDB } from "./config/database.js";

const PORT = Number(process.env.PORT) || 5000;

async function startServer(): Promise<void> {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log(`ShopSphere API running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

void startServer();