const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { wasProcessed, listEligible } = require('../db');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '..', 'milestones.db'));

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('desfazer_meta')
    .setDescription('Desfaz uma meta (remove cargo e libera para rodar de novo) (admin)')
    .addIntegerOption(opt =>
      opt.setName('alvo')
        .setDescription('Ex: 50, 100, 200, 300, 500, 1000, 2000')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, ctx) {
    await interaction.deferReply({ ephemeral: true });

    const { GUILD_ID, METAS } = ctx;

    if (!interaction.guild || interaction.guild.id !== GUILD_ID) {
      return interaction.editReply("❌ Comando não permitido aqui.");
    }

    const alvo = interaction.options.getInteger('alvo', true);
    const meta = METAS.find(m => m.value === alvo);
    if (!meta) {
      return interaction.editReply(`❌ Meta inválida. Use: ${METAS.map(m => m.value).join(", ")}`);
    }

    const key = `meta_${meta.value}`;

    if (!(await wasProcessed(key))) {
      return interaction.editReply("⚠️ Essa meta ainda não está marcada como concluída no banco.");
    }

    const guild = interaction.guild;
    const roleName = `#${meta.value}`;
    const role = guild.roles.cache.find(r => r.name === roleName);

    const eligibleIds = await listEligible(key);
    const members = await guild.members.fetch();

    let removed = 0;
    if (role) {
      for (const userId of eligibleIds) {
        const gm = members.get(userId);
        if (!gm) continue;
        if (!gm.roles.cache.has(role.id)) continue;

        await gm.roles.remove(role);
        removed++;
        await new Promise(r => setTimeout(r, 250));
      }
    }

    await dbRun(`DELETE FROM processed WHERE milestone = ?`, [key]);
    await dbRun(`DELETE FROM eligible WHERE milestone = ?`, [key]);
    await dbRun(`DELETE FROM milestone_roles WHERE milestone = ?`, [key]);

    return interaction.editReply(
      `✅ Meta #${meta.value} desfeita!\n` +
      `- Cargo removido de **${removed}** membros.\n` +
      `- Meta liberada para rodar novamente.\n` +
      (role ? `⚠️ O cargo **${roleName}** foi mantido (apague manualmente se quiser).`
            : `ℹ️ Cargo ${roleName} não encontrado (talvez já foi apagado).`)
    );
  }
};
