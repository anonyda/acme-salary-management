import { createApp } from "./app.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = createApp();

app.listen(PORT, () => {
  console.log(`acme-salary-management backend listening on port ${PORT}`);
});
