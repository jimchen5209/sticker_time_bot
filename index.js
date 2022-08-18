require('./.pnp.cjs').setup(); // enable for yarn pnp
const config = require('./config');
const TelegramBot = require('node-telegram-bot-api');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, prettyPrint } = format;
const fs = require('fs');
const moment = require('moment-timezone');
const CronJob = require('cron').CronJob;
const Bottleneck = require('bottleneck');

const logger = createLogger({
    level: (typeof config.level == 'undefined') ? 'info' : config.level,
    format: combine(
        timestamp(),
        prettyPrint()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: config.log_file })
    ]
});

const token = config.tg_bot_token;

const stickers = [
    'CAACAgUAAx0CUuiSmgACElZi_jKZySpqUl3KBeaDu48Z4dk6KwACbwYAAoLG6VfK7mTdaQ8pUSkE',
    'CAACAgUAAx0CUuiSmgACEkti_XrGYVetvOT8Io3UXo7BYxBufAAClgYAAja26VfLhzMDRmb4eCkE',
    'CAACAgUAAx0CUuiSmgACEkxi_XrHHUlt7g_SMxMNwhjXPeB28wACywYAAuEN6FftNl1Pgim5RikE',
    'CAACAgUAAx0CUuiSmgACEk1i_XrIZZQejQUoBvsTd-CLakfkXQAC_AcAAoCO6FfyJ7zHOzLfmykE',
    'CAACAgUAAx0CUuiSmgACEk5i_XrIIa_NERH4RI9OImWD6zyXVQACegYAAraO6FeNNZ4wFHgR2SkE',
    'CAACAgUAAx0CUuiSmgACEk9i_jIxgGOJQhqY_Ti73GtGNgTaAQACaAkAAhLM6VeV29xrMu7PgCkE',
    'CAACAgUAAx0CUuiSmgACElBi_jJFpubP7rNZk4TNwBVPU4CnBQACmwYAAs4G6FfGyKZnC98ZWikE',
    'CAACAgUAAx0CUuiSmgACElFi_jJRBHNvPBI-2KzEB3KcozRsogACywcAAmjs6VfhxSiIBmzW7CkE',
    'CAACAgUAAx0CUuiSmgACElJi_jJf0Jnc35dpZhGc2R_p1AABd6wAAo0HAAIit-lXti3-dCl1fPEpBA',
    'CAACAgUAAx0CUuiSmgACElNi_jJuqORtEoIkZnS78UimW_EddwACrgYAAsG36FfqQGozD_F0nykE',
    'CAACAgUAAx0CUuiSmgACElRi_jJ6-sfSaZBeYM3eG52xPYdgLwACxQgAAkcf6Fd56sB4VHX7jykE',
    'CAACAgUAAx0CUuiSmgACElVi_jKJLN4fYI00na5WA-zDIdzpHQACmAYAAkjo6Ff-Q_BHgVMPAAEpBA'
];

const bot = new TelegramBot(token, { polling: true });

let data;
if (fs.existsSync('./data.json')) {
    const fdata = fs.readFileSync('./data.json', 'utf8');
    data = JSON.parse(fdata);
    // logger.info('Old data: ' + JSON.stringify(data));
}

function saveData() {
    json = JSON.stringify(data);
    fs.writeFile('./data.json', json, 'utf8', (err) => {
        if (err != null) {
            logger.error('Failed to save data.json: ' + err);
        }
    });
}

if (typeof data == 'undefined' || data == null) {
    logger.info('No data.json');
    data = {
        chatids: [],
        tzmap: {},
        lastid: {},
        autodelete: {},
        timelist: {},
    };
    saveData();
}

if (typeof data.chatids == 'undefined' || data.chatids == null) {
    data.chatids = [];
    saveData();
}

if (typeof data.tzmap == 'undefined' || data.tzmap == null) {
    data.tzmap = {};
    saveData();
}

if (typeof data.lastid == 'undefined' || data.lastid == null) {
    data.lastid = {};
    saveData();
}

if (typeof data.sleeptime == 'undefined' || data.sleeptime == null) {
    data.sleeptime = {};
    saveData();
}

if (typeof data.waketime == 'undefined' || data.waketime == null) {
    data.waketime = {};
    saveData();
}

