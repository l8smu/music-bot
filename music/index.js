const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// استخدام متغيرات البيئة للتوكن والـ Client ID
const token = process.env.DISCORD_BOT_TOKEN || 'MTM5Mzk5MjE3NzQwNjcwNTcwNQ.GwDXSQ.sj_cDzH-jcC8MY0djY2XYMy8OS9ddV6tLTabcU';
const clientId = process.env.DISCORD_CLIENT_ID || '1393992177406705705';

// إعداد اللاعب مع معالجة أفضل للأخطاء
const player = createAudioPlayer({
  behaviors: {
    noSubscriber: 'pause',
    maxMissedFrames: Math.round(5000 / 20), // 5 seconds
  },
  debug: false
});

let currentVolume = 0.5;
let voiceConnection = null;

// معالجة أحداث اللاعب
player.on('stateChange', (oldState, newState) => {
  console.log(`🎵 Player تغير من ${oldState.status} إلى ${newState.status}`);
});

player.on('error', error => {
  console.error('❌ خطأ في Player:', error.message);
});

player.on(AudioPlayerStatus.Playing, () => {
  console.log('✅ بدأ التشغيل بنجاح!');
});

player.on(AudioPlayerStatus.Idle, () => {
  console.log('⏹️ انتهى التشغيل');
});

// إعداد SoundCloud
async function setupSoundCloud() {
  try {
    await play.setToken({
      soundcloud: {
        client_id: 'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoJ'
      }
    });
    console.log('✅ تم إعداد SoundCloud بنجاح');
  } catch (error) {
    console.log('⚠️ لم يتم إعداد SoundCloud، سيتم استخدام يوتيوب فقط');
  }
}

// تعريف الأوامر
const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('تشغيل موسيقى من يوتيوب أو SoundCloud')
    .addStringOption(option =>
      option.setName('song')
        .setDescription('اسم الأغنية أو المقطع')
        .setRequired(true)),
];

// تسجيل الأوامر
const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands() {
  try {
    console.log('🔄 بدء تسجيل الأوامر...');
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );
    console.log('✅ تم تسجيل الأوامر بنجاح!');
  } catch (error) {
    console.error('❌ خطأ في تسجيل الأوامر:', error.message);
  }
}

// دالة للبحث عن المقاطع
async function searchForTrack(query) {
  try {
    console.log(`🔍 البحث عن: ${query}`);

    // البحث في يوتيوب أولاً
    let results = await play.search(query, { 
      source: { youtube: 'video' }, 
      limit: 5 
    });

    if (!results || results.length === 0) {
      console.log('⚠️ لم نجد نتائج في يوتيوب، جاري البحث في SoundCloud...');
      try {
        results = await play.search(query, { 
          source: { soundcloud: 'tracks' }, 
          limit: 5 
        });
      } catch (scError) {
        console.log('❌ فشل البحث في SoundCloud:', scError.message);
      }
    }

    if (!results || results.length === 0) {
      return null;
    }

    // العثور على مقطع صالح
    for (const track of results) {
      if (track.url && track.url !== 'undefined' && track.title) {
        console.log(`✅ تم العثور على: ${track.title}`);
        return track;
      }
    }

    return null;
  } catch (error) {
    console.error('❌ خطأ في البحث:', error.message);
    return null;
  }
}

// دالة لإنشاء البث
async function createStream(track) {
  try {
    console.log(`🎵 إنشاء البث لـ: ${track.title}`);

    const stream = await play.stream(track.url, {
      quality: 1,
      discordPlayerCompatibility: true,
      seek: 0
    });

    if (!stream || !stream.stream) {
      throw new Error('فشل في إنشاء البث');
    }

    console.log('✅ تم إنشاء البث بنجاح');
    return stream;
  } catch (error) {
    console.error('❌ خطأ في إنشاء البث:', error.message);
    throw error;
  }
}

// دالة للاتصال بالروم الصوتي
function connectToVoiceChannel(channel) {
  try {
    if (voiceConnection) {
      voiceConnection.destroy();
    }

    voiceConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    voiceConnection.on('stateChange', (oldState, newState) => {
      console.log(`🔗 Connection تغير من ${oldState.status} إلى ${newState.status}`);
    });

    voiceConnection.on('error', error => {
      console.error('❌ خطأ في الاتصال:', error.message);
    });

    voiceConnection.on(VoiceConnectionStatus.Disconnected, () => {
      console.log('🔌 تم قطع الاتصال');
    });

    return voiceConnection;
  } catch (error) {
    console.error('❌ خطأ في الاتصال بالروم الصوتي:', error.message);
    throw error;
  }
}

