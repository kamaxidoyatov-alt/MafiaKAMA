module.exports = {
  apps: [{
    name: 'mongodb',
    script: './mongodb/mongodb-win32-x86_64-windows-8.0.26/bin/mongod.exe',
    cwd: __dirname,
    args: '--dbpath ./mongodb/data --logpath ./mongodb/log/mongod.log --port 27017 --bind_ip 127.0.0.1',
    watch: false,
    autorestart: true,
    max_restarts: 5,
    restart_delay: 3000,
    error_file: 'logs/mongodb-error.log',
    out_file: 'logs/mongodb-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }, {
    name: 'mafia-bot',
    script: 'src/index.js',
    cwd: __dirname,
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    env: {
      NODE_ENV: 'production',
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }]
};
