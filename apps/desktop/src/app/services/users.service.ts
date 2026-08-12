import { DrizzleService } from "nestjs-drizzle/sqlite";
import * as schema from "../database/schema";
import { eq, inArray, isNull, or } from "drizzle-orm";
import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { UserEventService } from "./user-event.service";

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(
        private readonly drizzleService: DrizzleService<typeof schema>,
        private readonly userEventService: UserEventService,
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

        // Map intros to ensure proper type structure
        const customIntros = intros.map(intro => ({
            id: intro.id,
            twitchUserId: intro.twitchUserId,
            introText: intro.introText,
        }));

        return {
            twitchUserId: user.twitchUserId,
            twitchUsername: user.twitchUsername,
            ttsName: user.ttsName || undefined,
            ttsProviderName: user.ttsProviderName || undefined,
            ttsVoiceId: user.ttsVoiceId || undefined,
            pronouns: user.pronouns || undefined,
            disableWelcome: user.disableWelcome || undefined,
            customIntros: customIntros,
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

        // Group intros by twitchUserId and map to proper structure
        const introsByUserId = allIntros.reduce((acc, intro) => {
            if (!acc[intro.twitchUserId]) {
                acc[intro.twitchUserId] = [];
            }
            acc[intro.twitchUserId].push({
                id: intro.id,
                twitchUserId: intro.twitchUserId,
                introText: intro.introText,
            });
            return acc;
        }, {} as Record<string, Array<{ id: string; twitchUserId: string; introText: string }>>);

        return users.map(user => ({
            twitchUserId: user.twitchUserId,
            twitchUsername: user.twitchUsername,
            ttsName: user.ttsName || undefined,
            ttsProviderName: user.ttsProviderName || undefined,
            ttsVoiceId: user.ttsVoiceId || undefined,
            pronouns: user.pronouns || undefined,
            disableWelcome: user.disableWelcome || undefined,
            customIntros: introsByUserId[user.twitchUserId] || [],
        }));
    }

    async updateUser(twitchUserId: string, updates: {
        ttsName?: string;
        ttsProviderName?: string;
        ttsVoiceId?: string;
        pronouns?: string | null;
        disableWelcome?: boolean;
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

        // Map intros to ensure proper type structure
        const customIntros = intros.map(intro => ({
            id: intro.id,
            twitchUserId: intro.twitchUserId,
            introText: intro.introText,
        }));

        // Create a plain object to ensure proper serialization
        const user = {
            twitchUserId: updated.twitchUserId,
            twitchUsername: updated.twitchUsername,
            ttsName: updated.ttsName || undefined,
            ttsProviderName: updated.ttsProviderName || undefined,
            ttsVoiceId: updated.ttsVoiceId || undefined,
            pronouns: updated.pronouns || undefined,
            disableWelcome: updated.disableWelcome || undefined,
            customIntros: customIntros,
        };

        // Emit user updated event
        this.userEventService.emitUserUpdated(user);

        return user;
    }

    async createUser(twitchUserId: string, twitchUsername: string): Promise<any> {
        const pronouns = await this.getPronouns(twitchUsername);
        const [user] = await this.drizzleService.db
            .insert(schema.users as any)
            .values({
                twitchUserId,
                twitchUsername,
                ttsName: UsersService.ttsFriendlyUsername(twitchUsername),
                pronouns,
            })
            .returning();

        // Create a plain object to ensure proper serialization
        const userWithIntros = {
            twitchUserId: user.twitchUserId,
            twitchUsername: user.twitchUsername,
            ttsName: user.ttsName || undefined,
            ttsProviderName: user.ttsProviderName || undefined,
            ttsVoiceId: user.ttsVoiceId || undefined,
            pronouns: user.pronouns || undefined,
            disableWelcome: user.disableWelcome || undefined,
            customIntros: [],
        };

        // Emit user created event
        this.userEventService.emitUserCreated(userWithIntros);

        return userWithIntros;
    }

    async populateMissingPronouns(): Promise<{
        checked: number;
        updated: number;
        unchanged: number;
    }> {
        const usersWithoutPronouns = await this.drizzleService.db
            .select()
            .from(schema.users as any)
            .where(
                or(
                    isNull(schema.users.pronouns),
                    eq(schema.users.pronouns, ""),
                ) as any,
            );

        let updated = 0;
        const batchSize = 5;

        for (let index = 0; index < usersWithoutPronouns.length; index += batchSize) {
            const batch = usersWithoutPronouns.slice(index, index + batchSize);
            const results = await Promise.all(
                batch.map(async (user) => {
                    const pronouns = await this.getPronouns(user.twitchUsername);
                    if (!pronouns) {
                        return false;
                    }

                    await this.updateUser(user.twitchUserId, { pronouns });
                    return true;
                }),
            );
            updated += results.filter(Boolean).length;
        }

        const result = {
            checked: usersWithoutPronouns.length,
            updated,
            unchanged: usersWithoutPronouns.length - updated,
        };
        this.logger.log("Finished populating missing user pronouns", result);
        return result;
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

    async searchUsers(query: string): Promise<any[]> {
        if (!query || query.trim() === '') {
            return [];
        }

        // Get all users and filter in memory for simplicity and safety
        // This is fine for typical use cases with reasonable number of users
        const allUsers = await this.drizzleService.db
            .select()
            .from(schema.users as any);

        const searchLower = query.trim().toLowerCase();
        const filteredUsers = allUsers
            .filter(user => 
                user.twitchUsername.toLowerCase().includes(searchLower) ||
                (user.ttsName && user.ttsName.toLowerCase().includes(searchLower))
            )
            .slice(0, 20);

        // Get custom intros for filtered users
        const userIds = filteredUsers.map(u => u.twitchUserId);
        const allIntros = userIds.length > 0
            ? await this.drizzleService.db
                .select()
                .from(schema.customIntros as any)
                .where(inArray(schema.customIntros.twitchUserId, userIds) as any)
            : [];

        // Group intros by twitchUserId and map to proper structure
        const introsByUserId = allIntros.reduce((acc, intro) => {
            if (!acc[intro.twitchUserId]) {
                acc[intro.twitchUserId] = [];
            }
            acc[intro.twitchUserId].push({
                id: intro.id,
                twitchUserId: intro.twitchUserId,
                introText: intro.introText,
            });
            return acc;
        }, {} as Record<string, Array<{ id: string; twitchUserId: string; introText: string }>>);

        return filteredUsers.map(user => ({
            twitchUserId: user.twitchUserId,
            twitchUsername: user.twitchUsername,
            ttsName: user.ttsName || undefined,
            ttsProviderName: user.ttsProviderName || undefined,
            ttsVoiceId: user.ttsVoiceId || undefined,
            pronouns: user.pronouns || undefined,
            disableWelcome: user.disableWelcome || undefined,
            customIntros: introsByUserId[user.twitchUserId] || [],
        }));
    }

    private async getPronouns(twitchUsername: string): Promise<string | undefined> {
        try {
            const response = await axios.get(
                `https://api.pronouns.alejo.io/v1/users/${encodeURIComponent(twitchUsername)}`,
                { timeout: 5000 },
            );

            if (
                response.data &&
                typeof response.data === "object" &&
                typeof response.data.pronoun_id === "string"
            ) {
                return response.data.pronoun_id;
            }
        } catch (error) {
            this.logger.warn(
                `Unable to retrieve pronouns for Twitch user '${twitchUsername}'`,
                error,
            );
        }

        return undefined;
    }

    static ttsFriendlyUsername(username: string): string {
        username = username.replace(/([A-Z])/g, ' $1');
        username = username.replace(/_/g, ' ');

        return username;
    }
}