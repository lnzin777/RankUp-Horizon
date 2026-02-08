const { SlashCommandBuilder } = require('discord.js');
const { wasProcessed, countEligible, getRoleId } = require('../db');

function bar(current, target, width = 16) {
  const ratio = Math.min(1, current / target);
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status_meta')
    .setDescription('Mostra o status das metas com barra'),

  async execute(interaction, ctx) {
    // ✅ público (todo mundo vê)
    await interaction.deferReply({ ephemeral: false });

    const { GUILD_ID, METAS } = ctx;
    if (!interaction.guild || interaction.guild.id !== GUILD_ID) {
      return interaction.editReply("❌ Comando não permitido aqui.");
    }

    const guild = interaction.guild;
    const current = guild.memberCount;

    let out = `📊 **Status das Metas**\nMembros atuais: **${current}**\n\n`;

    for (const meta of METAS.slice().sort((a,b)=>a.value-b.value)) {
      const key = `meta_${meta.value}`;
      const done = await wasProcessed(key);
      const eligible = await countEligible(key);
      const roleId = await getRoleId(key);

      const pct = Math.min(100, Math.floor((current / meta.value) * 100));
      out += `**#${meta.value}** ${done ? "✅" : "⏳"}\n`;
      out += `\`${bar(current, meta.value)}\` **${pct}%** (${current}/${meta.value})\n`;
      out += `Elegíveis: **${eligible}** • Cargo: ${roleId ? "`OK`" : "`a criar`"}\n\n`;
    }

    return interaction.editReply(out);
  }
};

