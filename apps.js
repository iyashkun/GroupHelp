const { Bot } = require('grammy');
const escapeHtml = require('escape-html');

class GroupManager {
    static warns = {};
    static groupRules = '';
    static adminOnly = false;
    static adminCache = {};
    static adminCacheBlock = {};
    static SUPPORT_STAFF = ['5896960462']; // Replace with actual support staff IDs
    static BAN_GIFS = [
        'https://graph.org/file/02a1dcf7788186ffb36cb.mp4',
        'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
        'https://media.giphy.com/media/l0Iyl55kTeh71nTWw/giphy.gif'
    ];
    static KICK_GIFS = [
        'https://media.giphy.com/media/xUA7aM09ByyR1w5YWc/giphy.gif',
        'https://media.giphy.com/media/3o7TKtnuHOHHUjR38Y/giphy.gif',
        'https://media.giphy.com/media/26gsjCZpPolPr3qOQ/giphy.gif'
    ];

    static async mentionHtml(name, userId) {
        return `<a href="tg://user?id=${userId}">${escapeHtml(name)}</a>`;
    }

    static async mentionMarkdown(name, userId) {
        const escapedName = name.replace(/([*_`[\]])/g, '\\$1');
        return `[${escapedName}](tg://user?id=${userId})`;
    }

    static parseTime(timeStr) {
        const timeUnits = {
            s: 1000,
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000
        };
        const match = timeStr.match(/^(\d+)([smhd])$/i);
        if (!match) return null;
        const [, value, unit] = match;
        return parseInt(value) * timeUnits[unit.toLowerCase()];
    }

    static async extractTarget(ctx) {
        const args = ctx.message.text.split(' ').slice(1);
        let userId, userFirstName, userName, reason;

        if (ctx.message.reply_to_message && ctx.message.reply_to_message.from) {
            userId = ctx.message.reply_to_message.from.id;
            userFirstName = ctx.message.reply_to_message.from.first_name;
            userName = ctx.message.reply_to_message.from.username || '';
            reason = args.join(' ');
        } else if (args.length > 0) {
            if (args[0].startsWith('@')) {
                try {
                    const username = args[0].replace('@', '');
                    const chatMember = await ctx.api.getChatMember(ctx.chat.id, `@${username}`);
                    userId = chatMember.user.id;
                    userFirstName = chatMember.user.first_name;
                    userName = chatMember.user.username || '';
                } catch {
                    try {
                        const user = await ctx.api.getChat(`@${args[0].replace('@', '')}`);
                        userId = user.id;
                        userFirstName = user.first_name || user.title;
                        userName = user.username || '';
                    } catch {
                        userId = null;
                        userFirstName = args[0];
                        userName = '';
                    }
                }
                reason = args.slice(1).join(' ');
            } else if (!isNaN(args[0])) {
                userId = parseInt(args[0]);
                try {
                    const chatMember = await ctx.api.getChatMember(ctx.chat.id, userId);
                    userFirstName = chatMember.user.first_name;
                    userName = chatMember.user.username || '';
                } catch {
                    userFirstName = args[0];
                    userName = '';
                }
                reason = args.slice(1).join(' ');
            } else {
                userId = null;
                userFirstName = args[0];
                userName = '';
                reason = args.join(' ');
            }
        } else {
            userId = ctx.message.from.id;
            userFirstName = ctx.message.from.first_name;
            userName = ctx.message.from.username || '';
            reason = '';
        }
        return { userId, userFirstName, userName, reason };
    }

    static async reloadAdmins(ctx, event) {
        try {
            const admins = await ctx.getChatAdministrators();
            GroupManager.adminCache[ctx.chat.id] = admins.map(a => ({
                id: a.user.id,
                name: a.user.username || a.user.first_name,
                isBot: a.user.is_bot
            }));
            return GroupManager.adminCache[ctx.chat.id];
        } catch (e) {
            await ctx.reply(`Error reloading admins: ${e.message}`);
            throw e;
        }
    }

    static async tban(ctx) {
        if (!ctx.message.reply_to_message && ctx.message.text.split(' ').length < 3) {
            return ctx.reply('Please provide a user and time duration (e.g., /tban @user 1h reason).');
        }
        const { userId, userFirstName, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('Cannot find user to ban.');
        if (userId === ctx.me.id) return ctx.reply('Why would I ban myself?');
        if (GroupManager.SUPPORT_STAFF.includes(userId.toString())) {
            return ctx.reply('This user is in my support staff and cannot be banned.');
        }
        try {
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'tban'));
            if (adminList.some(admin => admin.id === userId)) {
                return ctx.reply('This user is an admin and cannot be banned.');
            }
            const args = ctx.message.text.split(' ').slice(1);
            const timeStr = ctx.message.reply_to_message ? args[0] : args[1];
            const banTime = GroupManager.parseTime(timeStr);
            if (!banTime) return ctx.reply('Invalid time format. Use formats like 30s, 10m, 2h, or 1d.');
            const banReason = reason.replace(timeStr, '').trim() || '';
            const untilDate = new Date(Date.now() + banTime);
            await ctx.banChatMember(userId, { until_date: untilDate });
            const admin = await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id);
            const banned = await GroupManager.mentionHtml(userFirstName, userId);
            let txt = `${admin} temporarily banned ${banned} in <b>${ctx.chat.title}</b> for ${timeStr}!`;
            if (banReason) txt += `\n<b>Reason</b>: ${banReason}`;
            const keyboard = {
                inline_keyboard: [[{ text: 'Unban', callback_data: `unban_${userId}` }]]
            };
            const gif = GroupManager.BAN_GIFS[Math.floor(Math.random() * GroupManager.BAN_GIFS.length)];
            await ctx.replyWithAnimation(gif, {
                caption: txt,
                reply_markup: keyboard,
                parse_mode: 'HTML',
                reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : ctx.message.message_id
            });
        } catch (e) {
            await ctx.reply(`Error banning user: ${e.message}`);
        }
    }

    static async stban(ctx) {
        if (!ctx.message.reply_to_message && ctx.message.text.split(' ').length < 3) {
            return ctx.reply('Please provide a user and time duration (e.g., /stban @user 1h reason).');
        }
        const { userId, userFirstName } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('Cannot find user to ban.');
        if (userId === ctx.me.id) return ctx.reply('Why would I ban myself?');
        if (GroupManager.SUPPORT_STAFF.includes(userId.toString())) {
            return ctx.reply('This user is in my support staff and cannot be banned.');
        }
        try {
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'stban'));
            if (adminList.some(admin => admin.id === userId)) {
                return ctx.reply('This user is an admin and cannot be banned.');
            }
            const args = ctx.message.text.split(' ').slice(1);
            const timeStr = ctx.message.reply_to_message ? args[0] : args[1];
            const banTime = GroupManager.parseTime(timeStr);
            if (!banTime) return ctx.reply('Invalid time format. Use formats like 30s, 10m, 2h, or 1d.');
            const untilDate = new Date(Date.now() + banTime);
            await ctx.banChatMember(userId, { until_date: untilDate });
            await ctx.deleteMessage();
            if (ctx.message.reply_to_message) await ctx.deleteMessage(ctx.message.reply_to_message.message_id);
        } catch (e) {
            await ctx.reply(`Error banning user: ${e.message}`);
        }
    }