if (typeof data.autodelete == 'undefined' || data.autodelete == null) {
    data.autodelete = {};
    saveData();
}

if (typeof data.timelist == 'undefined' || data.timelist == null) {
    data.timelist = {};
    saveData();
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    let index = data.chatids.indexOf(chatId);
    if (index > -1) {
        bot.sendMessage(chatId, 'Already started, chat ID: ' + chatId);
        return;
    }
    data.chatids.push(chatId);
    delete data.lastid[chatId];
    saveData();
    logger.info(chatId + ' started');
    bot.sendMessage(chatId, 'Started, chat ID: ' + chatId);
});

bot.onText(/^\/timezone(@sticker_time_bot)?(\s+([^\s]+))?$/, (msg, match) => {
    const chatId = msg.chat.id;
    if (match[3]) {
        if (moment.tz.zone(match[3])) {
            logger.info(chatId + ' set timezone to ' + match[3]);
            bot.sendMessage(chatId, 'Set timezone to ' + match[3]);
            data.tzmap[chatId] = match[3];
            saveData();
        } else {
            bot.sendMessage(chatId, 'Invalid timezone: ' + match[3]);
        }
    } else {
        let tz = data.tzmap[chatId];
        if (tz) {
            bot.sendMessage(chatId, 'Current timezone: ' + data.tzmap[chatId]);
        } else {
            bot.sendMessage(chatId, 'Timezone not set, by default Asia/Shanghai.');
        }
    }
});

bot.onText(/^\/autodelete(@sticker_time_bot)?(\s+([^\s]+))?$/, (msg, match) => {
    const chatId = msg.chat.id;
    let index = data.chatids.indexOf(chatId);
    if (index <= -1) {
        bot.sendMessage(chatId, 'Not started, chat ID: ' + chatId);
        return;
    }
    if (match[3]) {
        if (match[3] === 'on') {
            bot.sendMessage(chatId, 'Enable auto deleting');
            data.autodelete[chatId] = true;
            saveData();
            logger.info(chatId + ' set autodelete: on');
        } else if (match[3] === 'off') {
            bot.sendMessage(chatId, 'Disable auto deleting');
            data.autodelete[chatId] = false;
            saveData();
            logger.info(chatId + ' set autodelete: off');
        } else {
            bot.sendMessage(chatId, 'Unknown command');
        }
    } else {
        if (chatId in data.autodelete) {
            bot.sendMessage(chatId, 'Auto deleting status: ' + (data.autodelete[chatId] ? 'on' : 'off'));
        } else {
            bot.sendMessage(chatId, 'Auto deleting not set, by default off.');
        }
    }
});

bot.onText(/^\/sleeptime(@sticker_time_bot)?(\s+([^\s]+))?$/, (msg, match) => {
    const chatId = msg.chat.id;
    // bot.sendMessage(chatId, match[0]+'  '+match[1]+'  '+match[2]+'  '+match[3])
    if (match[3]) {
        const num = parseInt(match[3], 10);
        if (num <= 23 && num >= 0){
            data.sleeptime[chatId] = num;
            let message = 'Set sleep time to ' + num + ':00';
            if (chatId in data.timelist) {
                delete data.timelist[chatId];
                message += ", list of hours has been deleted.";
            }
            saveData();
            logger.info(chatId + ' set sleeptime to '+ num +':00');
            bot.sendMessage(chatId, message);
        } else {
            bot.sendMessage(chatId, match[3]+' is an invalid time, 0-23 expected');
        }
    } else {
        if (chatId in data.sleeptime) {
            bot.sendMessage(chatId, "Current sleep time: " + data.sleeptime[chatId]);
        } else {
            bot.sendMessage(chatId, "Sleep time not set");
        }
    }
});

