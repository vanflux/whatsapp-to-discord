import { SlashCommandBuilder } from "@discordjs/builders";

export default function () {
  return new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Birthday commands')
    .addSubcommand(subcommand => subcommand
      .setName('set')
      .setDescription('Register a birthday to an user on the given date')
      .addStringOption(stringOption => stringOption
        .setName('name')
        .setDescription('People name')
        .setRequired(true)
      )
      .addStringOption(stringOption => stringOption
        .setName('date')
        .setDescription('Date (DD/MM)')
        .setRequired(true)
      )
      .addStringOption(stringOption => stringOption
        .setName('message')
        .setDescription('Message')
        .setRequired(true)
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName('delete')
      .setDescription('Delete a birthday')
      .addStringOption(stringOption => stringOption
        .setName('name')
        .setDescription('People name')
        .setRequired(true)
      )
    )
    .addSubcommand(subcommand => subcommand
      .setName('list')
      .setDescription('List birthdays')
    )
}
