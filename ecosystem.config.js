module.exports = {
    apps: [
        {
            name: "Crazyrace",
            script: "node_modules/next/dist/bin/next",
            args: "start -p 3006",
            cwd: "./",
            exec_mode: "cluster",
            instances: "2",
            autorestart: true,
            watch: false,
            max_memory_restart: "3G",
            env: {
                NODE_ENV: "production",
            }
        }
    ]
}