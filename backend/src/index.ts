import express from "express";

const app = express();
const port = 3000;

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ message: "Backend de Assista conectado" });
});

app.listen(port, () => {
  console.log(`API de Assista en http://localhost:${port}`);
});
