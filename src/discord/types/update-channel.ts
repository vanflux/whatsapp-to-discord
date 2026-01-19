
export interface DiscordUpdateChannel {
    guildId: string;
    channelId: string;
    name?: string;
    topic?: string | null;
    parentId?: string | null;
}
