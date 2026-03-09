import { createDaemonServer } from "./http-server.js";

const daemon = createDaemonServer();

daemon
  .start()
  .then(() => {
    const address = daemon.address();

    if (address) {
      console.info(
        `daemon listening on http://${address.address}:${address.port}`
      );
    }
  })
  .catch((error) => {
    console.error("daemon failed to start", error);
    process.exitCode = 1;
  });
