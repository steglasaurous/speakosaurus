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

}