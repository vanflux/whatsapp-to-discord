import { AttachmentBuilder, ChannelType, Client, ColorResolvable, DiscordAPIError, DMChannel, EmbedBuilder, GuildChannel, MessagePayload, NonThreadGuildBasedChannel, REST, TextChannel, VoiceChannel, WebhookClient, WebhookMessageCreateOptions } from "discord.js";
import EventEmitter from "node:events";
import { DiscordChannel } from "./types/channel";
import { DiscordCreateChannel } from "./types/create-channel";
import { convertDiscordChannelType, convertLibDiscordChannelType, DiscordChannelType } from "./types/channel-type";
import { DiscordChannelNotFoundException } from "./exceptions/discord-channel-not-found";
import { DiscordUpdateChannel } from "./types/update-channel";
import { InvalidChannelTypeForCreationException } from "./exceptions/invalid-channel-type-for-creation";
import { DiscordDeleteChannel } from "./types/delete-channel";
import { DiscordCreateWebhook } from "./types/create-webhook";
import { DiscordSendWebhookMessage } from "./types/send-webhook-message";
import { DiscordWebhook } from "./types/webhook";
import { DiscordSendMessage } from "./types/send-message";
import { DiscordReactMessage } from "./types/react-message";
import { Logger } from "pino";

export class Discord extends EventEmitter {
    private initialization: Promise<void>;
    private client = new Client({
        intents: [
            "Guilds",
            "GuildBans",
            "GuildEmojisAndStickers",
            "GuildIntegrations",
            "GuildInvites",
            "GuildMessages",
            "GuildMessageReactions",
            "GuildMessageTyping",
            "GuildScheduledEvents",
            "GuildVoiceStates",
            "GuildWebhooks",
        ],
    });
    private rest = new REST();
    
    constructor(private logger: Logger, private token: string) {
        super();
        this.setMaxListeners(0);
        this.client.on('channelDelete', channel => {
            this.handleChannelDelete(channel);
        });
        this.client.on('channelCreate', channel => {
            this.handleChannelCreate(channel);
        });
        this.client.on('channelUpdate', channel => {
            this.handleChannelUpdate(channel);
        });
        this.rest.setToken(this.token);
        this.initialization = this.connect();
    }

    private async connect() {
        await this.client.login(this.token);
    }

    private handleChannelDelete(channel: DMChannel | NonThreadGuildBasedChannel) {
        this.emit('channelDelete', channel.id);
    }

    private handleChannelCreate(channel: DMChannel | NonThreadGuildBasedChannel) {
        this.emit('channelCreate', channel.id);
    }

    private handleChannelUpdate(channel: DMChannel | NonThreadGuildBasedChannel) {
        this.emit('channelUpdate', channel.id);
    }

    async sendText(channelId: string, text: string) {
        await this.initialization;
        const channel = await this.client.channels.fetch(channelId);
        if (!channel) return;
        if (channel instanceof TextChannel) {
            await channel.send(text);
        }
    }