bot.onText(/^\/waketime(@sticker_time_bot)?(\s+([^\s]+))?$/, (msg, match) => {
    const chatId = msg.chat.id;
    if (match[3]) {
        const num = parseInt(match[3], 10);
        if (num <= 23 && num >= 0){
            data.waketime[chatId] = num;
            let message = "Set waketime to " + num + ":00";
            if (chatId in data.timelist) {
                delete data.timelist[chatId];
                message += ", list of hours has been deleted.";
            }
            saveData();
            logger.info(chatId + ' set waketime to '+ num +':00');
            bot.sendMessage(chatId, message);
        } else {
            bot.sendMessage(chatId, match[3]+' is an invalid time, 0-23 expected');
        }
    } else {
        if (chatId in data.waketime) {
            bot.sendMessage(chatId, "Current wake time: " + data.waketime[chatId]);
        } else {
            bot.sendMessage(chatId, "Wake time not set");
        }
    }
});

bot.onText(/\/nosleep(@sticker_time_bot)?/, (msg) => {
    const chatId = msg.chat.id;
	if (!(chatId in data.sleeptime) && !(chatId in data.waketime)) {
		bot.sendMessage(chatId, 'Sleep time and wake time not set');
		return;
	}
	if (chatId in data.sleeptime) {
		delete data.sleeptime[chatId];
	}
	if (chatId in data.waketime) {
		delete data.waketime[chatId];
	}
    saveData();
    logger.info(chatId + ' deleted sleep time and wake time');
    bot.sendMessage(chatId, 'Successfully deleted sleep time');
});

bot.onText(/^\/addhour(@sticker_time_bot)?(\s+([^\s]+))?$/, (msg, match) => {
    const chatId = msg.chat.id;
    // bot.sendMessage(chatId, match[0]+'  '+match[1]+'  '+match[2]+'  '+match[3])
    if (match[3]) {
        const num = parseInt(match[3], 10);
        if (num <= 23 && num >= 0){
            if (chatId in data.timelist) {
                if (data.timelist[chatId].indexOf(num) > -1) {
                    bot.sendMessage(chatId, 'Time '+ num +':00 already added');
                    return;
                }
                data.timelist[chatId].push(num);
            } else {
                data.timelist[chatId] = [num];
            }
            let sleepDeleted = false;
            if (chatId in data.sleeptime) {
                delete data.sleeptime[chatId];
                sleepDeleted = true;
            }
            if (chatId in data.waketime) {
                delete data.waketime[chatId];
                sleepDeleted = true;
            }
            logger.info(chatId + ' added time '+ num +':00');
            let message = 'Added time '+ num +':00';
            if (sleepDeleted) {
                message += ', sleep time and wake time deleted';
            }
            bot.sendMessage(chatId, message);
            saveData();
        } else {
            bot.sendMessage(chatId, match[3]+' is an invalid time, 0-23 expected');
        }
    } else {
        bot.sendMessage(chatId, 'Usage: /addhour [0-23]');
    }
});

bot.onText(/^\/delhour(@sticker_time_bot)?(\s+([^\s]+))?$/, (msg, match) => {
    const chatId = msg.chat.id;
    // bot.sendMessage(chatId, match[0]+'  '+match[1]+'  '+match[2]+'  '+match[3])
    if (match[3]) {
        const num = parseInt(match[3], 10);
        if (num <= 23 && num >= 0){
            if (chatId in data.timelist) {
                const index = data.timelist[chatId].indexOf(num);
                if (index > -1) {
                    data.timelist[chatId].splice(index, 1);
                    let message = 'Deleted time '+ num +':00';
                    if (data.timelist[chatId].length == 0) {
                        delete data.timelist[chatId];
                        message += ', list of hours deleted';
                    }
                    logger.info(chatId + ' deleted time '+ num +':00');
                    bot.sendMessage(chatId, message);
                    saveData();
                    return;
                }
            }
            bot.sendMessage(chatId, 'Time '+ num +':00 not added');
        } else {
            bot.sendMessage(chatId, match[3]+' is an invalid time, 0-23 expected');
        }
    } else {
        bot.sendMessage(chatId, 'Usage: /delhour [0-23]');
    }
});

bot.onText(/^\/listhours/, (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId in data.timelist) {
        const list = data.timelist[chatId];
        let str = '';
        for (let i = 0; i < list.length; i++) {
            str += list[i] + ':00\n';
        }
        bot.sendMessage(chatId, 'List of hours:\n'+str);
    } else {
        bot.sendMessage(chatId, 'No hours added');
    }
});

