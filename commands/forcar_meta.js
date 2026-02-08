const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forcar_meta')
    .setDescription('Força uma meta manualmente (somente admin)')
    .addIntegerOption(option =>
      option
        .setName('alvo')
        .setDescription('Valor da meta (ex: 50, 100, 200, 500, 1000...)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      return interaction.editReply('❌ Este comando só funciona dentro de um servidor.');
    }

    const alvo = interaction.options.getInteger('alvo', true);

    if (typeof interaction.client.forceMeta !== 'function') {
      return interaction.editReply("❌ Handler `forceMeta` não configurado no index.js.");
    }

    try {
      const result = await interaction.client.forceMeta(interaction.guild, alvo);

      if (result.skipped) {
        return interaction.editReply(
          `⚠️ Meta **#${alvo}** não fez nada.\n` +
          `Motivo: **${result.reason}**`
        );
      }

      return interaction.editReply(
        `✅ Meta **#${alvo}** forçada e processada!\n` +
        `👤 Cargo dado para **${result.given}** membros.`
      );
    } catch (err) {
      console.error('❌ Erro no /forcar_meta:', err);
      return interaction.editReply(`❌ Erro ao forçar a meta **#${alvo}**: ${err?.message ?? err}`);
    }
  }
};
