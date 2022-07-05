import { SlashCommandBuilder } from "@discordjs/builders";

export default function () {
  return new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat commands')
    .addSubcommand(subcommand => subcommand
      .setName('list')
      .setDescription('List Whatsapp chats.')
      .addIntegerOption(integerOption => integerOption
        .setName('page')
        .setDescription('Page number')
        .setMinValue(0)
        .setRequired(false)
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName('load')
      .setDescription('Load specific chat.')
      .addIntegerOption(integerOption => integerOption
        .setName('chat_id')
        .setDescription('Chat id parameter')
        .setRequired(true)
      )
    );
}
