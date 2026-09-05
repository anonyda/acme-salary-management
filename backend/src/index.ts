import { createApp } from "./app.js";
import { createConnection } from "./db/connection.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const DB_PATH = process.env.DB_PATH ?? "./data/acme.sqlite";

const db = createConnection(DB_PATH);
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`acme-salary-management backend listening on port ${PORT}`);
});
