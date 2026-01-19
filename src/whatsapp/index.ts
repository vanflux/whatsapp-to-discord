import makeWASocket, { Browsers, Chat, ConnectionState, Contact, DisconnectReason, downloadContentFromMessage, jidNormalizedUser, MessageUpsertType, MessageUserReceiptUpdate, proto, useMultiFileAuthState, WAMessage } from "@whiskeysockets/baileys";
import { isBoom } from '@hapi/boom';
import EventEmitter from "node:events";
import { resolve } from "node:path";
import { assignDefined } from "../utils/assign-defined";
import { ChatInfos } from "./types/chat-infos";
import { WhatsappAudioMessage, WhatsappExtendedTextMessage, WhatsappGroupChangeDescriptionMessage, WhatsappImageMessage, WhatsappLocationMessage, WhatsappMessage, WhatsappReactionMessage, WhatsappStickerMessage, WhatsappVideoMessage } from "./types/message";
import { Storage } from "../utils/storage";
import { WhatsappMessageReceiptEvent } from "./types/message-receipt-event";
import pino, { Logger } from "pino";

export class Whatsapp extends EventEmitter {
    private initialization: Promise<void>;
    private sock!: ReturnType<typeof makeWASocket>;
    private chatsStorage: Storage<Record<string, Chat | undefined>>;
    private contactsStorage: Storage<Record<string, Contact | undefined>>;
    private lidMappingStorage: Storage<Record<string, string | undefined>>;

    constructor(private logger: Logger, private path: string) {
        super();
        this.setMaxListeners(0);
        const extraPath = resolve(path, 'extra');
        this.chatsStorage = new Storage<Record<string, Chat | undefined>>(resolve(extraPath, 'chats.json'), {});
        this.contactsStorage = new Storage<Record<string, Contact | undefined>>(resolve(extraPath, 'contacts.json'), {});
        this.lidMappingStorage = new Storage<Record<string, string | undefined>>(resolve(extraPath, 'lid-mapping.json'), {});
        this.initialization = this.connect();
    }

    private async resolveInfos(id: string, fallbackName?: string): Promise<ChatInfos> {
        await this.initialization;
        const normalizedId = jidNormalizedUser(id);
        const inverseId = this.lidMappingStorage.data[normalizedId];
        const chatId = normalizedId.endsWith('@lid') ? normalizedId : (inverseId?.endsWith('@lid') ? inverseId : normalizedId);
        let name = fallbackName;
        let status: string | undefined;
        let description: string | undefined;
        let phoneNumber: string | undefined;
        if (
            normalizedId === jidNormalizedUser(this.sock.user?.lid) || normalizedId === jidNormalizedUser(this.sock.user?.phoneNumber) || normalizedId === jidNormalizedUser(this.sock.user?.id) ||
            inverseId === jidNormalizedUser(this.sock.user?.lid) || inverseId === jidNormalizedUser(this.sock.user?.phoneNumber) || inverseId === jidNormalizedUser(this.sock.user?.id)
        ) {
            name = this.sock.user?.name ?? this.sock.user?.verifiedName ?? 'Me';
            status = this.sock.user?.status;
            phoneNumber = this.sock.user?.phoneNumber ?? (this.sock.user?.id.endsWith('@s.whatsapp.net') ? this.sock.user.id : undefined);
        } else {
            if (normalizedId.endsWith('@g.us') || inverseId?.endsWith('@g.us')) {
                const id = normalizedId.endsWith('@g.us') ? normalizedId : inverseId;
                if (id) {
                    const groupMetadata = await this.sock.groupMetadata(id);
                    name = groupMetadata.subject ?? name;
                    description = groupMetadata.desc;
                } else {
                    throw new Error('Unexpected undefined id');
                }
            } else {
                const chat = this.chatsStorage.data[normalizedId];
                const contact = this.contactsStorage.data[normalizedId];
                const inverseChat = this.chatsStorage.data[inverseId ?? ''];
                const inverseContact = this.contactsStorage.data[inverseId ?? ''];
                name = chat?.displayName ?? chat?.name ?? chat?.username ?? contact?.name ?? contact?.verifiedName ?? contact?.notify ?? (inverseId ? inverseChat?.displayName ?? inverseChat?.name ?? inverseChat?.username ?? inverseContact?.name ?? inverseContact?.verifiedName ?? inverseContact?.notify : undefined) ?? name;
                phoneNumber = contact?.phoneNumber ?? inverseContact?.phoneNumber ?? (contact?.id.endsWith('@s.whatsapp.net') ? contact.id : undefined) ?? (inverseContact?.id.endsWith('@s.whatsapp.net') ? inverseContact.id : undefined);
                status = contact?.status ?? inverseContact?.status;
                description = chat?.description ?? inverseChat?.description ?? undefined;
            }
        }
        let profilePictureUrl: string | undefined;
        try {
            profilePictureUrl = await this.sock.profilePictureUrl(normalizedId ?? inverseId);
        } catch {}
        return {
            chatId,
            name,
            status,
            description,
            phoneNumber,
            profilePictureUrl,
        }
    }

