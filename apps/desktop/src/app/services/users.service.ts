import { DrizzleService } from "nestjs-drizzle/sqlite";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";
import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersService {
    constructor(
        private readonly drizzleService: DrizzleService<typeof schema>,
    ) {}

    async getUser(twitchUserId: string): Promise<any> {
        const [user] = await this.drizzleService.db
            .select()
            .from(schema.users as any)
            .where(eq(schema.users.twitchUserId, twitchUserId) as any)
            .limit(1);

        if (!user) {
            return null;
        }

        return user;
    }

    async createUser(twitchUserId: string, twitchUsername: string): Promise<any> {
        const [user] = await this.drizzleService.db
            .insert(schema.users as any)
            .values({
                twitchUserId,
                twitchUsername,
                ttsName: UsersService.ttsFriendlyUsername(twitchUsername),
            })
            .returning();

        return user;
    }

    static ttsFriendlyUsername(username: string): string {
        username = username.replace(/([A-Z])/g, ' $1');
        username = username.replace(/_/g, ' ');

        return username;
    }
}