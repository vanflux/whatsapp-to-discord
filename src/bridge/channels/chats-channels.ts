import EventEmitter from "node:events";
import { Discord } from "../../discord";
import { Whatsapp } from "../../whatsapp";
import { WhatsappMessage } from "../../whatsapp/types/message";
import { DiscordChannelType } from "../../discord/types/channel-type";
import { PersistentChannel } from "./persistent-channel";
import { DiscordChannelNotFoundException } from "../../discord/exceptions/discord-channel-not-found";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { exiftool } from "exiftool-vendored";
import StaticMaps from "staticmaps";
import { FileConverter } from "../../utils/converters/file-converter";
import { DiscordWebhook } from "../../discord/types/webhook";
import { DiscordEmbed, DiscordSendMessage } from "../../discord/types/send-message";
import { WhatsappMessageReceiptEvent } from "../../whatsapp/types/message-receipt-event";
import { Logger } from "pino";

export interface ChatsChannelData {
    chatsDiscordChannelId?: string;
    channels: ChannelData[];
    messageMapping: Record<string, string[]>; // Whatsapp -> Discord[]
}

interface ChannelData {
    discordChannelId: string;
    discordWebhook: DiscordWebhook;
    whatsappChatId: string;
}

const channelName = '💬 Chats 💬';

export class ChatsChannel extends EventEmitter {
    private persistentChannel: PersistentChannel;
    private processing: Record<string, Promise<void>> = {};

    constructor(
        private logger: Logger,
        private discord: Discord,
        private whatsapp: Whatsapp,
        private guildId: string,
        private data: ChatsChannelData,
    ) {
        super();
        this.persistentChannel = new PersistentChannel(this.discord, this.guildId, this.data.chatsDiscordChannelId, () => ({ name: channelName, type: DiscordChannelType.CATEGORY }));
        this.persistentChannel.on('channelCreated', this.handleDiscordChannelCreated.bind(this));
        this.whatsapp.on('message', this.handleMessage.bind(this));
        this.whatsapp.on('messageReceipt', this.handleMessageReceiptEvent.bind(this));
        this.discord.on('channelDelete', this.handleDiscordChannelDelete.bind(this));
    }

    private async handleMessageReceiptEvent(event: WhatsappMessageReceiptEvent) {
        this.logger.info({ event }, 'Message receipt event:');
    }

    private async handleDiscordChannelCreated(channelId: string) {
        this.data.chatsDiscordChannelId = channelId;
        this.emit('dataChanged', this.data);
        for (let i = 0; i < this.data.channels.length; i++) {
            await this.discord.updateChannel({
                guildId: this.guildId,
                channelId: this.data.channels[i].discordChannelId,
                parentId: channelId,
            });
        }
    }

    private handleDiscordChannelDelete(channelId: string) {
        for (let i = 0; i < this.data.channels.length; i++) {
            if (this.data.channels[i].discordChannelId === channelId) {
                this.data.channels.splice(i, 1);
                i--;
            }
        }
        this.emit('dataChanged', this.data);
    }

    private async _handleMessage(message: WhatsappMessage) {
        const existentChannel = this.data.channels.find(item => item.whatsappChatId === message.recipient.chatId);
        let discordChannelId: string;
        let discordWebhook: DiscordWebhook;
        if (!existentChannel) {
            discordChannelId = await this.discord.createChannel({
                guildId: this.guildId,
                name: message.recipient.name?.toLowerCase().replace(/[\s]/g, '-') ?? '<unknown_1>',
                topic: message.recipient.description ?? message.recipient.status,
                parentId: this.data.chatsDiscordChannelId,
                type: DiscordChannelType.TEXT,
            });
            discordWebhook = await this.discord.createWebhook({
                guildId: this.guildId,
                channelId: discordChannelId,
                name: 'W2D Automation Webhook',
                reason: 'Do not delete',
            });
            this.data.channels.push({
                discordChannelId,
                whatsappChatId: message.recipient.chatId,
                discordWebhook,
            });
            this.emit('dataChanged', this.data);
        } else {
            discordChannelId = existentChannel.discordChannelId;
            discordWebhook = existentChannel.discordWebhook;
        }
        try {
            const whatsappMessageId = message.messageId;
            const sendMessage: DiscordSendMessage = { embeds: [], files: [] };
            let canSend = false;
            const text = message.conversation ?? message.extendedTextMessage?.text;
            if (text) {
                sendMessage.content = text;
                canSend = true;
            }
            if (message.imageMessage) {
                const fileFormat = message.imageMessage.mimeType?.split('/')[1].split(';')[0];
                const data = await message.imageMessage.getData();
                sendMessage.content = message.imageMessage.caption;
                sendMessage.files.push({
                    data,
                    filename: `image.${fileFormat ?? 'data'}`,
                });
                canSend = true;
            }
            if (message.audioMessage) {
                const mimeType = message.audioMessage.mimeType;
                const fileFormat = mimeType?.split('/')[1].split(';')[0];
                const rawData = await message.audioMessage.getData();
                const data = await FileConverter.convert(rawData, fileFormat, 'mp3');
                this.logger.info('Converted bytes length: ' + data?.length);
                if (data) {
                    sendMessage.embeds.push({
                        title: '[Audio]',
                        fields: [
                            { name: 'Size', value: `${data.length} bytes`, inline: true },
                            { name: 'Mime', value: mimeType ?? '-', inline: true },
                        ],
                    });
                    sendMessage.files.push({
                        data,
                        filename: 'audio.mp3',
                    });
                    canSend = true;
                }
            }
            if (message.videoMessage) {
                const mimeType = message.videoMessage.mimeType;
                const fileFormat = mimeType?.split('/')[1].split(';')[0];
                const filename = `video.${fileFormat}`;
                const fileSize = message.videoMessage.size;
                const embed: DiscordEmbed = {
                    title: '[Video]',
                    fields: [
                        { name: 'Size', value: `${fileSize?.toString() ?? '-'} bytes`, inline: true },
                        { name: 'Mime', value: mimeType ?? '-', inline: true },
                    ],
                };
                sendMessage.embeds.push(embed);
                if (fileSize != null && fileSize > 8n * 1024n * 1024n) {
                    embed.description = 'Large video received';
                    try {
                        const data = await message.videoMessage.getThumbData();
                        embed.image = { data, filename: 'image.webp' };
                    } catch (exc: unknown) {
                        this.logger.error({ exc }, 'Failed to retrieve video thumbnail, exc:');
                    }
                    canSend = true;
                } else {
                    const data = await message.videoMessage.getData();
                    if (data) {
                        sendMessage.files.push({
                            data,
                            filename,
                        });
                    } else {
                        embed.description = `Failed to receive video`;
                    }
                    canSend = true;
                }
            }
            if (message.locationMessage) {
                const lat = message.locationMessage.lat ?? 0;
                const lng = message.locationMessage.lng ?? 0;
                const zoom = 16;
                const embed: DiscordEmbed = {
                    title: '[Location]',
                    fields: [
                        { name: 'Lat', value: `${lat}`, inline: true },
                        { name: 'Lng', value: `${lng}`, inline: true },
                        { name: 'Maps', value: `https://www.google.com.br/maps/dir//${lat},${lng}/@${lat},${lng},${zoom}z`, inline: false },
                    ]
                };
                sendMessage.embeds.push(embed);
                try {
                    const options = { width: 450, height: 300 };
                    const map = new StaticMaps(options);
                    const center = [lng, lat];
                    map.addMarker({
                    width: 48,
                    height: 48,
                    coord: [lng, lat],
                    img: resolve(__dirname, '../../../assets/images/marker.png'),
                    })
                    await map.render(center, zoom);
                    const mapImageBuf = await map.image.buffer('png');
                    embed.image = {
                        data: mapImageBuf,
                        filename: 'map.png',
                    };
                } catch (exc: unknown) {
                    this.logger.error({ exc }, 'Failed to render staticmap! Exc:');
                    embed.description = 'Failed to render staticmap';
                }
                canSend = true;
            }
            if (message.stickerMessage) {
                const mimeType = message.stickerMessage.mimeType;
                const fileFormat = mimeType?.split('/')[1].split(';')[0];
                const rawData = await message.stickerMessage.getData();
                const dir = mkdtempSync(resolve(tmpdir(), 'w2d'));
                const filename = `sticker.${fileFormat}`;
                if (dir.length > 3) {
                    const path = resolve(dir, filename);
                    if (path.length > 3) {
                        this.logger.debug('Tmp dir: ' + dir + ', path: ' + path);
                        writeFileSync(path, rawData);
                        await exiftool.write(path, { Copyright: 'None' }, { writeArgs: ['-overwrite_original'] });
                        const data = readFileSync(path);
                        unlinkSync(path);
                        rmdirSync(dir);

                        sendMessage.embeds.push({
                            title: '[Sticker]',
                            fields: [
                                { name: 'Size', value: `${data.length} bytes`, inline: true },
                                { name: 'Mime', value: mimeType ?? '-', inline: true },
                            ],
                        });
                        sendMessage.files.push({
                            data,
                            filename: `sticker.${fileFormat}`,
                        });
                        canSend = true;
                    }
                }
            }
            // if (message.reactionMessage) {
            //     const discordMessageIds = this.data.messageMapping[message.reactionMessage.messageId];
            //     const discordMessageId = discordMessageIds[0];
            //     const text = message.reactionMessage.text;
            //     if (discordMessageId) {
            //         if (text?.length) {
            //             await this.discord.reactMessage({
            //                 channelId: discordChannelId,
            //                 messageId: discordMessageId,
            //                 text: '👍',
            //             });
            //         } else {
            //             await this.discord.unreactMessage({
            //                 channelId: discordChannelId,
            //                 messageId: discordMessageId,
            //                 text: '👍',
            //             });
            //         }
            //     }
            // }
            if (message.groupChangeDescriptionMessage) {
                sendMessage.embeds.push({
                    description: `Changed group description to "${message.recipient.description}"`,
                });
                await this.discord.updateChannel({
                    guildId: this.guildId,
                    channelId: discordChannelId,
                    topic: message.recipient.description,
                });
                canSend = true;
            }
            if (canSend) {
                const discordMessageId = await this.discord.sendWebhookMessage({
                    sendMessage,
                    webhook: discordWebhook,
                    avatarUrl: message.sender?.profilePictureUrl,
                    username: message.sender?.name ?? '<unknown_2>',
                });
                if (discordMessageId) {
                    this.data.messageMapping[whatsappMessageId] = [discordMessageId];
                    this.emit('dataChanged', this.data);
                }
            }
        } catch (exc: unknown) {
            if (exc instanceof DiscordChannelNotFoundException) {
                this.handleDiscordChannelDelete(discordChannelId);
                await this._handleMessage(message);
            } else {
                throw exc;
            }
        }
    }

    private async handleMessage(message: WhatsappMessage) {
        this.logger.debug({ message }, "Chats channel, handle message, message:")
        await this.processing[message.recipient.chatId];
        this.processing[message.recipient.chatId] = this._handleMessage(message);
        await this.processing[message.recipient.chatId];
    }

    public async setup() {
        await this.persistentChannel.setup();
    }
}
