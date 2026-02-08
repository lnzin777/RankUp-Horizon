const { REST, Routes } = require('discord.js');

const CLIENT_ID = "1469875473504010432"; // seu Application ID

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    const cmds = await rest.get(Routes.applicationCommands(CLIENT_ID));
    console.log("✅ Comandos globais registrados:");
    for (const c of cmds) {
      console.log("-", c.name, "(", c.id, ")");
    }
  } catch (e) {
    console.error("❌ Erro ao listar comandos:", e);
  }
})();