    static async dtban(ctx) {
        if (!ctx.message.reply_to_message) {
            return ctx.reply('Reply to a message to delete it and temporarily ban the user.');
        }
        const { userId, userFirstName } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('Cannot find user to ban.');
        if (userId === ctx.me.id) return ctx.reply('Why would I ban myself?');
        if (GroupManager.SUPPORT_STAFF.includes(userId.toString())) {
            return ctx.reply('This user is in my support staff and cannot be banned.');
        }
        try {
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'dtban'));
            if (adminList.some(admin => admin.id === userId)) {
                return ctx.reply('This user is an admin and cannot be banned.');
            }
            const args = ctx.message.text.split(' ').slice(1);
            const timeStr = args[0];
            const banTime = GroupManager.parseTime(timeStr);
            if (!banTime) return ctx.reply('Invalid time format. Use formats like 30s, 10m, 2h, or 1d.');
            const banReason = args.slice(1).join(' ') || '';
            const untilDate = new Date(Date.now() + banTime);
            await ctx.banChatMember(userId, { until_date: untilDate });
            await ctx.deleteMessage(ctx.message.reply_to_message.message_id);
            const admin = await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id);
            const banned = await GroupManager.mentionHtml(userFirstName, userId);
            let txt = `${admin} temporarily banned ${banned} in <b>${ctx.chat.title}</b> for ${timeStr}!`;
            if (banReason) txt += `\n<b>Reason</b>: ${banReason}`;
            const keyboard = {
                inline_keyboard: [[{ text: 'Unban', callback_data: `unban_${userId}` }]]
            };
            const gif = GroupManager.BAN_GIFS[Math.floor(Math.random() * GroupManager.BAN_GIFS.length)];
            await ctx.replyWithAnimation(gif, {
                caption: txt,
                reply_markup: keyboard,
                parse_mode: 'HTML'
            });
        } catch (e) {
            await ctx.reply(`Error banning user: ${e.message}`);
        }
    }

    static async kick(ctx) {
        if (!ctx.message.reply_to_message && ctx.message.text.split(' ').length < 2) {
            return ctx.reply('Please provide a user to kick (e.g., /kick @user reason).');
        }
        const { userId, userFirstName, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('Cannot find user to kick.');
        if (userId === ctx.me.id) return ctx.reply('Why would I kick myself?');
        if (GroupManager.SUPPORT_STAFF.includes(userId.toString())) {
            return ctx.reply('This user is in my support staff and cannot be kicked.');
        }
        try {
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'kick'));
            if (adminList.some(admin => admin.id === userId)) {
                return ctx.reply('This user is an admin and cannot be kicked.');
            }
            await ctx.banChatMember(userId);
            await ctx.unbanChatMember(userId);
            const admin = await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id);
            const kicked = await GroupManager.mentionHtml(userFirstName, userId);
            let txt = `${admin} kicked ${kicked} in <b>${ctx.chat.title}</b>!`;
            if (reason) txt += `\n<b>Reason</b>: ${reason}`;
            const gif = GroupManager.KICK_GIFS[Math.floor(Math.random() * GroupManager.KICK_GIFS.length)];
            await ctx.replyWithAnimation(gif, {
                caption: txt,
                parse_mode: 'HTML',
                reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : ctx.message.message_id
            });
        } catch (e) {
            await ctx.reply(`Error kicking user: ${e.message}`);
        }
    }

    static async skick(ctx) {
        if (!ctx.message.reply_to_message && ctx.message.text.split(' ').length < 2) {
            return ctx.reply('Please provide a user to kick (e.g., /skick @user).');
        }
        const { userId, userFirstName } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('Cannot find user to kick.');
        if (userId === ctx.me.id) return ctx.reply('Why would I kick myself?');
        if (GroupManager.SUPPORT_STAFF.includes(userId.toString())) {
            return ctx.reply('This user is in my support staff and cannot be kicked.');
        }
        try {
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'skick'));
            if (adminList.some(admin => admin.id === userId)) {
                return ctx.reply('This user is an admin and cannot be kicked.');
            }
            await ctx.banChatMember(userId);
            await ctx.unbanChatMember(userId);
            await ctx.deleteMessage();
            if (ctx.message.reply_to_message) await ctx.deleteMessage(ctx.message.reply_to_message.message_id);
        } catch (e) {
            await ctx.reply(`Error kicking user: ${e.message}`);
        }
    }

    static async dkick(ctx) {
        if (!ctx.message.reply_to_message) {
            return ctx.reply('Reply to a message to delete it and kick the user.');
        }
        const { userId, userFirstName, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('Cannot find user to kick.');
        if (userId === ctx.me.id) return ctx.reply('Why would I kick myself?');
        if (GroupManager.SUPPORT_STAFF.includes(userId.toString())) {
            return ctx.reply('This user is in my support staff and cannot be kicked.');
        }
        try {
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'dkick'));
            if (adminList.some(admin => admin.id === userId)) {
                return ctx.reply('This user is an admin and cannot be kicked.');
            }
            await ctx.banChatMember(userId);
            await ctx.unbanChatMember(userId);
            await ctx.deleteMessage(ctx.message.reply_to_message.message_id);
            const admin = await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id);
            const kicked = await GroupManager.mentionHtml(userFirstName, userId);
            let txt = `${admin} kicked ${kicked} in <b>${ctx.chat.title}</b>!`;
            if (reason) txt += `\n<b>Reason</b>: ${reason}`;
            const gif = GroupManager.KICK_GIFS[Math.floor(Math.random() * GroupManager.KICK_GIFS.length)];
            await ctx.replyWithAnimation(gif, {
                caption: txt,
                parse_mode: 'HTML'
            });
        } catch (e) {
            await ctx.reply(`Error kicking user: ${e.message}`);
        }
    }

    static async handleUnbanCallback(ctx) {
        const callbackData = ctx.callbackQuery.data;
        if (callbackData.startsWith('unban_')) {
            const userId = parseInt(callbackData.split('_')[1]);
            try {
                await ctx.unbanChatMember(userId);
                await ctx.editMessageText(`User ${userId} unbanned by ${await GroupManager.mentionHtml(ctx.from.first_name, ctx.from.id)}!`, {
                    parse_mode: 'HTML'
                });
            } catch (e) {
                await ctx.answerCallbackQuery(`Error unbanning user: ${e.message}`, { show_alert: true });
            }
        }
        await ctx.answerCallbackQuery();
    }

    static async ban(ctx) {
        const { userId, userFirstName, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        if (userId === ctx.me.id) return ctx.reply('Why would I ban myself?');
        if (GroupManager.SUPPORT_STAFF.includes(userId.toString())) {
            return ctx.reply('This user is in my support staff and cannot be banned.');
        }
        try {
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'ban'));
            if (adminList.some(admin => admin.id === userId)) {
                return ctx.reply('This user is an admin and cannot be banned.');
            }
            await ctx.banChatMember(userId);
            const txt = `${await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id)} banned ${await GroupManager.mentionHtml(userFirstName, userId)} in <b>${ctx.chat.title}</b>!${reason ? `\n<b>Reason</b>: ${reason}` : ''}`;
            const gif = GroupManager.BAN_GIFS[Math.floor(Math.random() * GroupManager.BAN_GIFS.length)];
            await ctx.replyWithAnimation(gif, {
                caption: txt,
                parse_mode: 'HTML'
            });
        } catch (e) {
            await ctx.reply(`Error banning user: ${e.message}`);
        }
    }

    static async unban(ctx) {
        const { userId, userFirstName, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            await ctx.unbanChatMember(userId);
            const txt = `${await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id)} unbanned ${await GroupManager.mentionHtml(userFirstName, userId)} in <b>${ctx.chat.title}</b>!${reason ? `\n<b>Reason</b>: ${reason}` : ''}`;
            await ctx.reply(txt, { parse_mode: 'HTML' });
        } catch (e) {
            await ctx.reply(`Error unbanning user: ${e.message}`);
        }
    }

    static async mute(ctx) {
        const { userId, userFirstName, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        if (userId === ctx.me.id) return ctx.reply('Why would I mute myself?');
        if (GroupManager.SUPPORT_STAFF.includes(userId.toString())) {
            return ctx.reply('This user is in my support staff and cannot be muted.');
        }
        try {
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'mute'));
            if (adminList.some(admin => admin.id === userId)) {
                return ctx.reply('This user is an admin and cannot be muted.');
            }
            await ctx.restrictChatMember(userId, { can_send_messages: false });
            const txt = `${await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id)} muted ${await GroupManager.mentionHtml(userFirstName, userId)} in <b>${ctx.chat.title}</b>!${reason ? `\n<b>Reason</b>: ${reason}` : ''}`;
            await ctx.reply(txt, { parse_mode: 'HTML' });
        } catch (e) {
            await ctx.reply(`Error muting user: ${e.message}`);
        }
    }

    static async unmute(ctx) {
        const { userId, userFirstName, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            await ctx.restrictChatMember(userId, { can_send_messages: true });
            const txt = `${await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id)} unmuted ${await GroupManager.mentionHtml(userFirstName, userId)} in <b>${ctx.chat.title}</b>!${reason ? `\n<b>Reason</b>: ${reason}` : ''}`;
            await ctx.reply(txt, { parse_mode:
