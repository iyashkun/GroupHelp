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
                try {
                    const username = args[0].replace('@', '');
                    const chatMember = await ctx.api.getChatMember(ctx.chat.id, `@${username}`);
                    userId = chatMember.user.id;
                } catch {
                    userId = null;
                }
                reason = args.slice(1).join(' ');
            } else if (!isNaN(args[0])) {
                userId = parseInt(args[0]);
                reason = args.slice(1).join(' ');
            } else {
                userId = null;
                reason = args.join(' ');
            }
        } else {
            userId = null;
            reason = '';
        }
        return { userId, reason };
    }

    static async ban(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            await ctx.banChatMember(userId);
            await ctx.reply(`User banned.${reason ? ' Reason: ' + reason : ''}`);
        } catch (e) {
            await ctx.reply(`Error banning user: ${e.message}`);
        }
    }

    static async unban(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            await ctx.unbanChatMember(userId);
            await ctx.reply(`User unbanned.${reason ? ' Reason: ' + reason : ''}`);
        } catch (e) {
            await ctx.reply(`Error unbanning user: ${e.message}`);
        }
    }

    static async mute(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            await ctx.restrictChatMember(userId, { can_send_messages: false });
            await ctx.reply(`User muted.${reason ? ' Reason: ' + reason : ''}`);
        } catch (e) {
            await ctx.reply(`Error muting user: ${e.message}`);
        }
    }

    static async unmute(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            await ctx.restrictChatMember(userId, { can_send_messages: true });
            await ctx.reply(`User unmuted.${reason ? ' Reason: ' + reason : ''}`);
        } catch (e) {
            await ctx.reply(`Error unmuting user: ${e.message}`);
        }
    }

    static async kick(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            await ctx.banChatMember(userId);
            await ctx.unbanChatMember(userId);
            await ctx.reply(`User kicked.${reason ? ' Reason: ' + reason : ''}`);
        } catch (e) {
            await ctx.reply(`Error kicking user: ${e.message}`);
        }
    }

    static async warn(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            GroupManager.warns[userId] = (GroupManager.warns[userId] || 0) + 1;
            if (GroupManager.warns[userId] >= 3) {
                await ctx.banChatMember(userId);
                await ctx.reply(`User auto-banned after 3 warns.${reason ? ' Reason: ' + reason : ''}`);
                delete GroupManager.warns[userId];
            } else {
                await ctx.reply(`Warned. Total: ${GroupManager.warns[userId]}.${reason ? ' Reason: ' + reason : ''}`);
            }
        } catch (e) {
            await ctx.reply(`Error warning user: ${e.message}`);
        }
    }

    static async report(ctx) {
        const { userId, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            await ctx.reply(`Reported to admins.${reason ? ' Reason: ' + reason : ''}`);
        } catch (e) {
            await ctx.reply(`Error reporting user: ${e.message}`);
        }
    }

    static async pin(ctx) {
        if (!ctx.message.reply_to_message) return ctx.reply('Reply to a message to pin.');
        try {
            await ctx.pinChatMessage(ctx.message.reply_to_message.message_id);
            await ctx.reply('Message pinned');
        } catch (e) {
            await ctx.reply(`Error pinning message: ${e.message}`);
        }
    }

    static async unpin(ctx) {
        try {
            await ctx.unpinAllChatMessages();
            await ctx.reply('All messages unpinned');
        } catch (e) {
            await ctx.reply(`Error unpinning messages: ${e.message}`);
        }
    }

    static async rules(ctx) {
        await ctx.reply(GroupManager.groupRules || 'No rules set.');
    }

    static async setrules(ctx) {
        const rules = ctx.message.text.split(' ').slice(1).join(' ');
        GroupManager.groupRules = rules || GroupManager.groupRules;
        await ctx.reply('Rules updated.');
    }

    static async showrules(ctx) {
        await ctx.reply(GroupManager.groupRules || 'No rules set.');
    }

    static async adminmode(ctx) {
        const args = ctx.message.text.split(' ');
        const arg = args[1] ? args[1].toLowerCase() : undefined;
        GroupManager.adminOnly = arg === 'on';
        await ctx.reply(`Admin-only mode: ${GroupManager.adminOnly ? 'ON' : 'OFF'}`);
    }

    static async welcome(ctx) {
        const user = ctx.message.new_chat_members && ctx.message.new_chat_members[0];
        if (user) await ctx.reply(`Welcome ${user.first_name}!`);
    }

    static async handleMessage(ctx) {
        if (GroupManager.adminOnly && ctx.message.from.id !== ctx.me.id) {
            try {
                const member = await ctx.getChatMember(ctx.message.from.id);
                if (!['administrator', 'creator'].includes(member.status)) {
                    await ctx.deleteMessage();
                }
            } catch (e) {
                await ctx.reply(`Error handling message: ${e.message}`);
            }
        }
    }

    static async id(ctx) {
        if (ctx.message.reply_to_message) {
            const user = ctx.message.reply_to_message.from;
            await ctx.reply(`User: ${user.first_name} (@${user.username || 'No username'})\nID: ${user.id}`);
        } else {
            await ctx.reply(`Your ID: ${ctx.message.from.id}`);
        }
    }

    static async chatid(ctx) {
        await ctx.reply(`Chat ID: ${ctx.chat.id}`);
    }

    static async eval(ctx) {
        const ownerId = '5896960462';
        if (ctx.message.from.id.toString() !== ownerId) return ctx.reply('Unauthorized.');
        const code = ctx.message.text.split(' ').slice(1).join(' ');
        try {
            let result = eval(code);
            if (typeof result !== 'string') result = JSON.stringify(result, null, 2);
            await ctx.reply(`Result:\n${result}`);
        } catch (e) {
            await ctx.reply(`Error:\n${e.message}`);
        }
    }

    static async promote(ctx) {
        const { userId } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            await ctx.promoteChatMember(userId, {
                can_change_info: true,
                can_delete_messages: true,
                can_invite_users: true,
                can_restrict_members: true,
                can_pin_messages: true,
                can_promote_members: false
            });
            await ctx.reply('User promoted to admin');
        } catch (e) {
            await ctx.reply(`Error promoting user: ${e.message}`);
        }
    }

    static async demote(ctx) {
        const { userId } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            await ctx.promoteChatMember(userId, {
                can_change_info: false,
                can_delete_messages: false,
                can_invite_users: false,
                can_restrict_members: false,
                can_pin_messages: false,
                can_promote_members: false
            });
            await ctx.reply('User demoted from admin');
        } catch (e) {
            await ctx.reply(`Error demoting user: ${e.message}`);
        }
    }

    static async admins(ctx) {
        try {
            const admins = await ctx.getChatAdministrators();
            const list = admins.map(a => `${a.user.first_name} (${a.user.id})${a.user.username ? ' @' + a.user.username : ''}`).join('\n');
            await ctx.reply(`Admins:\n${list || 'No admins found.'}`);
        } catch (e) {
            await ctx.reply(`Error fetching admins: ${e.message}`);
        }
    }

    static async members(ctx) {
        await ctx.reply('Telegram API does not allow fetching all members directly.');
    }
}

const bot = new Bot("7366519712:AAGEijWPudZd8oEuSQZDMI6LblHgRmjCuRc");

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
bot.command('id', GroupManager.id);
bot.command('chatid', GroupManager.chatid);
bot.command('eval', GroupManager.eval);
bot.command('promote', GroupManager.promote);
bot.command('demote', GroupManager.demote);
bot.command('admins', GroupManager.admins);
bot.command('members', GroupManager.members);
bot.on('message:new_chat_members', GroupManager.welcome);
bot.on('message', GroupManager.handleMessage);

bot.start();
