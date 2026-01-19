import { DiscordSendMessage } from "./send-message";
import { DiscordWebhook } from "./webhook";

export interface DiscordSendWebhookMessage {
    webhook: DiscordWebhook;
    sendMessage: DiscordSendMessage;
    avatarUrl?: string;
    username?: string;
}
