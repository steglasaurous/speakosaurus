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

        // Get custom intros for this user
        const intros = await this.drizzleService.db
            .select()
            .from(schema.customIntros as any)
            .where(eq(schema.customIntros.twitchUserId, twitchUserId) as any);

        return {
            ...user,
            customIntros: intros,
        };
    }

    async getAllUsers(): Promise<any[]> {
        const users = await this.drizzleService.db
            .select()
            .from(schema.users as any);

        // Get custom intros for all users
        const allIntros = await this.drizzleService.db
            .select()
            .from(schema.customIntros as any);

        // Group intros by twitchUserId
        const introsByUserId = allIntros.reduce((acc, intro) => {
            if (!acc[intro.twitchUserId]) {
                acc[intro.twitchUserId] = [];
            }
            acc[intro.twitchUserId].push(intro);
            return acc;
        }, {} as Record<string, any[]>);

        return users.map(user => ({
            ...user,
            customIntros: introsByUserId[user.twitchUserId] || [],
        }));
    }

    async updateUser(twitchUserId: string, updates: {
        ttsName?: string;
        ttsProviderName?: string;
        ttsVoiceId?: string;
    }): Promise<any> {
        const [updated] = await this.drizzleService.db
            .update(schema.users as any)
            .set(updates)
            .where(eq(schema.users.twitchUserId, twitchUserId) as any)
            .returning();

        if (!updated) {
            return null;
        }

        // Get custom intros for this user
        const intros = await this.drizzleService.db
            .select()
            .from(schema.customIntros as any)
            .where(eq(schema.customIntros.twitchUserId, twitchUserId) as any);

        return {
            ...updated,
            customIntros: intros,
        };
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

        return {
            ...user,
            customIntros: [],
        };
    }

    async addCustomIntro(twitchUserId: string, introText: string): Promise<any> {
        const id = `${twitchUserId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const [intro] = await this.drizzleService.db
            .insert(schema.customIntros as any)
            .values({
                id,
                twitchUserId,
                introText,
            })
            .returning();

        return intro;
    }

    async deleteCustomIntro(introId: string): Promise<void> {
        await this.drizzleService.db
            .delete(schema.customIntros as any)
            .where(eq(schema.customIntros.id, introId) as any);
    }

    async updateCustomIntro(introId: string, introText: string): Promise<any> {
        const [updated] = await this.drizzleService.db
            .update(schema.customIntros as any)
            .set({ introText })
            .where(eq(schema.customIntros.id, introId) as any)
            .returning();

        return updated;
    }

    static ttsFriendlyUsername(username: string): string {
        username = username.replace(/([A-Z])/g, ' $1');
        username = username.replace(/_/g, ' ');

        return username;
    }
}