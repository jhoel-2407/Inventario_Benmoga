// Configuración de PM2 para producción.
// Uso:
//   npm install -g pm2          ← instalar PM2 una sola vez
//   pm2 start ecosystem.config.cjs
//   pm2 save                    ← guardar lista de procesos
//   pm2 startup                 ← auto-arranque al reiniciar el servidor
//
// Comandos útiles:
//   pm2 status                  ← ver estado de procesos
//   pm2 logs levis-inventario   ← ver logs en tiempo real
//   pm2 restart levis-inventario
//   pm2 stop levis-inventario

module.exports = {
  apps: [
    {
      name: "levis-inventario",
      script: "src/server.js",

      // Node.js ESM requiere esta flag
      node_args: "--experimental-vm-modules --max-old-space-size=4096",

      // Reinicia automáticamente si el proceso cae
      autorestart: true,

      // Reinicia si supera 500 MB de RAM (protección contra memory leak)
      max_memory_restart: "2G",

      // Tiempo máximo de espera para un reinicio limpio (ms)
      kill_timeout: 5000,

      // Variables de entorno para producción
      // (PM2 carga el .env con dotenv, pero puedes sobrescribir aquí)
      env_production: {
        NODE_ENV: "production",
      },

      env_development: {
        NODE_ENV: "development",
      },

      // Logs con timestamp
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      // No usar cluster mode: la app usa WebSockets con estado en memoria,
      // cluster mode requeriría un bus de eventos compartido (Redis) para que
      // los sockets de distintas instancias se comuniquen. Una sola instancia
      // es suficiente para el volumen de la tienda.
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
