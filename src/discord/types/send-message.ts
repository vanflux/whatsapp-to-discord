
export interface DiscordSendMessage {
    files: DiscordFile[];
    embeds: DiscordEmbed[];
    content?: string;
}

export interface DiscordFile {
    data: Buffer;
    filename: string;
}

export interface DiscordEmbed {
    title?: string;
    description?: string;
    timestamp?: Date;
    image?: DiscordEmbedImage;
    author?: DiscordEmbedAuthor;
    color?: string;
    fields?: DiscordEmbedField[];
}

export interface DiscordEmbedField {
    name: string;
    value: string;
    inline: boolean;
}

export interface DiscordEmbedImage {
    data: Buffer;
    filename: string;
}

export interface DiscordEmbedAuthor {
    name: string;
    iconUrl?: string;
}
