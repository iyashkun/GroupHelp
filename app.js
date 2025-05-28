const { Bot } = require('grammy');

class GroupManager {
    static warns = {};
    static groupRules = '';
    static adminOnly = false;

    static async extractTarget(ctx) {
        const args = ctx.message.text.split(' ').slice(1);
        let userId, reason;
        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            reason = args.join(' ');
        } else if (args.length > 0) {
            if (args[0].startsWith('@')) {
                const username = args[0].replace('@', '');
                const members = await ctx.getChatAdministrators();
                const user = members.find(m => m.user.username && m.user.username.toLowerCase() === username.toLowerCase());
                if (user) userId = user.user.id;
                else {
                    try {
                        const userObj = await ctx.api.getChatMember(ctx.chat.id, args[0]);
                        userId = userObj.user.id;
                    } catch {
                        return { userId: null, reason: args.slice(1).join(' ') };
                    }
                }
                reason = args.slice(1).join(' ');
            } else if (!isNaN(args[0])) {
                userId = parseInt(args[0]);
                reason = args.slice(1).join(' ');
            } else {
                userId = null;
                reason = args.slice(1).join(' ');
            }
        }
        return { userId, reason };
    }

    static async ban(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        await ctx.banChatMember(userId);
        await ctx.reply(`User banned.${reason ? ' Reason: ' + reason : ''}`);
    }
    static async unban(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        await ctx.unbanChatMember(userId);
        await ctx.reply(`User unbanned.${reason ? ' Reason: ' + reason : ''}`);
    }
    static async mute(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        await ctx.restrictChatMember(userId, { can_send_messages: false });
        await ctx.reply(`User muted.${reason ? ' Reason: ' + reason : ''}`);
    }
    static async unmute(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        await ctx.restrictChatMember(userId, { can_send_messages: true });
        await ctx.reply(`User unmuted.${reason ? ' Reason: ' + reason : ''}`);
    }
    static async kick(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        await ctx.banChatMember(userId);
        await ctx.unbanChatMember(userId);
        await ctx.reply(`User kicked.${reason ? ' Reason: ' + reason : ''}`);
    }
    static async warn(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        GroupManager.warns[userId] = (GroupManager.warns[userId] || 0) + 1;
        if (GroupManager.warns[userId] >= 3) {
            await ctx.banChatMember(userId);
            await ctx.reply(`User auto-banned after 3 warns.${reason ? ' Reason: ' + reason : ''}`);
        } else {
            await ctx.reply(`Warned. Total: ${GroupManager.warns[userId]}.${reason ? ' Reason: ' + reason : ''}`);
        }
    }
    static async report(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        await ctx.reply(`Reported to admins.${reason ? ' Reason: ' + reason : ''}`);
    }
    static async pin(ctx) {
        if (!ctx.message.reply_to_message) return ctx.reply('Reply to a message to pin.');
        await ctx.pinChatMessage(ctx.message.reply_to_message.message_id);
        await ctx.reply('Message pinned');
    }
    static async unpin(ctx) {
        await ctx.unpinAllChatMessages();
        await ctx.reply('All messages unpinned');
    }
    static async rules(ctx) {
        await ctx.reply(GroupManager.groupRules || 'No rules set.');
    }
    static async setrules(ctx) {
        const rules = ctx.message.text.split(' ').slice(1).join(' ');
        GroupManager.groupRules = rules;
        await ctx.reply('Rules updated.');
    }
    static async showrules(ctx) {
        await ctx.reply(GroupManager.groupRules || 'No rules set.');
    }
    static async adminmode(ctx) {
        const arg = ctx.message.text.split(' ')[1];
        GroupManager.adminOnly = arg === 'on';
        await ctx.reply(`Admin-only mode: ${GroupManager.adminOnly ? 'ON' : 'OFF'}`);
    }
    static async welcome(ctx) {
        const user = ctx.message.new_chat_members && ctx.message.new_chat_members[0];
        if (user) await ctx.reply(`Welcome ${user.first_name}!`);
    }
    static async handleMessage(ctx) {
        if (GroupManager.adminOnly && ctx.message.from.id !== ctx.me.id) {
            const member = await ctx.getChatMember(ctx.message.from.id);
            if (!['administrator', 'creator'].includes(member.status)) {
                await ctx.deleteMessage();
            }
        }
    }
}

const bot = new Bot(process.env.BOT_TOKEN);

bot.command('ban', GroupManager.ban);
bot.command('unban', GroupManager.unban);
bot.command('mute', GroupManager.mute);
bot.command('unmute', GroupManager.unmute);
bot.command('kick', GroupManager.kick);
bot.command('warn', GroupManager.warn);
bot.command('report', GroupManager.report);
bot.command('pin', GroupManager.pin);
bot.command('unpin', GroupManager.unpin);
bot.command('rules', GroupManager.rules);
bot.command('setrules', GroupManager.setrules);
bot.command('showrules', GroupManager.showrules);
bot.command('adminmode', GroupManager.adminmode);
bot.on('message:new_chat_members', GroupManager.welcome);
bot.on('message', GroupManager.handleMessage);

bot.start();
