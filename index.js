const { migrate } = require("./migrate-sqlite-to-postgres");
console.log("ENV DATABASE_URL existe?", !!process.env.DATABASE_URL);
console.log("ENV DATABASE_URL começa com:", (process.env.DATABASE_URL || "").slice(0, 20));

const { Client, GatewayIntentBits, Events, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

const {
  wasProcessed,
  markProcessed,
  addEligible,
  listEligible,
  getRoleId,
  setRoleId,
} = require('./db');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ========= CONFIG =========
const GUILD_ID = "1467226819403976716";
const ANNOUNCE_CHANNEL_ID = "1467649692027322562";

const METAS = [
  { value: 50,   color: 0x57F287 },
  { value: 100,  color: 0x3498DB },
  { value: 200,  color: 0x9B59B6 },
  { value: 300,  color: 0xE67E22 },
  { value: 500,  color: 0xF1C40F },
  { value: 1000, color: 0xE74C3C },
  { value: 2000, color: 0x1ABC9C },
];
// ==========================

// ---- carregar comandos ----
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.existsSync(commandsPath)
  ? fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))
  : [];

for (const file of commandFiles) {
  const cmd = require(`./commands/${file}`);
  client.commands.set(cmd.data.name, cmd);
}
console.log("📦 Comandos carregados:", [...client.commands.keys()]);
// ---------------------------

// status helpers
function progressBar(current, target, width = 18) {
  const ratio = Math.min(1, current / target);
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

async function getProcessedKeysSet() {
  const set = new Set();
  for (const meta of METAS) {
    const key = `meta_${meta.value}`;
    if (await wasProcessed(key)) set.add(key);
  }
  return set;
}

function buildStatusText(memberCount, metas, processedKeysSet) {
  let out = `📊 **Status das Metas**\nMembros atuais: **${memberCount}**\n\n`;
  for (const meta of metas.slice().sort((a,b)=>a.value-b.value)) {
    const key = `meta_${meta.value}`;
    const done = processedKeysSet.has(key);
    const pct = Math.min(100, Math.floor((memberCount / meta.value) * 100));
    out += `**#${meta.value}** ${done ? "✅" : "⏳"}\n`;
    out += `\`${progressBar(memberCount, meta.value)}\` **${pct}%** (${memberCount}/${meta.value})\n\n`;
  }
  return out;
}

async function sendStatusToAnnounce(guild) {
  const announceChannel = guild.channels.cache.get(ANNOUNCE_CHANNEL_ID);
  if (!announceChannel) {
    console.log("⚠️ Canal de anúncios não encontrado. Confere ANNOUNCE_CHANNEL_ID.");
    return;
  }
  const processedKeysSet = await getProcessedKeysSet();
  await announceChannel.send(buildStatusText(guild.memberCount, METAS, processedKeysSet));
}

// role helper (cria se não existir)
async function getOrCreateMetaRole(guild, meta) {
  const key = `meta_${meta.value}`;
  const roleName = `#${meta.value}`;

  // DB
  const savedRoleId = await getRoleId(key);
  if (savedRoleId) {
    const r = guild.roles.cache.get(savedRoleId);
    if (r) return r;
  }

  // nome
  const byName = guild.roles.cache.find(r => r.name === roleName);
  if (byName) {
    await setRoleId(key, byName.id);
    return byName;
  }

  // permissão + hierarquia
  const me = guild.members.me;
  const canManage = me?.permissions?.has(PermissionsBitField.Flags.ManageRoles);
  const isAdmin = me?.permissions?.has(PermissionsBitField.Flags.Administrator);
  if (!canManage && !isAdmin) {
    throw new Error("Bot sem permissão: Gerenciar Cargos (Manage Roles) ou Administrador.");
  }

  const created = await guild.roles.create({
    name: roleName,
    color: meta.color,
    permissions: 0n, // visual only
    mentionable: false,
    hoist: false,
    reason: `Meta atingida: ${meta.value}`,
  });

  await setRoleId(key, created.id);
  console.log(`🎉 Cargo criado: ${roleName}`);
  return created;
}

// ✅ FUNÇÃO PRINCIPAL (retorna detalhes)
async function executeMilestone(guild, meta, { force = false } = {}) {
  const key = `meta_${meta.value}`;

  console.log(`🚀 executeMilestone: meta=${meta.value} force=${force} members=${guild.memberCount}`);

  // checks
  const already = await wasProcessed(key);
  if (already) {
    console.log(`ℹ️ Já processada: ${key}`);
    return { ok: true, skipped: true, reason: "already_processed", given: 0 };
  }

  if (!force && guild.memberCount < meta.value) {
    console.log(`ℹ️ Ainda não bateu: ${key} (tem ${guild.memberCount}, precisa ${meta.value})`);
    return { ok: true, skipped: true, reason: "not_reached", given: 0 };
  }

  // snapshot
  const members = await guild.members.fetch();
  let snap = 0;
  for (const [, m] of members) {
    await addEligible(key, m.user.id);
    snap++;
  }
  console.log(`📸 Snapshot salvo: ${snap} membros elegíveis`);

  // role
  const role = await getOrCreateMetaRole(guild, meta);

  // assign
  const eligibleIds = await listEligible(key);
  let given = 0;

  for (const userId of eligibleIds) {
    const gm = members.get(userId);
    if (!gm) continue;
    if (gm.roles.cache.has(role.id)) continue;

    await gm.roles.add(role);
    given++;

    // rate limit friendly
    if (given % 10 === 0) await new Promise(r => setTimeout(r, 500));
    else await new Promise(r => setTimeout(r, 200));
  }

  await markProcessed(key);
  console.log(`✅ ${key} concluída. Cargo dado para ${given} membros.`);

  // announce status
  await sendStatusToAnnounce(guild);

  return { ok: true, skipped: false, reason: "done", given };
}

async function checkAllMilestones(guild) {
  for (const meta of METAS.slice().sort((a,b)=>a.value-b.value)) {
    await executeMilestone(guild, meta, { force: false });
  }
}

// ✅ handler direto usado pelo /forcar_meta
client.forceMeta = async (guild, alvo) => {
  console.log("🧪 forceMeta chamado:", { guild: guild?.id, alvo });

  if (!guild) throw new Error("Guild inválida.");
  if (guild.id !== GUILD_ID) throw new Error("Este comando não é permitido neste servidor (GUILD_ID).");

  const meta = METAS.find(m => m.value === alvo);
  if (!meta) throw new Error(`Meta inválida: ${alvo}. Use: ${METAS.map(m => m.value).join(", ")}`);

  return await executeMilestone(guild, meta, { force: true });
};

client.once(Events.ClientReady, async () => {
  try {
    console.log("🔁 Tentando migrar SQLite → Postgres...");
    await migrate();
  } catch (e) {
    console.error("❌ Erro na migração:", e);
  }

  console.log(`✅ Online como ${client.user.tag}`);
});


client.on(Events.GuildMemberAdd, async (member) => {
  try {
    if (member.guild.id !== GUILD_ID) return;
    await checkAllMilestones(member.guild);
  } catch (e) {
    console.error("❌ Erro no GuildMemberAdd:", e);
  }
});

// slash commands handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return interaction.reply({ content: "❌ Comando não encontrado.", ephemeral: true });

  try {
    await command.execute(interaction, { GUILD_ID, METAS });
  } catch (e) {
    console.error(e);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "❌ Erro ao executar.", ephemeral: true });
    } else {
      await interaction.reply({ content: "❌ Erro ao executar.", ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
