const { Bot } = require('grammy');
const escapeHtml = require('escape-html');

class GroupManager {
    static warns = {};
    static groupRules = '';
    static adminOnly = false;
    static adminCache = {};
    static adminCacheBlock = {};
    static SUPPORT_STAFF = ['5896960462'];
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
            await ctx.reply(txt, { parse_mode: 'HTML' });
        } catch (e) {
            await ctx.reply(`Error unmuting user: ${e.message}`);
        }
    }

    static async warn(ctx) {
        const { userId, userFirstName, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        if (userId === ctx.me.id) return ctx.reply('Why would I warn myself?');
        if (GroupManager.SUPPORT_STAFF.includes(userId.toString())) {
            return ctx.reply('This user is in my support staff and cannot be warned.');
        }
        try {
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'warn'));
            if (adminList.some(admin => admin.id === userId)) {
                return ctx.reply('This user is an admin and cannot be warned.');
            }
            GroupManager.warns[userId] = (GroupManager.warns[userId] || 0) + 1;
            if (GroupManager.warns[userId] >= 3) {
                await ctx.banChatMember(userId);
                const txt = `${await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id)} auto-banned ${await GroupManager.mentionHtml(userFirstName, userId)} after 3 warns in <b>${ctx.chat.title}</b>!${reason ? `\n<b>Reason</b>: ${reason}` : ''}`;
                delete GroupManager.warns[userId];
                await ctx.reply(txt, { parse_mode: 'HTML' });
            } else {
                const txt = `${await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id)} warned ${await GroupManager.mentionHtml(userFirstName, userId)} in <b>${ctx.chat.title}</b>. Total: ${GroupManager.warns[userId]}.${reason ? `\n<b>Reason</b>: ${reason}` : ''}`;
                await ctx.reply(txt, { parse_mode: 'HTML' });
            }
        } catch (e) {
            await ctx.reply(`Error warning user: ${e.message}`);
        }
    }

    static async report(ctx) {
        const { userId, userFirstName, reason } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            const txt = `Reported ${await GroupManager.mentionHtml(userFirstName, userId)} to admins in <b>${ctx.chat.title}</b>.${reason ? `\n<b>Reason</b>: ${reason}` : ''}`;
            await ctx.reply(txt, { parse_mode: 'HTML' });
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
        if (user) {
            await ctx.reply(`Welcome ${await GroupManager.mentionHtml(user.first_name, user.id)}!`, { parse_mode: 'HTML' });
        }
    }

    static async handleMessage(ctx) {
        if (GroupManager.adminOnly && ctx.message.from.id !== ctx.me.id) {
            try {
                const member = await ctx.getChatMember(ctx.message.from.id);
                if (!['administrator', 'developer'].includes(member.status)) {
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
            await ctx.reply(`User: ${await GroupManager.mentionHtml(user.first_name, user.id)}\nID: ${user.id}`, { parse_mode: 'HTML' });
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
            await ctx.reply(`<pre>${escapeHtml(result)}</pre>`, { parse_mode: 'HTML' });
        } catch (e) {
            await ctx.reply(`<pre>Error: ${escapeHtml(e.message)}</pre>`, { parse_mode: 'HTML' });
        }
    }

    static async promote(ctx) {
        const { userId, userFirstName } = await ctx.getChatMember(ctx.chat.id);
        if (!userId) return ctx.reply('User not found.');
        try {
            const bot = await ctx.getChatMember(ctx.chat.id);
            if (!bot.can_promote_members) return ctx.reply('I don’t have enough permission to promote users.');
            if (userId === ctx.me.id) return ctx.reply('I can’t promote myself!');
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await ctx.GroupManager.reloadAdmins(ctx, 'promote'));
            if (adminList.some(admin => admin.id === userId)) return ctx.reply('This user has already been promoted to admin.');
            const title = ctx.message.text.split(' ').slice(2).join(' ') || 'Itadori';
            await ctx.promote(userId, {
                can_change_info: bot.can_change_info,
                can_delete_messages: bot.can_delete_messages,
                can_invite_users: bot.can_invite_users,
                can_restrict_to_members: bot.can_restrict_members,
                can_pin_messages: bot.can_pin_messages,
                can_manage_video_chats: bot.can_manage_video_chats
            });
            await ctx.setChatAdministratorCustomTitle(ctx.chat.id, userId, title.slice(0, 16));
            GroupManager.adminCache[ctx.chat.id].push({ id: userId, name: userFirstName, isBot: false });
            await ctx.reply(
                `${await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id)} promoted ${await GroupManager.mentionHtml(userFirstName, userId)} in ${ctx.chat.title}! Title set to ${title.slice(0, 16)}`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            await ctx.reply(`Error promoting user: ${e.message}`);
        }
    }

    static async fullpromote(ctx) {
        const ownerId = '5896960462';
        if (ctx.message.from.id.toString() !== ownerId) {
            const user = await ctx.getChatMember(ctx.chat.id, ctx.message.from.id);
            if (user.status !== 'creator') return ctx.reply('This command is restricted to the chat owner.');
        }
        const { userId, userFirstName } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            const bot = await ctx.getChatMember(ctx.chat.id, ctx.me.id);
            if (!bot.can_promote_members) return ctx.reply('I don’t have permission to promote users.');
            if (userId === ctx.me.id) return ctx.reply('I can’t promote myself!');
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'fullpromote'));
            if (adminList.some(admin => admin.id === userId)) return ctx.reply('This user is already an admin.');
            const title = ctx.message.text.split(' ').slice(2).join(' ') || 'Gojo';
            await ctx.promoteChatMember(userId, {
                can_change_info: true,
                can_delete_messages: true,
                can_invite_users: true,
                can_restrict_members: true,
                can_pin_messages: true,
                can_manage_video_chats: true
            });
            await ctx.setChatAdministratorCustomTitle(ctx.chat.id, userId, title.slice(0, 16));
            GroupManager.adminCache[ctx.chat.id].push({ id: userId, name: userFirstName, isBot: false });
            await ctx.reply(
                `${await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id)} fully promoted ${await GroupManager.mentionHtml(userFirstName, userId)} in ${ctx.chat.title}! Title set to ${title.slice(0, 16)}`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            await ctx.reply(`Error promoting user: ${e.message}`);
        }
    }

    static async demote(ctx) {
        const { userId, userFirstName } = await GroupManager.extractTarget(ctx);
        if (!userId) return ctx.reply('User not found.');
        try {
            const bot = await ctx.getChatMember(ctx.chat.id, ctx.me.id);
            if (!bot.can_promote_members) return ctx.reply('I don’t have permission to demote users.');
            if (userId === ctx.me.id) return ctx.reply('I can’t demote myself!');
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'demote'));
            if (!adminList.some(admin => admin.id === userId)) return ctx.reply('This user is not an admin.');
            await ctx.promoteChatMember(userId, {
                can_change_info: false,
                can_delete_messages: false,
                can_invite_users: false,
                can_restrict_members: false,
                can_pin_messages: false,
                can_promote_members: false,
                can_manage_video_chats: false
            });
            GroupManager.adminCache[ctx.chat.id] = adminList.filter(admin => admin.id !== userId);
            await ctx.reply(
                `${await GroupManager.mentionHtml(ctx.message.from.first_name, ctx.message.from.id)} demoted ${await GroupManager.mentionHtml(userFirstName, userId)} in ${ctx.chat.title}!`,
                { parse_mode: 'HTML' }
            );
        } catch (e) {
            await ctx.reply(`Error demoting user: ${e.message}`);
        }
    }

    static async adminlist(ctx) {
        try {
            const adminList = GroupManager.adminCache[ctx.chat.id] || (await GroupManager.reloadAdmins(ctx, 'adminlist'));
            const userAdmins = adminList.filter(admin => !admin.isBot);
            const botAdmins = adminList.filter(admin => admin.isBot);
            let adminStr = `Admins in <b>${ctx.chat.title}</b>:\n\n<b>User Admins:</b>\n`;
            adminStr += userAdmins.length ? userAdmins.map(admin => `- ${admin.name} (${admin.id})`).join('\n') : 'None';
            adminStr += '\n\n<b>Bot Admins:</b>\n';
            adminStr += botAdmins.length ? botAdmins.map(admin => `- ${admin.name} (${admin.id})`).join('\n') : 'None';
            await ctx.reply(adminStr, { parse_mode: 'HTML' });
        } catch (e) {
            await ctx.reply(`Error fetching admins: ${e.message}`);
        }
    }

    static async zombies(ctx) {
        try {
            const bot = await ctx.getChatMember(ctx.chat.id, ctx.me.id);
            if (!bot.can_restrict_members) return ctx.reply('I don’t have permission to ban users.');
            let zombieCount = 0;
            let failedCount = 0;
            const wait = await ctx.reply('Searching for deleted accounts...');
            const members = await ctx.getChatMembers();
            for (const member of members) {
                if (member.user.is_deleted) {
                    zombieCount++;
                    try {
                        await ctx.banChatMember(member.user.id);
                    } catch (e) {
                        if (e.message.includes('USER_ADMIN_INVALID')) failedCount++;
                    }
                }
            }
            await wait.delete();
            if (zombieCount === 0) {
                await ctx.reply('Group is clean!');
            } else {
                await ctx.reply(`${zombieCount} zombies found and ${zombieCount - failedCount} banned! ${failedCount} zombies are immune.`, {
                    reply_markup: {
                        inline_keyboard: [[{ text: 'Animation', url: 'https://graph.org/file/02a1dcf7788186ffb36cb.mp4' }]]
                    }
                });
            }
        } catch (e) {
            await ctx.reply(`Error cleaning zombies: ${e.message}`);
        }
    }

    static async admincache(ctx) {
        const now = Date.now();
        if (GroupManager.adminCacheBlock[ctx.chat.id] && now - GroupManager.adminCacheBlock[ctx.chat.id] < 600000) {
            return ctx.reply('Can only reload admin cache once every 10 minutes.');
        }
        try {
            await GroupManager.reloadAdmins(ctx, 'admincache');
            GroupManager.adminCacheBlock[ctx.chat.id] = now;
            await ctx.reply('Admin cache reloaded!');
        } catch (e) {
            await ctx.reply(`Error reloading admin cache: ${e.message}`);
        }
    }

    static async invitelink(ctx) {
        try {
            const user = await ctx.getChatMember(ctx.chat.id, ctx.message.from.id);
            if (!user.can_invite_users && user.status !== 'creator') return ctx.reply('You don’t have permission to generate invite links.');
            const link = await ctx.exportChatInviteLink();
            await ctx.reply(`Invite link for ${ctx.chat.title}: ${link}`, { disable_web_page_preview: true });
        } catch (e) {
            await ctx.reply(`Error generating invite link: ${e.message}`);
        }
    }

    static async setgtitle(ctx) {
        try {
            const user = await ctx.getChatMember(ctx.chat.id, ctx.message.from.id);
            if (!user.can_change_info && user.status !== 'creator') return ctx.reply('You don’t have permission to change the group title.');
            const title = ctx.message.text.split(' ').slice(1).join(' ');
            if (!title) return ctx.reply('Please provide a title.');
            await ctx.setChatTitle(title);
            await ctx.reply(`Group title changed to ${title}`);
        } catch (e) {
            await ctx.reply(`Error setting group title: ${e.message}`);
        }
    }

    static async setgdes(ctx) {
        try {
            const user = await ctx.getChatMember(ctx.chat.id, ctx.message.from.id);
            if (!user.can_change_info && user.status !== 'creator') return ctx.reply('You don’t have permission to change the group description.');
            const description = ctx.message.text.split(' ').slice(1).join(' ');
            if (!description) return ctx.reply('Please provide a description.');
            await ctx.setChatDescription(description);
            await ctx.reply(`Group description changed to ${description}`);
        } catch (e) {
            ctx.reply(`Error setting group description: ${e.message}`);
        }
    }

    static async members(ctx) {
        await ctx.reply('Telegram API does not allow fetching all members directly.');
    }
}

const bot = new Bot("7366519712:AAGEijWPudZd8oEuSQZDMI6LblHgRmjCuRc");

bot.command('tban', GroupManager.tban);
bot.command('stban', GroupManager.stban);
bot.command('dtban', GroupManager.dtban);
bot.command('kick', GroupManager.kick);
bot.command('skick', GroupManager.skick);
bot.command('dkick', GroupManager.dkick);
bot.command('ban', GroupManager.ban);
bot.command('unban', GroupManager.unban);
bot.command('mute', GroupManager.mute);
bot.command('unmute', GroupManager.unmute);
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
bot.command('fullpromote', GroupManager.fullpromote);
bot.command('demote', GroupManager.demote);
bot.command('adminlist', GroupManager.adminlist);
bot.command('zombies', GroupManager.zombies);
bot.command('admincache', GroupManager.admincache);
bot.command('invitelink', GroupManager.invitelink);
bot.command('setgtitle', GroupManager.setgtitle);
bot.command('setgdes', GroupManager.setgdes);
bot.command('members', GroupManager.members);
bot.on('message:new_chat_members', GroupManager.welcome);
bot.on('message', GroupManager.handleMessage);
bot.on('callback_query', GroupManager.handleUnbanCallback);

bot.start();