bot.onText(/^\/clearhours/, (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId in data.timelist) {
        delete data.timelist[chatId];
        logger.info(chatId + ' deleted list of hours');
        bot.sendMessage(chatId, 'Successfully deleted list of hours');
    } else {
        bot.sendMessage(chatId, 'No hours added');
    }
});


bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;
    let index = data.chatids.indexOf(chatId);
    if (index > -1) {
        data.chatids.splice(index, 1);
        delete data.lastid[chatId];
        saveData();
    } else {
        bot.sendMessage(chatId, 'Not started, chat ID: ' + chatId);
        return;
    }
    logger.info(chatId + ' stopped');
    bot.sendMessage(chatId, 'Stopped, chat ID: ' + chatId);
});

// bot.on('sticker', (msg) => {
    // const chatId = msg.chat.id;
    // logger.info('[' + chatId + '] ' + msg.sticker.file_id);
// });

bot.on('polling_error', (error) => {
    logger.error('[polling_error] ' + error.code);  // => 'EFATAL'
});

bot.on('webhook_error', (error) => {
    logger.error('[webhook_error] ' + error.code);  // => 'EPARSE'
});

const limiter = new Bottleneck({
    maxConcurrent: 30,
    minTime: 33
});

const cron = new CronJob('0 * * * *', function() {
    const date = new Date();
    let chatsSent = 0;
    data.chatids.forEach(function (id) {
        let tz = data.tzmap[id];
        if (!tz) {
            tz = 'Asia/Shanghai';
        }
        let hour = moment().tz(tz).hours();

        if (id in data.sleeptime && id in data.waketime) {
            let sleep = data.sleeptime[id];
            let wake = data.waketime[id];
            if (sleep < wake) {
                if (hour > sleep && hour < wake) return;
            }
            if (sleep > wake) {
                if (hour > sleep || hour < wake) return;
            }
        }
        if (id in data.timelist) {
            if (data.timelist[id].indexOf(hour) === -1) {
                return;
            }
        }
        logger.debug('Send to ' + id);
        limiter.schedule(() => bot.sendSticker(id, stickers[hour % 12])).then(message => {
            let cid = message.chat.id;
            let mid = message.message_id;
            if (data.autodelete[cid] && data.lastid[cid]) {
                bot.deleteMessage(cid, data.lastid[cid]);
            }
            data.lastid[cid] = mid;
            saveData();
        }).catch(error => {
            let query = error.response.request.uri.query;
            let matches = query.match(/chat_id=(.*)&/);
            if (matches && matches[1]) {
                let cid = Number(matches[1]);
                if (isNaN(cid)) {
                    // Channel name
                    cid = matches[1];
                    cid = cid.replace('%40', '@');
                }
                logger.error('[' + error.response.body.error_code + '](' + cid + ')' + error.response.body.description);  // => 'ETELEGRAM'
                if (query && (error.response.body.error_code === 403 || error.response.body.error_code === 400) &&
                (error.response.body.description.includes('blocked') ||
                    error.response.body.description.includes('kicked') ||
                    error.response.body.description.includes('not a member') ||
                    error.response.body.description.includes('chat not found') ||
                    error.response.body.description.includes('upgraded') ||
                    error.response.body.description.includes('deactivated') ||
                    error.response.body.description.includes('not enough rights') ||
                    error.response.body.description.includes('have no rights') ||
                    error.response.body.description.includes('initiate conversation') ||
                    error.response.body.description.includes('CHAT_SEND_STICKERS_FORBIDDEN') ||
                    error.response.body.description.includes('CHAT_RESTRICTED') ||
                    error.response.body.description.includes('was deleted') ||
                    error.response.body.description.includes('PEER_ID_INVALID'))) {
                    logger.info('Blocked by ' + cid);
                    let index = data.chatids.indexOf(cid);
                    if (index > -1) {
                        data.chatids.splice(index, 1);
                        delete data.tzmap[cid];
                        delete data.lastid[cid];
                        delete data.autodelete[cid];
                        delete data.sleeptime[cid];
                        delete data.waketime[cid];
                        delete data.timelist[cid];
                        saveData();
                    }
                }
            }
        });
        chatsSent++;
    });
    logger.info('Cron triggered. Send stickers to ' + chatsSent + '/' + data.chatids.length + ' chats');
}, null, true, 'Asia/Shanghai');
