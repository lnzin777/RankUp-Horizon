const { REST, Routes } = require('discord.js');

const CLIENT_ID = "1469875473504010432";
const TOKEN = process.env.DISCORD_TOKEN;

const commands = [
  {
    name: 'status_meta',
    description: 'Mostra o status das metas com barra'
  },
  {
    name: 'forcar_meta',
    description: 'Força uma meta manualmente (somente admin)',
    options: [
      { name: 'alvo', description: 'Meta: 50, 100, 200, 300, 500, 1000, 2000', type: 4, required: true }
    ],
    default_member_permissions: "8"
  },
  {
    name: 'desfazer_meta',
    description: 'Desfaz uma meta (admin)',
    options: [
      { name: 'alvo', description: 'Meta: 50, 100, 200, 300, 500, 1000, 2000', type: 4, required: true }
    ],
    default_member_permissions: "8"
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('🔄 Registrando comandos slash (GLOBAL)...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Comandos globais registrados! (pode demorar alguns minutos)');
  } catch (e) {
    console.error(e);
  }
})();