    private handleChatsUpsert(chats: Chat[]) {
        for (const chat of chats) {
            this.logger.debug({ chat }, 'Handle chat upsert, chat:');
            let lidJid: string | undefined;
            let pnJid: string | undefined;
            const ids = [chat.id, chat.lidJid, chat.pnJid, chat.accountLid];
            for (const id of ids) {
                if (id) {
                    const normalizedId = jidNormalizedUser(id);
                    this.chatsStorage.data[normalizedId] = assignDefined(this.chatsStorage.data[normalizedId] ?? {}, chat);
                    this.chatsStorage.save();
                    if (normalizedId.endsWith('@lid')) lidJid = normalizedId;
                    if (normalizedId.endsWith('@s.whatsapp.net')) pnJid = normalizedId;
                }
            }
            if (lidJid && pnJid) {
                this.handleLidMappingUpdate({ lid: lidJid, pn: pnJid });
            }
        }
    }

    private handleContactsUpsert(contacts: Contact[]) {
        for (const contact of contacts) {
            this.logger.debug({ contact }, 'Handle contact upsert, contact:');
            let lidJid: string | undefined;
            let pnJid: string | undefined;
            const ids = [contact.id, contact.lid, contact.phoneNumber];
            for (const id of ids) {
                if (id) {
                    const normalizedId = jidNormalizedUser(id);
                    this.contactsStorage.data[normalizedId] = assignDefined(this.contactsStorage.data[normalizedId] ?? {}, contact);
                    this.contactsStorage.save();
                    if (normalizedId.endsWith('@lid')) lidJid = normalizedId;
                    if (normalizedId.endsWith('@s.whatsapp.net')) pnJid = normalizedId;
                }
            }
            if (lidJid && pnJid) {
                this.handleLidMappingUpdate({ lid: lidJid, pn: pnJid });
            }
        }
    }

    private handleLidMappingUpdate({ lid, pn }: { lid: string, pn: string }) {
        this.logger.debug('Handle lid mapping update, lid: ' + lid + ', pn: ' + pn);
        this.lidMappingStorage.data[lid] = jidNormalizedUser(pn);
        this.lidMappingStorage.data[pn] = jidNormalizedUser(lid);
        this.lidMappingStorage.save();
    }