    async sendMessage(channelId: string, sendMessage: DiscordSendMessage) {
        await this.initialization;
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel) return;
            if (!(channel instanceof TextChannel)) return;
            const files = sendMessage.files.map(item => new AttachmentBuilder(item.data).setName(item.filename));
            const libEmbeds = sendMessage.embeds.map(embed => {
                const libEmbed = new EmbedBuilder();
                if (embed.title) libEmbed.setTitle(embed.title);
                if (embed.description) libEmbed.setDescription(embed.description);
                if (embed.timestamp) libEmbed.setTimestamp(embed.timestamp);
                if (embed.image) {
                    const attachment = new AttachmentBuilder(embed.image.data).setName(embed.image.filename);
                    files.push(attachment);
                    libEmbed.setImage(`attachment://${embed.image.filename}`);
                }
                if (embed.author) libEmbed.setAuthor({ name: embed.author.name, iconURL: embed.author.iconUrl });
                if (embed.color) libEmbed.setColor(embed.color as ColorResolvable);
                for (const field of embed.fields ?? []) {
                    libEmbed.addFields({
                        name: field.name,
                        value: field.value,
                        inline: field.inline,
                    })
                }
                return libEmbed;
            });
            const payload: string | MessagePayload | WebhookMessageCreateOptions = {
                content: sendMessage.content,
                embeds: libEmbeds,
                files,
            };
            this.logger.debug({ payload }, 'Discord send message payload:');
            const message = await channel.send(payload);
            return message.id;
        } catch (exc: unknown) {
            if (exc instanceof DiscordAPIError) {
                if (exc.code === 10003) throw new DiscordChannelNotFoundException('Channel not found, message:' + exc.message + ', code: ' + exc.code);
            }
            throw exc;
        }
    }

    async getChannel(channelId: string) {
        await this.initialization;
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel) return;
            const discordChannel: DiscordChannel = {
                channelId: channel.id,
                name: channel instanceof GuildChannel ? channel.name : undefined,
                topic: channel instanceof TextChannel ? channel.topic ?? undefined : undefined,
                parentId: channel instanceof GuildChannel ? channel.parentId ?? undefined : undefined,
                type: convertLibDiscordChannelType(channel.type),
            };
            return discordChannel;
        } catch (exc: unknown) {
            if (exc instanceof DiscordAPIError) {
                if (exc.code === 10003) return; // Unknown channel
            }
            throw exc;
        }
    }

    async createChannel(input: DiscordCreateChannel) {
        await this.initialization;
        const guild = await this.client.guilds.fetch(input.guildId);
        const type = convertDiscordChannelType(input.type);
        if (
            ChannelType.AnnouncementThread === type ||
            ChannelType.DM === type ||
            ChannelType.GroupDM === type ||
            ChannelType.PublicThread === type ||
            ChannelType.PrivateThread === type
        ) {
            throw new InvalidChannelTypeForCreationException(`Type ${type} is not valid for channel creation`);
        }
        const channel = await guild.channels.create({
            name: input.name,
            topic: input.topic ?? undefined,
            type,
            parent: input.parentId,
        });
        return channel.id;
    }

    async createWebhook(input: DiscordCreateWebhook) {
        await this.initialization;
        const guild = await this.client.guilds.fetch(input.guildId);
        const webhook = await guild.channels.createWebhook({
            channel: input.channelId,
            name: input.name,
            reason: input.reason,
        });
        const discordWebhook: DiscordWebhook = {
            id: webhook.id,
            url: webhook.url,
            token: webhook.token,
        }
        return discordWebhook;
    }

    async updateChannel(input: DiscordUpdateChannel) {
        await this.initialization;
        const guild = await this.client.guilds.fetch(input.guildId);
        const channel = await guild.channels.edit(input.channelId, {
            name: input.name,
            topic: input.topic,
            parent: input.parentId,
        });
        return channel.id;
    }

    async deleteChannel(input: DiscordDeleteChannel) {
        await this.initialization;
        const guild = await this.client.guilds.fetch(input.guildId);
        await guild.channels.delete(input.channelId);
    }

    async sendWebhookMessage(input: DiscordSendWebhookMessage) {
        await this.initialization;
        const client = new WebhookClient({
            id: input.webhook.id,
            token: input.webhook.token,
            url: input.webhook.url,
        });
        try {
            const files = input.sendMessage.files.map(item => new AttachmentBuilder(item.data).setName(item.filename));
            const libEmbeds = input.sendMessage.embeds.map(embed => {
                const libEmbed = new EmbedBuilder();
                if (embed.title) libEmbed.setTitle(embed.title);
                if (embed.description) libEmbed.setDescription(embed.description);
                if (embed.timestamp) libEmbed.setTimestamp(embed.timestamp);
                if (embed.image) {
                    const attachment = new AttachmentBuilder(embed.image.data).setName(embed.image.filename);
                    files.push(attachment);
                    libEmbed.setImage(`attachment://${embed.image.filename}`);
                }
                if (embed.author) libEmbed.setAuthor({ name: embed.author.name, iconURL: embed.author.iconUrl });
                if (embed.color) libEmbed.setColor(embed.color as ColorResolvable);
                for (const field of embed.fields ?? []) {
                    libEmbed.addFields({
                        name: field.name,
                        value: field.value,
                        inline: field.inline,
                    })
                }
                return libEmbed;
            });
            const payload: string | MessagePayload | WebhookMessageCreateOptions = {
                content: input.sendMessage.content,
                embeds: libEmbeds, files,
                avatarURL: input.avatarUrl,
                username: input.username,
            };
            this.logger.debug({ payload }, 'Discord send webhook message payload:');
            const message = await client.send(payload);
            return message.id;
        } catch (exc: unknown) {
            if (exc instanceof DiscordAPIError) {
                if (exc.code === 10003) throw new DiscordChannelNotFoundException('Channel not found, message:' + exc.message + ', code: ' + exc.code);
            }
            throw exc;
        }
    }

    async reactMessage(input: DiscordReactMessage) {
        try {
            const channel = await this.client.channels.fetch(input.channelId);
            if (!channel) return;
            if (!(channel instanceof TextChannel)) return;
            const message = await channel.messages.fetch(input.messageId);
            if (!message) return;
            await message.react(input.text);
        } catch (exc: unknown) {
            if (exc instanceof DiscordAPIError) {
                if (exc.code === 10003) throw new DiscordChannelNotFoundException('Channel not found, message:' + exc.message + ', code: ' + exc.code);
            }
            throw exc;
        }
    }

    async unreactMessage(input: DiscordReactMessage) {
        try {
            const channel = await this.client.channels.fetch(input.channelId);
            if (!channel) return;
            if (!(channel instanceof TextChannel)) return;
            const message = await channel.messages.fetch(input.messageId);
            if (!message) return;
            const reaction = message.reactions.cache.get(input.text);
            const userId = this.client.user?.id;
            if (reaction?.me && userId) await reaction.users.remove(userId);
        } catch (exc: unknown) {
            if (exc instanceof DiscordAPIError) {
                if (exc.code === 10003) throw new DiscordChannelNotFoundException('Channel not found, message:' + exc.message + ', code: ' + exc.code);
            }
            throw exc;
        }
    }
}
