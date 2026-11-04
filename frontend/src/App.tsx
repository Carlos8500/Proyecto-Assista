import { useEffect, useState } from "react";

export default function App() {
  const [message, setMessage] = useState("Conectando con la API…");

  useEffect(() => {
    async function checkApi() {
      try {
        const response = await fetch("/api/health");

        if (!response.ok) {
          throw new Error("La API no respondió correctamente");
        }

        const data = await response.json();
        setMessage(data.message);
      } catch {
        setMessage("No se pudo conectar con la API");
      }
    }

    void checkApi();
  }, []);

  return (
    <main>
      <h1>Assista</h1>
      <p>{message}</p>
    </main>
  );
}