    private async handleMessagesUpsert(event: {
        messages: WAMessage[];
        type: MessageUpsertType;
        requestId?: string;
    }) {
        for (const m of event.messages) {
            this.logger.debug({ m }, 'Handle messages upsert, m:');

            const messageId = `${m.key.id}#${jidNormalizedUser(m.key.remoteJid ?? m.key.remoteJidAlt)}#${m.key.fromMe}`;

            // Extract id of sender and recipient
            const fromMe = m.key.fromMe ?? false;
            let senderId: string | undefined;
            let recipientId: string | undefined;
            let isGroup = m.key.remoteJid?.endsWith('@g.us') ?? false;
            if (fromMe) {
                senderId = jidNormalizedUser(this.sock.user?.lid ?? this.sock.user?.phoneNumber ?? this.sock.user?.id);
                if (isGroup) {
                    if (m.key.remoteJid) recipientId = jidNormalizedUser(m.key.remoteJid);
                } else {
                    if (m.key.remoteJidAlt?.endsWith('@s.whatsapp.net')) recipientId = jidNormalizedUser(m.key.remoteJidAlt);
                    if (m.key.remoteJid?.endsWith('@s.whatsapp.net')) recipientId = jidNormalizedUser(m.key.remoteJid);
                    if (m.key.remoteJidAlt?.endsWith('@lid')) recipientId = jidNormalizedUser(m.key.remoteJidAlt);
                    if (m.key.remoteJid?.endsWith('@lid')) recipientId = jidNormalizedUser(m.key.remoteJid);
                    if (m.key.participantAlt?.endsWith('@s.whatsapp.net')) recipientId = jidNormalizedUser(m.key.participantAlt);
                    if (m.key.participant?.endsWith('@s.whatsapp.net')) recipientId = jidNormalizedUser(m.key.participant);
                    if (m.key.participantAlt?.endsWith('@lid')) recipientId = jidNormalizedUser(m.key.participantAlt);
                    if (m.key.participant?.endsWith('@lid')) recipientId = jidNormalizedUser(m.key.participant);
                }
            } else {
                if (m.key.remoteJidAlt?.endsWith('@s.whatsapp.net')) senderId = jidNormalizedUser(m.key.remoteJidAlt);
                if (m.key.remoteJid?.endsWith('@s.whatsapp.net')) senderId = jidNormalizedUser(m.key.remoteJid);
                if (m.key.remoteJidAlt?.endsWith('@lid')) senderId = jidNormalizedUser(m.key.remoteJidAlt);
                if (m.key.remoteJid?.endsWith('@lid')) senderId = jidNormalizedUser(m.key.remoteJid);
                if (m.key.participantAlt?.endsWith('@s.whatsapp.net')) senderId = jidNormalizedUser(m.key.participantAlt);
                if (m.key.participant?.endsWith('@s.whatsapp.net')) senderId = jidNormalizedUser(m.key.participant);
                if (m.key.participantAlt?.endsWith('@lid')) senderId = jidNormalizedUser(m.key.participantAlt);
                if (m.key.participant?.endsWith('@lid')) senderId = jidNormalizedUser(m.key.participant);
                if (isGroup) {
                    if (m.key.remoteJid) recipientId = jidNormalizedUser(m.key.remoteJid);
                } else {
                    recipientId = senderId;
                }
            }
            if (!senderId) {
                this.logger.error({ m }, 'No senderId, m:');
                return;
            }
            if (!recipientId) {
                this.logger.error({ m }, 'Messages.upsert error, no recipientId, m:');
                throw new Error('RecipientId undefined');
            }

            // Extract sender and recipient infos like name, picture, phonenumber, description, status
            const senderInfos = await this.resolveInfos(senderId, m.pushName ?? undefined);
            const recipientInfos = await this.resolveInfos(recipientId);

            // Extract message content
            let text: string | undefined;
            if (m.message?.conversation) {
                text = m.message.conversation ?? text;
            }
            let extendedTextMessage: WhatsappExtendedTextMessage | undefined;
            if (m.message?.extendedTextMessage) {
                extendedTextMessage = {
                    text: m.message?.extendedTextMessage?.text ?? undefined,
                };
            }
            let imageMessage: WhatsappImageMessage | undefined;
            if (m.message?.imageMessage) {
                imageMessage = {
                    caption: m.message.imageMessage.caption ?? undefined,
                    mimeType: m.message.imageMessage.mimetype ?? undefined,
                    getData: async () => {
                        const stream = await downloadContentFromMessage(
                            m.message!.imageMessage!,
                            'image'
                        );
                        let data = Buffer.from([]);
                        for await (const chunk of stream) {
                            data = Buffer.concat([data, chunk]);
                        }
                        return data;
                    },
                };
            }
            let videoMessage: WhatsappVideoMessage | undefined;
            if (m.message?.videoMessage) {
                videoMessage = {
                    size: m.message.videoMessage.fileLength != null ? BigInt(m.message.videoMessage.fileLength.toString()) : undefined,
                    caption: m.message.videoMessage.caption ?? undefined,
                    mimeType: m.message.videoMessage.mimetype ?? undefined,
                    getData: async () => {
                        const stream = await downloadContentFromMessage(
                            m.message!.videoMessage!,
                            'video'
                        );
                        let data = Buffer.from([]);
                        for await (const chunk of stream) {
                            data = Buffer.concat([data, chunk]);
                        }
                        return data;
                    },
                    getThumbData: async () => {
                        if (!m.message?.videoMessage?.jpegThumbnail) throw new Error('No thumbnail');
                        return Buffer.from(m.message?.videoMessage?.jpegThumbnail);
                    },
                };
            }
            let audioMessage: WhatsappAudioMessage | undefined;
            if (m.message?.audioMessage) {
                audioMessage = {
                    mimeType: m.message.audioMessage.mimetype ?? undefined,
                    getData: async () => {
                        const stream = await downloadContentFromMessage(
                            m.message!.audioMessage!,
                            'audio'
                        );
                        let data = Buffer.from([]);
                        for await (const chunk of stream) {
                            data = Buffer.concat([data, chunk]);
                        }
                        return data;
                    },
                };
            }
            let locationMessage: WhatsappLocationMessage | undefined;
            if (m.message?.locationMessage) {
                locationMessage = {
                    lat: m.message.locationMessage.degreesLatitude ?? undefined,
                    lng: m.message.locationMessage.degreesLongitude ?? undefined,
                };
            }
            let stickerMessage: WhatsappStickerMessage | undefined;
            if (m.message?.stickerMessage) {
                stickerMessage = {
                    mimeType: m.message.stickerMessage.mimetype ?? undefined,
                    getData: async () => {
                        const stream = await downloadContentFromMessage(
                            m.message!.stickerMessage!,
                            'sticker'
                        );
                        let data = Buffer.from([]);
                        for await (const chunk of stream) {
                            data = Buffer.concat([data, chunk]);
                        }
                        return data;
                    },
                };
            }
            let reactionMessage: WhatsappReactionMessage | undefined;
            if (m.message?.reactionMessage) {
                const message = m.message.reactionMessage;
                const key = message.key;
                const messageId = `${key?.id}#${jidNormalizedUser(key?.remoteJid ?? '')}#${key?.fromMe}`;
                reactionMessage = {
                    messageId,
                    text: message.text ?? undefined,
                    senderTimestampMs: message.senderTimestampMs != null ? BigInt(message.senderTimestampMs.toString()) : undefined,
                };
            }
            let groupChangeDescriptionMessage: WhatsappGroupChangeDescriptionMessage | undefined;
            if (m.messageStubType === proto.WebMessageInfo.StubType.GROUP_CHANGE_DESCRIPTION) {
                groupChangeDescriptionMessage = {
                    description: m.messageStubParameters?.[0] ?? undefined,
                };
            }

            // Dispatch message event
            const whatsappMessage: WhatsappMessage = {
                messageId,
                sender: senderInfos,
                recipient: recipientInfos,
                conversation: m.message?.conversation ?? undefined,
                extendedTextMessage,
                audioMessage,
                locationMessage,
                stickerMessage,
                fromMe,
                text,
                imageMessage,
                videoMessage,
                reactionMessage,
                groupChangeDescriptionMessage,
            };
            this.emit('message', whatsappMessage);
        }
    }

