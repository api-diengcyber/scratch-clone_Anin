// PM2 process manager untuk backend.
// Jalankan dari folder backend:
//   pm2 start deploy/ecosystem.config.js
//   pm2 save
//   pm2 startup
//
// PENTING: SQLite hanya boleh satu proses. Jangan ubah instances > 1.

module.exports = {
    apps: [
        {
            name: "dcc-backend",
            cwd: __dirname + "/..",
            script: "server.js",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            max_memory_restart: "400M",
            time: true,
            env: {
                NODE_ENV: "production"
            }
        }
    ]
};
