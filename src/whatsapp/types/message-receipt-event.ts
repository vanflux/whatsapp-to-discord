
export interface WhatsappMessageReceiptEvent {
    messageId: string;
    deliveredDeviceJid?: string[];
    pendingDeviceJid?: string[];
    playedTimestamp?: bigint;
    readTimestamp?: bigint;
    receiptTimestamp?: bigint;
    userJid?: string;
}