    private handleConnectionUpdate(update: Partial<ConnectionState>) {
        const { connection, lastDisconnect, qr } = update;
        if (connection === 'close') {
            if (isBoom(lastDisconnect?.error)) {
                const shouldReconnect = lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
                this.logger.info({ lastDisconnect, shouldReconnect }, 'connection closed, reconnecting...');
                // reconnect if not logged out
                if (shouldReconnect) {
                    this.connect()
                }
            }
        } else if (connection === 'open') {
            this.logger.info('opened connection');
        }
        if (qr) {
            this.emit('qr', qr);
        }
    }

    private handleMessageReceiptUpdate(events: MessageUserReceiptUpdate[]) {
        for (const event of events) {
            const key = event.key;
            const messageId = `${key.id}#${jidNormalizedUser(key.remoteJid ?? '')}#${key.fromMe}`;
            const whatsappMessageReceiptEvent: WhatsappMessageReceiptEvent = {
                messageId,
                deliveredDeviceJid: event.receipt.deliveredDeviceJid ?? undefined,
                pendingDeviceJid: event.receipt.pendingDeviceJid ?? undefined,
                playedTimestamp: event.receipt.playedTimestamp != null ? BigInt(event.receipt.playedTimestamp.toString()) : undefined,
                readTimestamp: event.receipt.readTimestamp != null ? BigInt(event.receipt.readTimestamp.toString()) : undefined,
                receiptTimestamp: event.receipt.receiptTimestamp != null ? BigInt(event.receipt.receiptTimestamp.toString()) : undefined,
                userJid: event.receipt.userJid ?? undefined,
            };
            this.emit('messageReceipt', whatsappMessageReceiptEvent);
        }
    }

    private async connect() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.path)
            this.sock = makeWASocket({
                browser: Browsers.windows('w2d'),
                auth: state,
                syncFullHistory: true,
                logger: this.logger.child({
                    context: 'Baileys',
                }, { level: 'info' }),
            });
            this.sock.ev.on('connection.update', (update) => {
                this.handleConnectionUpdate(update);
            })
            this.sock.ev.on('lid-mapping.update', ({ lid, pn }) => {
                this.handleLidMappingUpdate({ lid, pn });
            });
            this.sock.ev.on('contacts.upsert', (contacts) => {
                this.handleContactsUpsert(contacts);
            });
            this.sock.ev.on('chats.upsert', (chats) => {
                this.handleChatsUpsert(chats);
            });
            this.sock.ev.on('messaging-history.set', ({ chats, contacts }) => {
                this.handleChatsUpsert(chats);
                this.handleContactsUpsert(contacts);
            });
            this.sock.ev.on('messages.upsert', event => {
                this.handleMessagesUpsert(event);
            });
            this.sock.ev.on('message-receipt.update', event => {
                this.handleMessageReceiptUpdate(event);
            });
            this.sock.ev.on('creds.update', saveCreds);
        } catch (exc: unknown) {
            this.logger.error(exc, 'Error:');
        }
    }
}
