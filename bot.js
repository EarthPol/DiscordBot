require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildPresences,
  GatewayIntentBits.GuildEmojisAndStickers,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.DirectMessages
];

const client = new Client({ intents });

const devRole = "Operator";
const linkedRole = "Linked";

// List of guild IDs to exclude
const excludedGuilds = ['1204204837483446353','1221344387443986472','1202654265965813770'];

const fetchData = async (url) => {
  const fetch = await import('node-fetch').then(mod => mod.default);
  console.log(`[i] Fetching URL: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    redirect: 'follow'
  });

  console.log(`[i] Response status: ${response.status}`);
  if (!response.ok) {
    console.error(`[i] Response headers: ${JSON.stringify(response.headers.raw())}`);
    throw new Error(`[i] Network response was not ok. Status: ${response.status}`);
  }
  return await response.json();
};

const hasRole = (member, roleName) => member.roles.cache.some(r => r.name === roleName);

const assignTheName = async (member, data) => {
  if (data.success) {
    try {
      if (member.roles.highest.rawPosition > member.guild.members.resolve(client.user).roles.highest.rawPosition) {
        console.log("[i] Bot has lower role than " + member.user.username);
      } else {
        if (data.data.player.username === "Undefined") {
          console.log("[i] No Data Found for " + member.user.username);
        } else {
          await member.setNickname(data.data.player.username);
          console.log("[i] Assigned " + member.user.username + "'s nickname to: " + data.data.player.username);
          const role = member.guild.roles.cache.find(role => role.name === linkedRole);
          if (role) await member.roles.add(role);
        }
      }
    } catch (error) {
      console.log("[i] Failed to set the nickname for " + member.user.username + " because an error occurred.");
      console.error(error);
    }
  } else {
    console.log("[i] Failed to assign the name to " + member.user.username);
  }
};

const getOwnerData = async () => {
  const ownerDiscordId = '773407231122604032'; // Replace with the actual owner's Discord ID
  const fetchUrl = `https://earthpol.com/api/json/discord/linked.php?key=[redacted]&discord=${ownerDiscordId}`;

  const ownerData = await fetchData(fetchUrl);
  const ownerUUID = ownerData.data.linked.uuid;

  const residentUrl = `https://earthpol.com/api/json/towny/residents.php?key=[redacted]&uuid=${ownerUUID}`;
  const residentData = await fetchData(residentUrl);
  const ownerTown = residentData.data[ownerUUID].town.toLowerCase();

  const townUrl = `https://earthpol.com/api/json/towny/towns.php?key=[redacted]&name=${ownerTown}`;
  const townData = await fetchData(townUrl);
  const ownerNation = townData.data[ownerTown].nation.toLowerCase();

  const nationUrl = `https://earthpol.com/api/json/towny/nations.php?key=[redacted]&name=${ownerNation}`;
  const nationData = await fetchData(nationUrl);
  const nationDetails = nationData.data[ownerNation];

  return {
    ownerUUID,
    ownerTown,
    ownerNation,
    nationAllies: nationDetails.allies.split('#'),
    nationEnemies: nationDetails.enemies.split('#')
  };
};

const assignRole = async (member, userUUID, ownerData) => {
  const residentUrl = `https://earthpol.com/api/json/towny/residents.php?key=[redacted]&uuid=${userUUID}`;
  const residentData = await fetchData(residentUrl);
  const userTown = residentData.data[userUUID].town.toLowerCase();

  const townUrl = `https://earthpol.com/api/json/towny/towns.php?key=[redacted]&name=${userTown}`;
  const townData = await fetchData(townUrl);
  const userNation = townData.data[userTown].nation;

  const roles = {
    Citizen: member.guild.roles.cache.find(role => role.name === 'Citizen').id,
    Ally: member.guild.roles.cache.find(role => role.name === 'Ally').id,
    Enemy: member.guild.roles.cache.find(role => role.name === 'Enemy').id,
    Neutral: member.guild.roles.cache.find(role => role.name === 'Neutral').id
  };

  if (userTown === ownerData.ownerTown) {
    await member.roles.add(roles.Citizen);
  } else if (userNation === ownerData.ownerNation) {
    await member.roles.add(roles.Citizen);
  } else if (ownerData.nationAllies.includes(userNation)) {
    await member.roles.add(roles.Ally);
  } else if (ownerData.nationEnemies.includes(userNation)) {
    await member.roles.add(roles.Enemy);
  } else {
    await member.roles.add(roles.Neutral);
  }
};

client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return; // Ignore bots

  // Exclude certain guilds from processing
  if (excludedGuilds.includes(member.guild.id)) {
    console.log(`[i] Skipping processing for guild ${member.guild.id}`);
    return;
  }

  const apiKey = "[redacted]";
  const fetchUrl = `https://earthpol.com/api/json/discord/linked.php?key=${apiKey}&discord=${member.user.id}`;

  try {
    const data = await fetchData(fetchUrl);

    if (!Object.keys(data.data).length) {
      console.log(`[i] No link data found for ${member.user.username}.`);
      return; // Exit if no data found
    }

    if (data.data.linked.uuid && data.data.linked.uuid !== "undefined") {
      const ownerData = await getOwnerData();
      await assignRole(member, data.data.linked.uuid, ownerData);
    } else {
      console.log(`[i] ${member.user.username} is not linked.`);
      // Optionally notify the user or take other actions
    }
  } catch (error) {
    console.error(`[i] Failed to process new member ${member.user.username}. Error: ${error.message}`);
  }
});

client.on('guildCreate', async (guild) => {
  console.log(`[i] Joined a new guild: ${guild.name}`);

  const botMember = guild.members.cache.get(client.user.id);

  if (botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    console.log(`[i] Bot has permission to manage roles in ${guild.name}`);

    const roleNames = ['Operator', 'Citizen', 'Ally', 'Enemy', 'Neutral', 'Linked'];
    const existingRoles = guild.roles.cache;

    for (const roleName of roleNames) {
      if (!existingRoles.some(role => role.name === roleName)) {
        await guild.roles.create({
          name: roleName,
          color: 'DEFAULT',
          mentionable: true
        });
        console.log(`[i] Created role ${roleName} in ${guild.name}`);
      }
    }

    // Move roles below the bot's role
    const botRole = botMember.roles.highest;
    const rolesToUpdate = roleNames.map(name => guild.roles.cache.find(role => role.name === name)).filter(role => role);

    for (const role of rolesToUpdate) {
      await role.setPosition(botRole.position - 1);
    }
  } else {
    console.log(`[i] Bot does not have permission to manage roles in ${guild.name}`);
  }
});

client.once('ready', async () => {
  console.log(`[i] Logged in as ${client.user.tag}!`);
});

client.login(process.env.BOT_TOKEN);
