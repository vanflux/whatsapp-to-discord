import { DiscordChannelType } from "./channel-type";

export interface DiscordChannel {
    channelId: string;
    type?: DiscordChannelType;
    name?: string;
    topic?: string;
    parentId?: string;
}
