import { SlashCommandBuilder } from "@discordjs/builders";

export default function () {
  return new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Send voice audio to the chat');
}
