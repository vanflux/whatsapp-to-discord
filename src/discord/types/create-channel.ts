import { DiscordChannelType } from "./channel-type";

export interface DiscordCreateChannel {
    guildId: string;
    name: string;
    topic?: string | null;
    parentId?: string | null;
    type: DiscordChannelType;
}
