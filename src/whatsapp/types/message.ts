import { ChatInfos } from "./chat-infos";

export interface WhatsappMessage {
    messageId: string;
    sender?: ChatInfos;
    recipient: ChatInfos;
    text?: string;
    fromMe: boolean;
    conversation?: string;
    audioMessage?: WhatsappAudioMessage;
    locationMessage?: WhatsappLocationMessage;
    stickerMessage?: WhatsappStickerMessage;
    extendedTextMessage?: WhatsappExtendedTextMessage;
    imageMessage?: WhatsappImageMessage;
    videoMessage?: WhatsappVideoMessage;
    reactionMessage?: WhatsappReactionMessage;
    groupChangeDescriptionMessage?: WhatsappGroupChangeDescriptionMessage;
}

export interface WhatsappImageMessage {
    caption?: string;
    mimeType?: string;
    getData: () => Promise<Buffer>;
}

export interface WhatsappVideoMessage {
    size?: bigint;
    caption?: string;
    mimeType?: string;
    getData: () => Promise<Buffer>;
    getThumbData: () => Promise<Buffer>;
}

export interface WhatsappAudioMessage {
    mimeType?: string;
    getData: () => Promise<Buffer>;
}

export interface WhatsappLocationMessage {
    lat?: number;
    lng?: number;
}

export interface WhatsappStickerMessage {
    mimeType?: string;
    getData: () => Promise<Buffer>;
}

export interface WhatsappExtendedTextMessage {
    text?: string;
}

export interface WhatsappReactionMessage {
    messageId: string;
    text?: string;
    senderTimestampMs?: bigint;
}

export interface WhatsappGroupChangeDescriptionMessage {
    description?: string;
}
