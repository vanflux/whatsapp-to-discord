import { ChannelType } from "discord.js";

export enum DiscordChannelType {
    ANNOUNCEMENT_THREAD = 'ANNOUNCEMENT_THREAD',
    DM = 'DM',
    GROUP_DM = 'GROUP_DM',
    ANNOUNCEMENT = 'ANNOUNCEMENT',
    CATEGORY = 'CATEGORY',
    DIRECTORY = 'DIRECTORY',
    FORUM = 'FORUM',
    MEDIA = 'MEDIA',
    STAGE_VOICE = 'STAGE_VOICE',
    TEXT = 'TEXT',
    VOICE = 'VOICE',
    PRIVATE_THREAD = 'PRIVATE_THREAD',
    PUBLIC_THREAD = 'PUBLIC_THREAD',
}

export function convertLibDiscordChannelType(type: ChannelType) {
    if (type === ChannelType.AnnouncementThread) return DiscordChannelType.ANNOUNCEMENT_THREAD;
    if (type === ChannelType.DM) return DiscordChannelType.DM;
    if (type === ChannelType.GroupDM) return DiscordChannelType.GROUP_DM;
    if (type === ChannelType.GuildAnnouncement) return DiscordChannelType.ANNOUNCEMENT;
    if (type === ChannelType.GuildCategory) return DiscordChannelType.CATEGORY;
    if (type === ChannelType.GuildDirectory) return DiscordChannelType.DIRECTORY;
    if (type === ChannelType.GuildForum) return DiscordChannelType.FORUM;
    if (type === ChannelType.GuildMedia) return DiscordChannelType.MEDIA;
    if (type === ChannelType.GuildStageVoice) return DiscordChannelType.STAGE_VOICE;
    if (type === ChannelType.GuildText) return DiscordChannelType.TEXT;
    if (type === ChannelType.GuildVoice) return DiscordChannelType.VOICE;
    if (type === ChannelType.PrivateThread) return DiscordChannelType.PRIVATE_THREAD;
    if (type === ChannelType.PublicThread) return DiscordChannelType.PUBLIC_THREAD;
}

export function convertDiscordChannelType(type: DiscordChannelType) {
    if (type === DiscordChannelType.ANNOUNCEMENT_THREAD) return ChannelType.AnnouncementThread;
    if (type === DiscordChannelType.DM) return ChannelType.DM;
    if (type === DiscordChannelType.GROUP_DM) return ChannelType.GroupDM;
    if (type === DiscordChannelType.ANNOUNCEMENT) return ChannelType.GuildAnnouncement;
    if (type === DiscordChannelType.CATEGORY) return ChannelType.GuildCategory;
    if (type === DiscordChannelType.DIRECTORY) return ChannelType.GuildDirectory;
    if (type === DiscordChannelType.FORUM) return ChannelType.GuildForum;
    if (type === DiscordChannelType.MEDIA) return ChannelType.GuildMedia;
    if (type === DiscordChannelType.STAGE_VOICE) return ChannelType.GuildStageVoice;
    if (type === DiscordChannelType.TEXT) return ChannelType.GuildText;
    if (type === DiscordChannelType.VOICE) return ChannelType.GuildVoice;
    if (type === DiscordChannelType.PRIVATE_THREAD) return ChannelType.PrivateThread;
    if (type === DiscordChannelType.PUBLIC_THREAD) return ChannelType.PublicThread;
}
