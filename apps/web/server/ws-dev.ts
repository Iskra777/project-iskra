import "dotenv/config";

import { createWsServer } from "./ws-server";

const port = Number(process.env.WS_PORT ?? 4001);

createWsServer(port).then(() => {
  console.log(`WS-сервер слухає на порту ${port}`);
});
