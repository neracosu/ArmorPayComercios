/**
 * PM2 — ArmorPay Cloud.
 *
 * Dos procesos separados a propósito: si el gateway se cae, el panel sigue en
 * pie (y al revés). El gateway no expone HTTP; es un bucle que lee la base del
 * sistema viejo y entrega al panel.
 *
 * TZ Caracas en los dos: las horas de los pagos y los cierres de turno son
 * hora local de Venezuela, y el proceso no debe depender del TZ del servidor.
 */
module.exports = {
  apps: [
    {
      name: "armorpay-cloud",
      cwd: "/home/mardenli/armorpay-cloud",
      script: "./node_modules/next/dist/bin/next",
      // Bind estricto a loopback: Apache hace el reverse proxy.
      args: "start -p 3101 -H 127.0.0.1",
      env: { NODE_ENV: "production", TZ: "America/Caracas" },
      max_memory_restart: "500M",
    },
    {
      name: "armorpay-gateway",
      cwd: "/home/mardenli/armorpay-cloud",
      script: "./node_modules/.bin/tsx",
      args: "--env-file=.env gateway/index.ts",
      env: { NODE_ENV: "production", TZ: "America/Caracas" },
      max_memory_restart: "300M",
      // Si muere, que vuelva — pero sin loop infinito si el fallo es de arranque.
      restart_delay: 5000,
      max_restarts: 20,
    },
  ],
};