// دالة تشغيل الموسيقى الرئيسية
async function playMusic(query, voiceChannel, replyFunction) {
  try {
    await replyFunction('🔍 جاري البحث...');

    const track = await searchForTrack(query);
    if (!track) {
      return await replyFunction('❌ لم يتم العثور على أي نتائج للبحث');
    }

    const connection = connectToVoiceChannel(voiceChannel);
    const stream = await createStream(track);

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true
    });

    resource.volume.setVolume(currentVolume);

    connection.subscribe(player);
    player.play(resource);

    // تحديد نوع المصدر
    let sourceType = 'youtube';
    let sourceEmoji = '📺';
    let sourceName = 'YouTube';

    if (track.url && track.url.includes('soundcloud.com')) {
      sourceType = 'soundcloud';
      sourceEmoji = '☁️';
      sourceName = 'SoundCloud';
    }

    const embed = new EmbedBuilder()
      .setColor(sourceType === 'soundcloud' ? '#ff5500' : '#0099ff')
      .setTitle(`🎶 الآن يعزف من ${sourceName}`)
      .setDescription(`**${track.title}**`)
      .addFields(
        { name: `${sourceEmoji} المصدر`, value: sourceName, inline: true },
        { name: '🎵 الفنان', value: track.channel?.name || track.uploader?.name || 'غير محدد', inline: true },
        { name: '⏱️ المدة', value: track.durationFormatted || 'غير محدد', inline: true },
        { name: '🔊 مستوى الصوت', value: `${Math.round(currentVolume * 100)}%`, inline: true }
      )
      .setThumbnail(track.thumbnail?.url)
      .setFooter({ 
        text: `تم تشغيل المقطع من ${sourceName}`,
        iconURL: null
      });

    const buttonRow = {
      type: 1,
      components: [
        {
          type: 2,
          label: '🔊 رفع الصوت',
          style: 1,
          custom_id: 'volume_up'
        },
        {
          type: 2,
          label: '🔉 خفض الصوت',
          style: 1,
          custom_id: 'volume_down'
        },
        {
          type: 2,
          label: '⏸️ إيقاف مؤقت',
          style: 2,
          custom_id: 'pause'
        },
        {
          type: 2,
          label: '⏹️ إيقاف',
          style: 4,
          custom_id: 'stop'
        },
        {
          type: 2,
          label: '⏭️ تخطي',
          style: 1,
          custom_id: 'skip'
        }
      ]
    };

    return await replyFunction({ embeds: [embed], components: [buttonRow] });

  } catch (error) {
    console.error('❌ خطأ في تشغيل الموسيقى:', error.message);
    return await replyFunction('❌ حدث خطأ في تشغيل الموسيقى. جرب مرة أخرى.');
  }
}

client.on('ready', async () => {
  console.log(`✅ تم تسجيل الدخول باسم ${client.user.tag}`);
  await setupSoundCloud();
  await deployCommands();
});

// معالجة الرسائل النصية
client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!play') || message.author.bot) return;

  const args = message.content.split(' ');
  const searchQuery = args.slice(1).join(' ');

  if (!searchQuery || searchQuery.trim() === '') {
    return message.reply('❌ اكتب اسم الأغنية بعد الأمر !play');
  }

  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply('⚠️ يجب أن تكون في روم صوتي أولاً');
  }

  await playMusic(searchQuery, voiceChannel, (content) => message.reply(content));
});

// معالجة الأوامر المنسدلة
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'play') {
      const searchQuery = interaction.options.getString('song');

      if (!searchQuery) {
        return interaction.reply('❌ يرجى إدخال اسم الأغنية');
      }

      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        return interaction.reply('⚠️ يجب أن تكون في روم صوتي أولاً');
      }

      await interaction.deferReply();
      await playMusic(searchQuery, voiceChannel, (content) => interaction.editReply(content));
    }
  }

  // معالجة الأزرار
  if (interaction.isButton()) {
    const currentResource = player.state.resource;

    switch (interaction.customId) {
      case 'volume_up':
        if (currentResource && currentResource.volume) {
          currentVolume = Math.min(currentVolume + 0.1, 1.0);
          currentResource.volume.setVolume(currentVolume);
          await interaction.reply({ 
            content: `🔊 تم رفع الصوت إلى ${Math.round(currentVolume * 100)}%!`, 
            ephemeral: true 
          });
        } else {
          await interaction.reply({ content: '❌ لا يوجد مقطع يتم تشغيله حالياً!', ephemeral: true });
        }
        break;

      case 'volume_down':
        if (currentResource && currentResource.volume) {
          currentVolume = Math.max(currentVolume - 0.1, 0.0);
          currentResource.volume.setVolume(currentVolume);
          await interaction.reply({ 
            content: `🔉 تم خفض الصوت إلى ${Math.round(currentVolume * 100)}%!`, 
            ephemeral: true 
          });
        } else {
          await interaction.reply({ content: '❌ لا يوجد مقطع يتم تشغيله حالياً!', ephemeral: true });
        }
        break;

      case 'pause':
        if (player.state.status === AudioPlayerStatus.Playing) {
          player.pause();
          await interaction.reply({ content: '⏸️ تم إيقاف الموسيقى مؤقتاً!', ephemeral: true });
        } else if (player.state.status === AudioPlayerStatus.Paused) {
          player.unpause();
          await interaction.reply({ content: '▶️ تم استكمال التشغيل!', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ لا يوجد مقطع يتم تشغيله حالياً!', ephemeral: true });
        }
        break;

      case 'stop':
        if (player.state.status !== AudioPlayerStatus.Idle) {
          player.stop();
          if (voiceConnection) {
            voiceConnection.destroy();
            voiceConnection = null;
          }
          await interaction.reply({ content: '⏹️ تم إيقاف الموسيقى!', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ لا يوجد مقطع يتم تشغيله حالياً!', ephemeral: true });
        }
        break;

      case 'skip':
        if (player.state.status !== AudioPlayerStatus.Idle) {
          player.stop();
          await interaction.reply({ content: '⏭️ تم تخطي الأغنية!', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ لا يوجد مقطع يتم تشغيله حالياً!', ephemeral: true });
        }
        break;

      default:
        await interaction.reply({ content: '⚠️ أمر غير معروف.', ephemeral: true });
        break;
    }
  }
});

// معالجة الأخطاء العامة
process.on('unhandledRejection', (error) => {
  console.error('❌ خطأ غير معالج:', error.message);
});

process.on('uncaughtException', (error) => {
  console.error('❌ استثناء غير معالج:', error.message);
});

// تسجيل الدخول
client.login(token).catch(error => {
  console.error('❌ فشل في تسجيل الدخول:', error.message);
  process.exit(1);
});