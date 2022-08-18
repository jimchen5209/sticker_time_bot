module.exports = {
    apps: [{
        name: 'sticker-time-bot',
        script: 'index.js',
        // Options reference: https://pm2.keymetrics.io/docs/usage/application-declaration/
        // args: 'one two',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '512M',
        env_production: {
            NODE_ENV: 'production'
        }
    }]
};